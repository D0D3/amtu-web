"""Routes éditeur de genres — labels, artistes, mappings"""
import json
from datetime import datetime
from typing import Optional, Dict
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.database import get_db
from db import models as db_models
from core.processor import GenreManager
from services.auth import get_current_user, require_admin

router = APIRouter(prefix="/api/genres", tags=["genres"])


def _seed_defaults(db: Session):
    """Peuple les genres globaux par défaut si la table est vide."""
    if db.query(db_models.GenreMapping).filter(db_models.GenreMapping.user_id == None).count() > 0:
        return
    gm = GenreManager()
    defaults = gm.get_all_mappings()
    entries = []
    for source, target in defaults['genres'].items():
        entries.append(db_models.GenreMapping(type='genre', source=source, target=target, user_id=None))
    for source, target in defaults['labels'].items():
        entries.append(db_models.GenreMapping(type='label', source=source, target=target, user_id=None))
    for source, target in defaults['artists'].items():
        entries.append(db_models.GenreMapping(type='artist', source=source, target=target, user_id=None))
    db.add_all(entries)
    db.commit()


def _row_to_dict(row: db_models.GenreMapping, current_user: db_models.User) -> dict:
    is_global = row.user_id is None
    is_mine = is_global if current_user.is_admin else (row.user_id == current_user.id)
    return {
        'id': row.id,
        'source': row.source,
        'target': row.target,
        'is_mine': is_mine,
        'is_global': is_global,
    }


@router.get("/mappings")
def get_all_mappings(
    db: Session = Depends(get_db),
    current_user: db_models.User = Depends(get_current_user),
):
    _seed_defaults(db)

    result = {'genres': [], 'labels': [], 'artists': []}

    # Règles personnelles de l'utilisateur (non-admin seulement)
    if not current_user.is_admin:
        personal_rows = db.query(db_models.GenreMapping).filter(
            db_models.GenreMapping.user_id == current_user.id
        ).all()
        for r in personal_rows:
            key = r.type + 's'
            if key in result:
                result[key].append(_row_to_dict(r, current_user))

    # Règles globales (pour tout le monde)
    global_rows = db.query(db_models.GenreMapping).filter(
        db_models.GenreMapping.user_id == None
    ).all()
    for r in global_rows:
        key = r.type + 's'
        if key in result:
            result[key].append(_row_to_dict(r, current_user))

    return result


class MappingItem(BaseModel):
    type: str   # genre | label | artist
    source: str
    target: str


