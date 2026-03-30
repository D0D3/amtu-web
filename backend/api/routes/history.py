"""Routes historique des morceaux traités"""
import csv
import io
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import desc

from db.database import get_db
from db import models as db_models
from services.auth import get_current_user

router = APIRouter(prefix="/api/history", tags=["history"])


class HistoryEntryIn(BaseModel):
    file_name: str
    status: str
    dry_run: bool = False
    confidence: float = 0.0
    source_api: str = ""
    title_before: str = ""
    artist_before: str = ""
    album_before: str = ""
    label_before: str = ""
    genre_before: str = ""
    label_after: str = ""
    catalog_after: str = ""
    genre_after: str = ""
    album_after: str = ""
    skip_reason: str = ""
    error_message: str = ""


@router.post("/batch")
def save_history_batch(
    entries: List[HistoryEntryIn],
    db: Session = Depends(get_db),
    current_user: db_models.User = Depends(get_current_user),
):
    """Sauvegarde les résultats d'un traitement côté client (Dashboard local)."""
    for e in entries:
        row = db_models.History(
            file_name=e.file_name,
            status=e.status,
            dry_run=e.dry_run,
            confidence=e.confidence,
            source_api=e.source_api,
            title_before=e.title_before,
            artist_before=e.artist_before,
            album_before=e.album_before,
            label_before=e.label_before,
            genre_before=e.genre_before,
            label_after=e.label_after,
            catalog_after=e.catalog_after,
            genre_after=e.genre_after,
            album_after=e.album_after,
            skip_reason=e.skip_reason,
            error_message=e.error_message,
            created_by=current_user.id,
            username=current_user.username,
        )
        db.add(row)
    db.commit()
    return {"saved": len(entries)}


def _history_to_dict(r) -> dict:
    return {
        "id": r.id,
        "job_id": r.job_id,
        "file_name": r.file_name,
        "status": r.status,
        "confidence": r.confidence,
        "source_api": r.source_api,
        "artist": r.artist_before,
        "album": r.album_before,
        "label": r.label_after,
        "genre": r.genre_after,
        "processed_at": r.processed_at.isoformat() if r.processed_at else None,
        "before": {
            "label": r.label_before, "genre": r.genre_before,
            "album": r.album_before, "catalog": r.catalog_before,
        },
        "after": {
            "label": r.label_after, "genre": r.genre_after,
            "album": r.album_after, "catalog": r.catalog_after,
        },
        "skip_reason": r.skip_reason,
        "error_message": r.error_message,
        "dry_run": r.dry_run or False,
        "created_by": r.created_by,
        "username": r.username or "",
    }


@router.get("")
def get_history(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, le=200),
    status: str = Query(None),
    artist: str = Query(None),
    source_api: str = Query(None),
    user_id: Optional[int] = Query(None),  # admin only
    db: Session = Depends(get_db),
    current_user: db_models.User = Depends(get_current_user),
):
    query = db.query(db_models.History)

    # Filtrage par propriétaire
    if current_user.is_admin:
        if user_id is not None:
            query = query.filter(db_models.History.created_by == user_id)
    else:
        query = query.filter(db_models.History.created_by == current_user.id)

    if status:
        query = query.filter(db_models.History.status == status)
    if artist:
        query = query.filter(db_models.History.artist_before.ilike(f"%{artist}%"))
    if source_api:
        query = query.filter(db_models.History.source_api == source_api)

    total = query.count()
    items = query.order_by(desc(db_models.History.processed_at)).offset((page - 1) * per_page).limit(per_page).all()

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "items": [_history_to_dict(r) for r in items],
    }


@router.delete("/{history_id}")
def delete_history_entry(
    history_id: int,
    db: Session = Depends(get_db),
    current_user: db_models.User = Depends(get_current_user),
):
    query = db.query(db_models.History).filter(db_models.History.id == history_id)
    if not current_user.is_admin:
        query = query.filter(db_models.History.created_by == current_user.id)
    entry = query.first()
    if entry:
        db.delete(entry)
        db.commit()
    return {"success": True}


@router.delete("")
def clear_history(
    user_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: db_models.User = Depends(get_current_user),
):
    query = db.query(db_models.History)
    if current_user.is_admin:
        if user_id is not None:
            query = query.filter(db_models.History.created_by == user_id)
        # sinon vide tout
    else:
        query = query.filter(db_models.History.created_by == current_user.id)
    query.delete()
    db.commit()
    return {"success": True}


@router.get("/export")
def export_history(
    db: Session = Depends(get_db),
    current_user: db_models.User = Depends(get_current_user),
):
    query = db.query(db_models.History)
    if not current_user.is_admin:
        query = query.filter(db_models.History.created_by == current_user.id)
    items = query.order_by(desc(db_models.History.processed_at)).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        'file_name', 'status', 'confidence', 'source_api',
        'artist', 'album', 'label_before', 'label_after',
        'genre_before', 'genre_after', 'skip_reason', 'error', 'processed_at', 'username'
    ])
    for r in items:
        writer.writerow([
            r.file_name, r.status, r.confidence, r.source_api,
            r.artist_before, r.album_before, r.label_before, r.label_after,
            r.genre_before, r.genre_after, r.skip_reason, r.error_message,
            r.processed_at.isoformat() if r.processed_at else '',
            r.username or '',
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=amtu_history.csv"}
    )
