"""Routes d'authentification — login, /me"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.database import get_db
from db import models as db_models
from services.auth import verify_password, get_password_hash, create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _user_dict(user: db_models.User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "email": user.email,
        "is_admin": user.is_admin,
        "email_notifications": user.email_notifications,
    }


class LoginIn(BaseModel):
    username: str
    password: str


class MeUpdate(BaseModel):
    username: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    email_notifications: Optional[bool] = None
    password: Optional[str] = None


@router.post("/login")
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.query(db_models.User).filter(db_models.User.username == data.username).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Identifiants incorrects")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Compte désactivé")
    token = create_access_token({"sub": str(user.id)})
    return {"access_token": token, "token_type": "bearer", "user": _user_dict(user)}


@router.get("/me")
def get_me(user: db_models.User = Depends(get_current_user)):
    return _user_dict(user)


@router.patch("/me")
def update_me(
    data: MeUpdate,
    user: db_models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if data.username is not None and data.username != user.username:
        existing = db.query(db_models.User).filter(db_models.User.username == data.username).first()
        if existing:
            raise HTTPException(status_code=409, detail="Cet identifiant est déjà utilisé")
        user.username = data.username
    if data.first_name is not None:
        user.first_name = data.first_name
    if data.last_name is not None:
        user.last_name = data.last_name
    if data.email is not None:
        user.email = data.email
    if data.email_notifications is not None:
        user.email_notifications = data.email_notifications
    if data.password:
        user.hashed_password = get_password_hash(data.password)
    db.commit()
    return _user_dict(user)
