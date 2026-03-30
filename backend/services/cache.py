"""Cache de résultats API — accélère le retraitement des titres déjà connus."""
import re
import logging
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger(__name__)


def _normalize(text: str) -> str:
    return re.sub(r'\s+', ' ', text.lower().strip())


class CacheManager:
    """Gère le cache des résultats API en base SQLite."""

    def __init__(self, db, retention_months: int = 6):
        self.db = db
        self.retention_months = retention_months

    def get(self, title: str, artist: str):
        """Retourne un TrackMetadata depuis le cache, ou None si absent/expiré."""
        from db.models import TrackCache
        from core.processor import TrackMetadata

        key_title = _normalize(title)
        key_artist = _normalize(artist)
        now = datetime.utcnow()

        entry = self.db.query(TrackCache).filter(
            TrackCache.title_key == key_title,
            TrackCache.artist_key == key_artist,
            TrackCache.expires_at > now
        ).first()

        if not entry:
            return None

        entry.last_used_at = now
        entry.hit_count = (entry.hit_count or 0) + 1
        try:
            self.db.commit()
        except Exception:
            self.db.rollback()

        return TrackMetadata(
            title=title,
            artist=artist,
            album="",
            label=entry.label or None,
            catalog_number=entry.catalog_number or None,
            confidence=entry.confidence,
            source=entry.source_api,
            is_single=entry.is_single,
            genre=entry.genre or None,
        )

    def set(self, title: str, artist: str, metadata) -> None:
        """Sauvegarde ou met à jour une entrée dans le cache."""
        from db.models import TrackCache

        key_title = _normalize(title)
        key_artist = _normalize(artist)
        now = datetime.utcnow()
        expires = now + timedelta(days=self.retention_months * 30)

        existing = self.db.query(TrackCache).filter(
            TrackCache.title_key == key_title,
            TrackCache.artist_key == key_artist,
        ).first()

        if existing:
            existing.label = metadata.label or ""
            existing.catalog_number = metadata.catalog_number or ""
            existing.confidence = metadata.confidence
            existing.source_api = metadata.source
            existing.is_single = metadata.is_single
            existing.genre = metadata.genre or ""
            existing.expires_at = expires
            existing.last_used_at = now
        else:
            entry = TrackCache(
                title_key=key_title,
                artist_key=key_artist,
                label=metadata.label or "",
                catalog_number=metadata.catalog_number or "",
                confidence=metadata.confidence,
                source_api=metadata.source,
                is_single=metadata.is_single,
                genre=metadata.genre or "",
                expires_at=expires,
            )
            self.db.add(entry)

        try:
            self.db.commit()
        except Exception:
            self.db.rollback()

    def purge_all(self) -> int:
        """Supprime toutes les entrées du cache. Retourne le nombre supprimé."""
        from db.models import TrackCache
        count = self.db.query(TrackCache).count()
        self.db.query(TrackCache).delete()
        self.db.commit()
        return count

    def purge_expired(self) -> int:
        """Supprime les entrées expirées. Retourne le nombre supprimé."""
        from db.models import TrackCache
        now = datetime.utcnow()
        count = self.db.query(TrackCache).filter(TrackCache.expires_at <= now).count()
        self.db.query(TrackCache).filter(TrackCache.expires_at <= now).delete()
        self.db.commit()
        return count

    def stats(self) -> dict:
        """Retourne les statistiques du cache."""
        from db.models import TrackCache
        from sqlalchemy import func
        now = datetime.utcnow()
        total = self.db.query(TrackCache).count()
        active = self.db.query(TrackCache).filter(TrackCache.expires_at > now).count()
        expired = total - active
        total_hits = self.db.query(func.sum(TrackCache.hit_count)).scalar() or 0
        oldest = self.db.query(func.min(TrackCache.created_at)).scalar()
        return {
            'total': total,
            'active': active,
            'expired': expired,
            'total_hits': int(total_hits),
            'oldest_entry': oldest.isoformat() if oldest else None,
        }
