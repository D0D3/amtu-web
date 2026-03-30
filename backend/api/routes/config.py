"""Routes config API — tokens, services enablement"""
import os
import smtplib
from datetime import datetime
from email.mime.text import MIMEText
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.database import get_db
from db import models as db_models
from core.processor import APIManager
from services.auth import require_admin

router = APIRouter(prefix="/api/config", tags=["config"])

SECRET_KEY = os.getenv("SECRET_KEY", "amtu-default-secret-change-me")


def _encrypt(value: str) -> str:
    if not value:
        return ""
    try:
        from cryptography.fernet import Fernet
        import base64, hashlib
        key = base64.urlsafe_b64encode(hashlib.sha256(SECRET_KEY.encode()).digest())
        f = Fernet(key)
        return f.encrypt(value.encode()).decode()
    except Exception:
        return value  # fallback sans chiffrement si lib absente


def _decrypt(value: str) -> str:
    if not value:
        return ""
    try:
        from cryptography.fernet import Fernet
        import base64, hashlib
        key = base64.urlsafe_b64encode(hashlib.sha256(SECRET_KEY.encode()).digest())
        f = Fernet(key)
        return f.decrypt(value.encode()).decode()
    except Exception:
        return value


class ConfigIn(BaseModel):
    spotify_client_id: Optional[str] = ""
    spotify_client_secret: Optional[str] = ""
    discogs_token: Optional[str] = ""
    musicbrainz_enabled: bool = True
    spotify_enabled: bool = False
    discogs_enabled: bool = False
    # SMTP
    smtp_enabled: bool = False
    smtp_host: Optional[str] = ""
    smtp_port: int = 587
    smtp_user: Optional[str] = ""
    smtp_password: Optional[str] = ""
    smtp_from: Optional[str] = ""
    smtp_tls: bool = True
    max_genre_snapshots: int = 3


class ConfigOut(BaseModel):
    spotify_client_id: str
    spotify_client_secret_set: bool
    discogs_token_set: bool
    musicbrainz_enabled: bool
    spotify_enabled: bool
    discogs_enabled: bool
    smtp_enabled: bool
    smtp_host: str
    smtp_port: int
    smtp_user: str
    smtp_password_set: bool
    smtp_from: str
    smtp_tls: bool
    max_genre_snapshots: int


def _get_or_create_config(db: Session) -> db_models.Config:
    cfg = db.query(db_models.Config).filter(db_models.Config.id == 1).first()
    if not cfg:
        cfg = db_models.Config(id=1)
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


@router.get("", response_model=ConfigOut)
def get_config(db: Session = Depends(get_db), _=Depends(require_admin)):
    cfg = _get_or_create_config(db)
    return ConfigOut(
        spotify_client_id=cfg.spotify_client_id or "",
        spotify_client_secret_set=bool(cfg.spotify_client_secret_enc),
        discogs_token_set=bool(cfg.discogs_token_enc),
        musicbrainz_enabled=cfg.musicbrainz_enabled,
        spotify_enabled=cfg.spotify_enabled,
        discogs_enabled=cfg.discogs_enabled,
        smtp_enabled=cfg.smtp_enabled or False,
        smtp_host=cfg.smtp_host or "",
        smtp_port=cfg.smtp_port or 587,
        smtp_user=cfg.smtp_user or "",
        smtp_password_set=bool(cfg.smtp_password_enc),
        smtp_from=cfg.smtp_from or "",
        smtp_tls=cfg.smtp_tls if cfg.smtp_tls is not None else True,
        max_genre_snapshots=cfg.max_genre_snapshots if cfg.max_genre_snapshots is not None else 3,
    )


