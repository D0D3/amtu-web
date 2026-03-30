"""Routes upload et scan de fichiers MP3"""
import os
import uuid
from pathlib import Path
from typing import List
from fastapi import APIRouter, UploadFile, File, HTTPException

router = APIRouter(prefix="/api/files", tags=["files"])

UPLOAD_DIR = Path("/app/uploads")
MUSIC_DIR = Path("/music")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/upload")
async def upload_files(files: List[UploadFile] = File(...)):
    """Upload MP3 files — retourne les paths pour créer un job."""
    saved_paths = []
    for file in files:
        if not file.filename.endswith('.mp3'):
            continue
        # Nom unique pour éviter collisions
        safe_name = f"{uuid.uuid4().hex}_{Path(file.filename).name}"
        dest = UPLOAD_DIR / safe_name
        content = await file.read()
        dest.write_bytes(content)
        saved_paths.append(str(dest))

    if not saved_paths:
        raise HTTPException(status_code=400, detail="Aucun fichier MP3 valide")
    return {"files": saved_paths, "count": len(saved_paths)}


@router.get("/scan")
def scan_server_folder(path: str = ""):
    """Liste les MP3 disponibles dans le volume /music."""
    root = MUSIC_DIR / path.lstrip('/') if path else MUSIC_DIR
    if not root.exists():
        return {"files": [], "folders": [], "path": str(path)}

    folders = []
    files = []

    for item in sorted(root.iterdir()):
        if item.is_dir() and not item.name.startswith('.'):
            mp3_count = sum(1 for f in item.rglob("*.mp3") if not f.name.startswith('.'))
            folders.append({"name": item.name, "path": str(item.relative_to(MUSIC_DIR)), "mp3_count": mp3_count})
        elif item.is_file() and item.suffix.lower() == '.mp3' and not item.name.startswith('.'):
            files.append({"name": item.name, "path": str(item), "size": item.stat().st_size})

    return {"files": files, "folders": folders, "path": str(path)}
