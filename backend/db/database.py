"""SQLAlchemy setup — SQLite"""
import os
import logging
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:////app/data/amtu.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _migrate_columns():
    """Ajoute les colonnes manquantes à config et jobs (migration SQLite sans alembic)."""
    new_config_cols = {
        'smtp_enabled': 'BOOLEAN DEFAULT 0',
        'smtp_host': 'VARCHAR DEFAULT ""',
        'smtp_port': 'INTEGER DEFAULT 587',
        'smtp_user': 'VARCHAR DEFAULT ""',
        'smtp_password_enc': 'VARCHAR DEFAULT ""',
        'smtp_from': 'VARCHAR DEFAULT ""',
        'smtp_tls': 'BOOLEAN DEFAULT 1',
    }
    new_job_cols = {
        'created_by': 'INTEGER',
    }
    new_genre_cols = {
        'user_id': 'INTEGER',
    }
    try:
        with engine.connect() as conn:
            for table, cols in [('config', new_config_cols), ('jobs', new_job_cols), ('genre_mappings', new_genre_cols)]:
                result = conn.execute(text(f"PRAGMA table_info({table})"))
                existing = {row[1] for row in result}
                for col, col_type in cols.items():
                    if col not in existing:
                        conn.execute(text(f'ALTER TABLE {table} ADD COLUMN {col} {col_type}'))
                        logger.info(f"Migrated: {table}.{col}")
            conn.commit()
    except Exception as e:
        logger.warning(f"Migration partielle: {e}")


def _create_initial_admin():
    """Crée l'admin initial depuis les variables d'environnement si aucun user n'existe."""
    from db import models as m
    from passlib.context import CryptContext

    admin_username = os.getenv("ADMIN_USERNAME", "admin")
    admin_password = os.getenv("ADMIN_PASSWORD", "amtu-change-me")
    admin_email = os.getenv("ADMIN_EMAIL", "admin@amtu.local")
    admin_first = os.getenv("ADMIN_FIRST_NAME", "Admin")
    admin_last = os.getenv("ADMIN_LAST_NAME", "AMTU")

    db = SessionLocal()
    try:
        if db.query(m.User).count() == 0:
            pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
            admin = m.User(
                username=admin_username,
                first_name=admin_first,
                last_name=admin_last,
                email=admin_email,
                hashed_password=pwd_context.hash(admin_password),
                is_admin=True,
                is_active=True,
                email_notifications=True,
            )
            db.add(admin)
            db.commit()
            logger.info(f"Admin créé : {admin_username}")
    except Exception as e:
        logger.error(f"Erreur création admin: {e}")
    finally:
        db.close()


def init_db():
    from db import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    _migrate_columns()
    _create_initial_admin()
