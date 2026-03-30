"""Routes gestion des utilisateurs — admin only"""
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.database import get_db
from db import models as db_models
from services.auth import get_password_hash, require_admin, get_online_user_ids, clear_presence

router = APIRouter(prefix="/api/users", tags=["users"])


def _user_dict(u: db_models.User, online_ids: set = None) -> dict:
    return {
        "id": u.id,
        "username": u.username,
        "first_name": u.first_name,
        "last_name": u.last_name,
        "email": u.email,
        "is_admin": u.is_admin,
        "is_active": u.is_active,
        "email_notifications": u.email_notifications,
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "is_online": (u.id in online_ids) if online_ids is not None else False,
    }


class UserCreate(BaseModel):
    username: str
    first_name: str
    last_name: str
    email: str
    password: str
    is_admin: bool = False
    email_notifications: bool = True


class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    is_admin: Optional[bool] = None
    is_active: Optional[bool] = None
    email_notifications: Optional[bool] = None


@router.get("")
def list_users(db: Session = Depends(get_db), _=Depends(require_admin)):
    online_ids = get_online_user_ids()
    return [_user_dict(u, online_ids) for u in db.query(db_models.User).all()]


@router.post("")
def create_user(data: UserCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    if db.query(db_models.User).filter(db_models.User.username == data.username).first():
        raise HTTPException(status_code=400, detail="Identifiant déjà utilisé")
    if db.query(db_models.User).filter(db_models.User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email déjà utilisé")
    user = db_models.User(
        username=data.username,
        first_name=data.first_name,
        last_name=data.last_name,
        email=data.email,
        hashed_password=get_password_hash(data.password),
        is_admin=data.is_admin,
        email_notifications=data.email_notifications,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _user_dict(user)


@router.patch("/{user_id}")
def update_user(user_id: int, data: UserUpdate, db: Session = Depends(get_db), _=Depends(require_admin)):
    user = db.query(db_models.User).filter(db_models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if data.first_name is not None:
        user.first_name = data.first_name
    if data.last_name is not None:
        user.last_name = data.last_name
    if data.email is not None:
        user.email = data.email
    if data.password:
        user.hashed_password = get_password_hash(data.password)
    if data.is_admin is not None:
        user.is_admin = data.is_admin
    if data.is_active is not None:
        user.is_active = data.is_active
    if data.email_notifications is not None:
        user.email_notifications = data.email_notifications
    db.commit()
    return _user_dict(user)


@router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), admin=Depends(require_admin)):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Impossible de supprimer son propre compte")
    user = db.query(db_models.User).filter(db_models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    db.delete(user)
    db.commit()
    return {"success": True}


@router.post("/{user_id}/force-logout")
def force_logout(user_id: int, db: Session = Depends(get_db), admin=Depends(require_admin)):
    """Révoque tous les tokens actifs de l'utilisateur."""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Impossible de vous déconnecter vous-même")
    user = db.query(db_models.User).filter(db_models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    user.token_invalidated_at = datetime.utcnow()
    db.commit()
    clear_presence(user_id)
    return {"success": True}