@router.post("")
def save_config(data: ConfigIn, db: Session = Depends(get_db), _=Depends(require_admin)):
    cfg = _get_or_create_config(db)
    cfg.spotify_client_id = data.spotify_client_id or cfg.spotify_client_id
    if data.spotify_client_secret:
        cfg.spotify_client_secret_enc = _encrypt(data.spotify_client_secret)
    if data.discogs_token:
        cfg.discogs_token_enc = _encrypt(data.discogs_token)
    cfg.musicbrainz_enabled = data.musicbrainz_enabled
    cfg.spotify_enabled = data.spotify_enabled
    cfg.discogs_enabled = data.discogs_enabled
    # SMTP
    cfg.smtp_enabled = data.smtp_enabled
    cfg.smtp_host = data.smtp_host or cfg.smtp_host
    cfg.smtp_port = data.smtp_port
    cfg.smtp_user = data.smtp_user or cfg.smtp_user
    if data.smtp_password:
        cfg.smtp_password_enc = _encrypt(data.smtp_password)
    cfg.smtp_from = data.smtp_from or cfg.smtp_from
    cfg.smtp_tls = data.smtp_tls
    if data.max_genre_snapshots >= 3:
        cfg.max_genre_snapshots = data.max_genre_snapshots
    cfg.updated_at = datetime.utcnow()
    db.commit()
    return {"success": True}


def _build_api_config(db: Session) -> dict:
    cfg = _get_or_create_config(db)
    return {
        'spotify_client_id': cfg.spotify_client_id or "",
        'spotify_client_secret': _decrypt(cfg.spotify_client_secret_enc),
        'discogs_token': _decrypt(cfg.discogs_token_enc),
        'services': {
            'musicbrainz': cfg.musicbrainz_enabled,
            'spotify': cfg.spotify_enabled,
            'discogs': cfg.discogs_enabled,
        }
    }


@router.get("/status")
def get_api_status(db: Session = Depends(get_db)):
    """Teste la connexion aux APIs configurées — appelé au chargement de la page."""
    config = _build_api_config(db)
    manager = APIManager(config)
    return manager.get_status()


@router.post("/test")
def test_apis(db: Session = Depends(get_db), _=Depends(require_admin)):
    config = _build_api_config(db)
    manager = APIManager(config)
    return manager.get_status()


@router.post("/test-email")
def test_email(db: Session = Depends(get_db), admin: db_models.User = Depends(require_admin)):
    """Envoie un email de test à l'adresse de l'administrateur pour valider la config SMTP."""
    smtp_cfg = _build_smtp_config(db)
    if not smtp_cfg.get('enabled'):
        raise HTTPException(status_code=400, detail="Les notifications email sont désactivées")
    if not smtp_cfg.get('host'):
        raise HTTPException(status_code=400, detail="Serveur SMTP non configuré (sauvegardez d'abord)")

    try:
        msg = MIMEText(
            "Ceci est un email de test envoyé par AMTU.\n\n"
            "La configuration SMTP fonctionne correctement.",
            'plain', 'utf-8'
        )
        msg['Subject'] = "[AMTU] Test de configuration email"
        msg['From'] = smtp_cfg.get('from') or smtp_cfg.get('user', 'amtu@localhost')
        msg['To'] = admin.email

        host = smtp_cfg['host']
        port = smtp_cfg.get('port', 587)
        user = smtp_cfg.get('user', '')
        password = smtp_cfg.get('password', '')

        if smtp_cfg.get('tls', True):
            with smtplib.SMTP(host, port, timeout=10) as server:
                server.starttls()
                if user:
                    server.login(user, password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=10) as server:
                if user:
                    server.login(user, password)
                server.send_message(msg)

        return {"success": True, "message": f"Email de test envoyé à {admin.email}"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur SMTP : {str(e)}")


def _build_smtp_config(db: Session) -> dict:
    cfg = _get_or_create_config(db)
    return {
        'enabled': cfg.smtp_enabled or False,
        'host': cfg.smtp_host or "",
        'port': cfg.smtp_port or 587,
        'user': cfg.smtp_user or "",
        'password': _decrypt(cfg.smtp_password_enc) if cfg.smtp_password_enc else "",
        'from': cfg.smtp_from or "",
        'tls': cfg.smtp_tls if cfg.smtp_tls is not None else True,
    }
