"""Routes jobs — création et suivi SSE en temps réel"""
import json
import uuid
import asyncio
from typing import Optional, List
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.database import get_db
from db import models as db_models
from api.routes.config import _build_api_config
from services.auth import get_current_user

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

UPLOAD_DIR = Path("/app/uploads")
MUSIC_DIR = Path("/music")


class JobCreate(BaseModel):
    file_paths: Optional[List[str]] = None   # fichiers uploadés (leurs paths)
    scan_path: Optional[str] = None          # dossier serveur à scanner
    dry_run: bool = False


@router.post("")
def create_job(data: JobCreate, db: Session = Depends(get_db), current_user: db_models.User = Depends(get_current_user)):
    from core.worker import process_files_task

    job_id = str(uuid.uuid4())
    file_paths = []

    if data.scan_path:
        scan_root = Path(data.scan_path)
        if not scan_root.exists():
            # Fallback : chercher dans /music
            scan_root = MUSIC_DIR / data.scan_path.lstrip('/')
        if not scan_root.exists():
            raise HTTPException(status_code=400, detail=f"Dossier introuvable: {data.scan_path}")
        file_paths = [str(f) for f in scan_root.rglob("*.mp3")
                      if not f.name.startswith('.') and not f.name.startswith('._')]
    elif data.file_paths:
        file_paths = data.file_paths

    if not file_paths:
        raise HTTPException(status_code=400, detail="Aucun fichier MP3 trouvé")

    # Créer le job en DB
    job = db_models.Job(
        id=job_id,
        status='pending',
        total_files=len(file_paths),
        source_path=data.scan_path or "upload",
        dry_run=data.dry_run,
        created_by=current_user.id,
    )
    db.add(job)
    db.commit()

    # Lancer tâche Celery
    config = _build_api_config(db)
    process_files_task.delay(job_id, file_paths, config, data.dry_run)

    return {"job_id": job_id, "total_files": len(file_paths)}


@router.get("/{job_id}")
def get_job(job_id: str, db: Session = Depends(get_db)):
    job = db.query(db_models.Job).filter(db_models.Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job introuvable")
    return {
        "id": job.id,
        "status": job.status,
        "total_files": job.total_files,
        "processed_files": job.processed_files,
        "updated_files": job.updated_files,
        "skipped_files": job.skipped_files,
        "error_files": job.error_files,
        "dry_run": job.dry_run,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
    }


@router.get("/{job_id}/stream")
async def stream_job(job_id: str):
    """SSE stream — événements temps réel via Redis Pub/Sub."""
    import redis.asyncio as aioredis

    async def event_generator():
        r = await aioredis.from_url("redis://redis:6379/2")
        pubsub = r.pubsub()
        await pubsub.subscribe(f"job:{job_id}")

        try:
            # Heartbeat pour maintenir la connexion
            heartbeat_count = 0
            async for message in pubsub.listen():
                if message['type'] == 'message':
                    data = message['data'].decode('utf-8') if isinstance(message['data'], bytes) else message['data']
                    yield f"data: {data}\n\n"

                    # Arrêter le stream si job terminé
                    try:
                        parsed = json.loads(data)
                        if parsed.get('type') in ('completed', 'error'):
                            break
                    except Exception:
                        pass

                heartbeat_count += 1
                if heartbeat_count % 10 == 0:
                    yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"

                await asyncio.sleep(0.1)
        finally:
            await pubsub.unsubscribe(f"job:{job_id}")
            await r.aclose()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )


@router.post("/{job_id}/cancel")
def cancel_job(job_id: str, db: Session = Depends(get_db)):
    job = db.query(db_models.Job).filter(db_models.Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job introuvable")
    job.status = 'cancelled'
    db.commit()
    return {"success": True}


@router.get("/{job_id}/results")
def get_job_results(job_id: str, db: Session = Depends(get_db)):
    results = db.query(db_models.History).filter(db_models.History.job_id == job_id).all()
    return [
        {
            "file_name": r.file_name,
            "status": r.status,
            "confidence": r.confidence,
            "source_api": r.source_api,
            "before": {
                "title": r.title_before, "artist": r.artist_before,
                "album": r.album_before, "label": r.label_before,
                "catalog": r.catalog_before, "genre": r.genre_before,
            },
            "after": {
                "title": r.title_after, "artist": r.artist_after,
                "album": r.album_after, "label": r.label_after,
                "catalog": r.catalog_after, "genre": r.genre_after,
            },
            "skip_reason": r.skip_reason,
            "error_message": r.error_message,
        }
        for r in results
    ]
