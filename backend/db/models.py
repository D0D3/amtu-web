"""SQLAlchemy DB Models"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey
from db.database import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String, unique=True, nullable=False)
    first_name = Column(String, default="")
    last_name = Column(String, default="")
    email = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_admin = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    email_notifications = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Config(Base):
    __tablename__ = "config"
    id = Column(Integer, primary_key=True, default=1)
    # APIs musicales
    spotify_client_id = Column(String, default="")
    spotify_client_secret_enc = Column(String, default="")
    discogs_token_enc = Column(String, default="")
    musicbrainz_enabled = Column(Boolean, default=True)
    spotify_enabled = Column(Boolean, default=False)
    discogs_enabled = Column(Boolean, default=False)
    # SMTP
    smtp_enabled = Column(Boolean, default=False)
    smtp_host = Column(String, default="")
    smtp_port = Column(Integer, default=587)
    smtp_user = Column(String, default="")
    smtp_password_enc = Column(String, default="")
    smtp_from = Column(String, default="")
    smtp_tls = Column(Boolean, default=True)
    max_genre_snapshots = Column(Integer, default=3)
    updated_at = Column(DateTime, default=datetime.utcnow)


class Job(Base):
    __tablename__ = "jobs"
    id = Column(String, primary_key=True)
    status = Column(String, default="pending")  # pending|running|completed|failed|cancelled
    total_files = Column(Integer, default=0)
    processed_files = Column(Integer, default=0)
    updated_files = Column(Integer, default=0)
    skipped_files = Column(Integer, default=0)
    error_files = Column(Integer, default=0)
    source_path = Column(String, default="")
    dry_run = Column(Boolean, default=False)
    created_by = Column(Integer, nullable=True)  # user id
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)


class History(Base):
    __tablename__ = "history"
    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(String, ForeignKey("jobs.id"), nullable=True)
    file_path = Column(String, default="")
    file_name = Column(String, default="")
    status = Column(String, default="")  # updated|skipped|error
    confidence = Column(Float, default=0.0)
    source_api = Column(String, default="")
    # Tags AVANT
    title_before = Column(String, default="")
    artist_before = Column(String, default="")
    album_before = Column(String, default="")
    label_before = Column(String, default="")
    catalog_before = Column(String, default="")
    genre_before = Column(String, default="")
    # Tags APRÈS
    title_after = Column(String, default="")
    artist_after = Column(String, default="")
    album_after = Column(String, default="")
    label_after = Column(String, default="")
    catalog_after = Column(String, default="")
    genre_after = Column(String, default="")
    # Meta
    error_message = Column(Text, default="")
    skip_reason = Column(Text, default="")
    dry_run = Column(Boolean, default=False)
    processed_at = Column(DateTime, default=datetime.utcnow)


class GenreMapping(Base):
    __tablename__ = "genre_mappings"
    id = Column(Integer, primary_key=True, autoincrement=True)
    type = Column(String)   # genre | label | artist
    source = Column(String)
    target = Column(String)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # NULL = global/admin
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class GenreSnapshot(Base):
    """Snapshot versionné des mappings globaux — permet le rollback."""
    __tablename__ = "genre_snapshots"
    id = Column(Integer, primary_key=True, autoincrement=True)
    data = Column(Text, nullable=False)  # JSON {genres:{},labels:{},artists:{}}
    action = Column(String, default="import")  # import | rollback | manual
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    username = Column(String, default="")  # dénormalisé pour l'affichage
    created_at = Column(DateTime, default=datetime.utcnow)


class GenreAuditLog(Base):
    """Journal d'audit des actions sur les mappings (admin only)."""
    __tablename__ = "genre_audit_log"
    id = Column(Integer, primary_key=True, autoincrement=True)
    action = Column(String)  # export | import | rollback
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    username = Column(String, default="")
    details = Column(Text, default="")  # ex: "42 labels, 15 artistes, 8 aliases importés"
    snapshot_id = Column(Integer, ForeignKey("genre_snapshots.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
