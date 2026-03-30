"""JWT auth + password hashing + présence Redis"""
import os
import logging
from datetime import datetime, timedelta
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from db.database import get_db
from db import models as db_models

logger = logging.getLogger(__name__)

SECRET_KEY = os.getenv("SECRET_KEY", "amtu-default-secret-change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 8
PRESENCE_TTL = 300  # 5 minutes

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)

_redis_client = None


def _get_redis():
    global _redis_client
    if _redis_client is None:
        import redis
        _redis_client = redis.Redis(host='redis', port=6379, db=3,
                                    socket_connect_timeout=1, socket_timeout=1)
    return _redis_client


def update_presence(user_id: int) -> None:
    """Marque l'utilisateur comme en ligne (TTL 5 min)."""
    try:
        _get_redis().setex(f"online:{user_id}", PRESENCE_TTL, "1")
    except Exception:
        pass


def get_online_user_ids() -> set:
    """Retourne l'ensemble des user_id actuellement en ligne."""
    try:
        r = _get_redis()
        keys = r.keys("online:*")
        return {int(k.decode().split(":")[1]) for k in keys}
    except Exception:
        return set()


def clear_presence(user_id: int) -> None:
    """Supprime immédiatement la présence d'un utilisateur."""
    try:
        _get_redis().delete(f"online:{user_id}")
    except Exception:
        pass


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    now = datetime.utcnow()
    to_encode["iat"] = int(now.timestamp())
    to_encode["exp"] = now + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> Optional[int]:
    """Retourne user_id si token structurellement valide, None sinon."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        return int(user_id) if user_id else None
    except (JWTError, ValueError):
        return None


def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> db_models.User:
    token = None
    if credentials:
        token = credentials.credentials
    elif "token" in request.query_params:
        token = request.query_params["token"]
    if not token:
        raise HTTPException(status_code=401, detail="Non authentifié")

    user_id = verify_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Token invalide ou expiré")

    user = db.query(db_models.User).filter(db_models.User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Utilisateur introuvable ou désactivé")

    # Vérifier si la session a été révoquée
    if user.token_invalidated_at:
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            iat = payload.get("iat", 0)
            if iat < int(user.token_invalidated_at.timestamp()):
                raise HTTPException(status_code=401, detail="Session révoquée")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=401, detail="Token invalide")

    # Mettre à jour la présence
    update_presence(user.id)

    return user


def require_admin(user: db_models.User = Depends(get_current_user)) -> db_models.User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Accès administrateur requis")
    return user