@router.post("/mappings")
def add_mapping(
    item: MappingItem,
    db: Session = Depends(get_db),
    current_user: db_models.User = Depends(get_current_user),
):
    # Admins créent des règles globales, les autres créent des règles personnelles
    user_id = None if current_user.is_admin else current_user.id
    entry = db_models.GenreMapping(
        type=item.type,
        source=item.source.lower(),
        target=item.target,
        user_id=user_id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _row_to_dict(entry, current_user)


class MappingUpdate(BaseModel):
    source: Optional[str] = None
    target: Optional[str] = None


@router.put("/mappings/{mapping_id}")
def update_mapping(
    mapping_id: int,
    item: MappingUpdate,
    db: Session = Depends(get_db),
    current_user: db_models.User = Depends(get_current_user),
):
    entry = db.query(db_models.GenreMapping).filter(db_models.GenreMapping.id == mapping_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Mapping introuvable")

    if current_user.is_admin:
        if entry.user_id is not None:
            raise HTTPException(status_code=403, detail="Les admins ne gèrent que les règles globales")
    else:
        if entry.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Vous ne pouvez modifier que vos propres règles")

    if item.source is not None:
        entry.source = item.source.lower()
    if item.target is not None:
        entry.target = item.target
    entry.updated_at = datetime.utcnow()
    db.commit()
    return {"success": True}


@router.delete("/mappings/{mapping_id}")
def delete_mapping(
    mapping_id: int,
    db: Session = Depends(get_db),
    current_user: db_models.User = Depends(get_current_user),
):
    entry = db.query(db_models.GenreMapping).filter(db_models.GenreMapping.id == mapping_id).first()
    if not entry:
        return {"success": True}

    if current_user.is_admin:
        if entry.user_id is not None:
            raise HTTPException(status_code=403, detail="Les admins ne gèrent que les règles globales")
    else:
        if entry.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Vous ne pouvez supprimer que vos propres règles")

    db.delete(entry)
    db.commit()
    return {"success": True}


# ─── Helpers snapshots ────────────────────────────────────────────────────────

def _current_global_data(db: Session) -> dict:
    """Retourne les mappings globaux actuels sous forme de dict exportable."""
    rows = db.query(db_models.GenreMapping).filter(db_models.GenreMapping.user_id == None).all()
    data: dict = {"genres": {}, "labels": {}, "artists": {}}
    for r in rows:
        key = r.type + "s"  # genre→genres, label→labels, artist→artists
        if key in data:
            data[key][r.source] = r.target
    return data


def _apply_data_to_global(data: dict, db: Session, admin: db_models.User):
    """Remplace tous les mappings globaux par ceux fournis dans data."""
    db.query(db_models.GenreMapping).filter(db_models.GenreMapping.user_id == None).delete()
    entries = []
    type_map = {"genres": "genre", "labels": "label", "artists": "artist"}
    for key, type_name in type_map.items():
        for source, target in (data.get(key) or {}).items():
            entries.append(db_models.GenreMapping(
                type=type_name,
                source=str(source).lower(),
                target=str(target),
                user_id=None,
            ))
    db.add_all(entries)


def _create_snapshot(db: Session, admin: db_models.User, action: str) -> db_models.GenreSnapshot:
    """Crée un snapshot de l'état courant des mappings globaux."""
    data = _current_global_data(db)
    snap = db_models.GenreSnapshot(
        data=json.dumps(data, ensure_ascii=False),
        action=action,
        created_by=admin.id,
        username=admin.username,
    )
    db.add(snap)
    db.flush()  # obtenir l'id avant commit
    return snap


def _prune_snapshots(db: Session, max_keep: int):
    """Supprime les snapshots excédentaires (garde les N plus récents)."""
    all_snaps = db.query(db_models.GenreSnapshot).order_by(db_models.GenreSnapshot.created_at.desc()).all()
    to_delete = all_snaps[max_keep:]
    for s in to_delete:
        db.delete(s)


def _get_max_snapshots(db: Session) -> int:
    cfg = db.query(db_models.Config).filter(db_models.Config.id == 1).first()
    val = cfg.max_genre_snapshots if cfg and cfg.max_genre_snapshots else 3
    return max(3, val)


def _log_audit(db: Session, action: str, admin: db_models.User, details: str, snapshot_id: Optional[int] = None):
    entry = db_models.GenreAuditLog(
        action=action,
        user_id=admin.id,
        username=admin.username,
        details=details,
        snapshot_id=snapshot_id,
    )
    db.add(entry)


# ─── Export ───────────────────────────────────────────────────────────────────

@router.get("/export")
def export_mappings(
    db: Session = Depends(get_db),
    admin: db_models.User = Depends(require_admin),
):
    """Exporte les mappings globaux en JSON (téléchargement)."""
    data = _current_global_data(db)
    counts = {k: len(v) for k, v in data.items()}
    _log_audit(db, "export", admin, f"{counts['labels']} labels, {counts['artists']} artistes, {counts['genres']} aliases exportés")
    db.commit()
    content = json.dumps(data, ensure_ascii=False, indent=2)
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=amtu_genre_mappings.json"},
    )


# ─── Import ───────────────────────────────────────────────────────────────────

class ImportData(BaseModel):
    genres: Dict[str, str] = {}
    labels: Dict[str, str] = {}
    artists: Dict[str, str] = {}


@router.post("/import")
def import_mappings(
    data: ImportData,
    db: Session = Depends(get_db),
    admin: db_models.User = Depends(require_admin),
):
    """Remplace tous les mappings globaux. Crée un snapshot avant l'import."""
    max_keep = _get_max_snapshots(db)

    # Snapshot de l'état actuel avant écrasement
    snap = _create_snapshot(db, admin, "pre-import")

    # Application des nouvelles données
    _apply_data_to_global(data.model_dump(), db, admin)

    counts = {
        "labels": len(data.labels),
        "artists": len(data.artists),
        "genres": len(data.genres),
    }
    total = sum(counts.values())
    detail = f"{counts['labels']} labels, {counts['artists']} artistes, {counts['genres']} aliases importés ({total} total)"
    _log_audit(db, "import", admin, detail, snapshot_id=snap.id)

    _prune_snapshots(db, max_keep)
    db.commit()
    return {"success": True, "counts": counts, "snapshot_id": snap.id}


# ─── Snapshots ────────────────────────────────────────────────────────────────

@router.get("/snapshots")
def list_snapshots(
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Liste tous les snapshots disponibles (admin only)."""
    snaps = db.query(db_models.GenreSnapshot).order_by(db_models.GenreSnapshot.created_at.desc()).all()
    result = []
    for s in snaps:
        try:
            d = json.loads(s.data)
            counts = {k: len(v) for k, v in d.items()}
        except Exception:
            counts = {}
        result.append({
            "id": s.id,
            "action": s.action,
            "username": s.username,
            "counts": counts,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        })
    return result


@router.post("/snapshots/{snapshot_id}/rollback")
def rollback_snapshot(
    snapshot_id: int,
    db: Session = Depends(get_db),
    admin: db_models.User = Depends(require_admin),
):
    """Restaure un snapshot. Crée un snapshot de l'état actuel avant rollback."""
    target = db.query(db_models.GenreSnapshot).filter(db_models.GenreSnapshot.id == snapshot_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Snapshot introuvable")

    max_keep = _get_max_snapshots(db)

    # Snapshot de l'état courant avant rollback
    pre_snap = _create_snapshot(db, admin, "pre-rollback")

    # Restauration
    try:
        data = json.loads(target.data)
    except Exception:
        raise HTTPException(status_code=400, detail="Données du snapshot corrompues")

    _apply_data_to_global(data, db, admin)

    counts = {k: len(v) for k, v in data.items()}
    detail = f"Rollback vers snapshot #{target.id} du {target.created_at.strftime('%d/%m/%Y %H:%M') if target.created_at else '?'} — {counts.get('labels', 0)} labels, {counts.get('artists', 0)} artistes, {counts.get('genres', 0)} aliases restaurés"
    _log_audit(db, "rollback", admin, detail, snapshot_id=target.id)

    _prune_snapshots(db, max_keep)
    db.commit()
    return {"success": True, "counts": counts}


@router.delete("/snapshots/{snapshot_id}")
def delete_snapshot(
    snapshot_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Supprime manuellement un snapshot."""
    snap = db.query(db_models.GenreSnapshot).filter(db_models.GenreSnapshot.id == snapshot_id).first()
    if snap:
        db.delete(snap)
        db.commit()
    return {"success": True}


# ─── Audit log ────────────────────────────────────────────────────────────────

@router.get("/audit-log")
def get_audit_log(
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Journal d'audit des actions sur les mappings (admin only)."""
    entries = db.query(db_models.GenreAuditLog).order_by(db_models.GenreAuditLog.created_at.desc()).limit(200).all()
    return [
        {
            "id": e.id,
            "action": e.action,
            "username": e.username,
            "details": e.details,
            "snapshot_id": e.snapshot_id,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in entries
    ]
