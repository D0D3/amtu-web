"""Route d'enrichissement de piste — traitement côté navigateur (File System Access API)"""
from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.database import get_db
from db import models as db_models
from core.processor import APIManager, GenreManager, TrackMetadata
from api.routes.config import _build_api_config
from services.auth import get_current_user

router = APIRouter(prefix="/api/enrich", tags=["enrich"])


class EnrichIn(BaseModel):
    title: str
    artist: str
    album: Optional[str] = ""
    current_genre: Optional[str] = ""


class EnrichOut(BaseModel):
    found: bool
    label: Optional[str] = None
    catalog: Optional[str] = None
    genre: Optional[str] = None
    album_artist: Optional[str] = None
    album: Optional[str] = None
    confidence: float = 0.0
    source: str = ""
    is_single: bool = False
    skip_reason: Optional[str] = None


@router.post("", response_model=EnrichOut)
def enrich_track(
    data: EnrichIn,
    db: Session = Depends(get_db),
    current_user: db_models.User = Depends(get_current_user),
):
    """Recherche les métadonnées d'une piste et retourne l'enrichissement sans toucher au fichier."""
    config = _build_api_config(db)
    api_manager = APIManager(config)

    # Règles globales en base
    global_rows = db.query(db_models.GenreMapping).filter(db_models.GenreMapping.user_id == None).all()
    custom = {'genres': {}, 'labels': {}, 'artists': {}}
    for row in global_rows:
        custom[f'{row.type}s'][row.source] = row.target

    # Les règles personnelles de l'utilisateur sont prioritaires
    if not current_user.is_admin:
        personal_rows = db.query(db_models.GenreMapping).filter(
            db_models.GenreMapping.user_id == current_user.id
        ).all()
        for row in personal_rows:
            custom[f'{row.type}s'][row.source] = row.target

    genre_manager = GenreManager(custom)

    try:
        results = api_manager.search_track(data.title, data.artist)
    except Exception as e:
        return EnrichOut(found=False, skip_reason=f"Erreur API : {e}")

    if not results:
        return EnrichOut(found=False, skip_reason="Aucun résultat trouvé")

    meta = results[0]

    if meta.confidence < 60:
        return EnrichOut(
            found=False,
            confidence=meta.confidence,
            skip_reason=f"Confiance insuffisante ({meta.confidence:.0f}%)",
        )

    if not meta.label:
        return EnrichOut(
            found=False,
            confidence=meta.confidence,
            skip_reason="Label introuvable",
        )

    # Détection genre
    meta.genre = data.current_genre or None
    detected_genre = genre_manager.detect_genre(meta)

    # Nettoyage "- Single"
    album = meta.album or data.album or ""
    is_single = bool(album) and album.lower().rstrip().endswith('- single')
    if is_single:
        import re
        album = re.sub(r'\s*-\s*single\s*$', '', album, flags=re.IGNORECASE).strip()

    # Album artist = premier artiste (logique originale AMTU)
    album_artist = data.artist.split('&')[0].split(',')[0].strip() if data.artist else None

    return EnrichOut(
        found=True,
        label=meta.label,
        catalog=meta.catalog_number,
        genre=detected_genre,
        album_artist=album_artist,
        album=album if album != (data.album or "") else None,
        confidence=meta.confidence,
        source=meta.source,
        is_single=is_single,
    )
