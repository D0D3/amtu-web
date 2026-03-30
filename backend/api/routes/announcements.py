"""Routes annonces admin → utilisateurs"""
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_

from db.database import get_db
from db import models as db_models
from services.auth import get_current_user, require_admin

router = APIRouter(prefix="/api/announcements", tags=["announcements"])


class AnnouncementIn(BaseModel):
    message: str
    type: str = "info"           # info | warning | error
    target_user_id: Optional[int] = None   # None = global
    expires_in_hours: Optional[int] = None  # None = pas d'expiration


def _ann_dict(a: db_models.Announcement) -> dict:
    return {
        "id": a.id,
        "message": a.message,
        "type": a.type,
        "target_user_id": a.target_user_id,
        "created_by": a.created_by,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "expires_at": a.expires_at.isoformat() if a.expires_at else None,
    }


@router.get("")
def get_announcements(
    db: Session = Depends(get_db),
    current_user: db_models.User = Depends(get_current_user),
):
    """Retourne les annonces actives pour l'utilisateur courant."""
    now = datetime.utcnow()
    query = db.query(db_models.Announcement).filter(
        or_(
            db_models.Announcement.expires_at == None,
            db_models.Announcement.expires_at > now,
        ),
        or_(
            db_models.Announcement.target_user_id == None,
            db_models.Announcement.target_user_id == current_user.id,
        )
    ).order_by(desc(db_models.Announcement.created_at))
    return [_ann_dict(a) for a in query.all()]


@router.get("/all")
def get_all_announcements(
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Admin : toutes les annonces (actives et expirées)."""
    items = db.query(db_models.Announcement).order_by(desc(db_models.Announcement.created_at)).all()
    return [_ann_dict(a) for a in items]


@router.post("")
def create_announcement(
    data: AnnouncementIn,
    db: Session = Depends(get_db),
    admin: db_models.User = Depends(require_admin),
):
    expires_at = None
    if data.expires_in_hours:
        from datetime import timedelta
        expires_at = datetime.utcnow() + timedelta(hours=data.expires_in_hours)

    ann = db_models.Announcement(
        message=data.message,
        type=data.type,
        target_user_id=data.target_user_id,
        created_by=admin.id,
        expires_at=expires_at,
    )
    db.add(ann)
    db.commit()
    db.refresh(ann)
    return _ann_dict(ann)


@router.delete("/{ann_id}")
def delete_announcement(ann_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    ann = db.query(db_models.Announcement).filter(db_models.Announcement.id == ann_id).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Annonce introuvable")
    db.delete(ann)
    db.commit()
    return {"success": True}
