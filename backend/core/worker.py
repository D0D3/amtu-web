"""
Celery Worker — Tâches asynchrones de traitement MP3
"""
import json
import logging
from pathlib import Path
from celery import Celery
from celery.signals import task_prerun, task_postrun

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Celery app — Redis comme broker et backend
celery_app = Celery(
    'amtu_worker',
    broker='redis://redis:6379/0',
    backend='redis://redis:6379/1',
)
celery_app.conf.update(
    task_serializer='json',
    result_serializer='json',
    accept_content=['json'],
    timezone='UTC',
    task_track_started=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    broker_transport_options={'visibility_timeout': 3600},
)


@celery_app.task(bind=True, name='process_files')
def process_files_task(self, job_id: str, file_paths: list, config: dict, dry_run: bool = False):
    """Tâche Celery principale — traitement batch de fichiers MP3."""
    import redis
    from core.processor import APIManager, MP3Processor, GenreManager
    from db.database import SessionLocal
    from db import models as db_models
    from datetime import datetime
    import os

    r = redis.Redis(host='redis', port=6379, db=2)

    def publish_event(event_type: str, data: dict):
        """Publie un événement SSE via Redis Pub/Sub."""
        payload = json.dumps({'type': event_type, 'job_id': job_id, **data})
        r.publish(f'job:{job_id}', payload)

    db = SessionLocal()
    try:
        # Initialiser les APIs
        api_manager = APIManager(config)

        # Charger les genre mappings depuis la DB
        genre_mappings_rows = db.query(db_models.GenreMapping).all()
        custom_mappings = {'genres': {}, 'labels': {}, 'artists': {}}
        for row in genre_mappings_rows:
            custom_mappings[row.type + 's'][row.source] = row.target

        genre_manager = GenreManager(custom_mappings)

        # Initialiser le cache manager
        cache_retention = 6
        try:
            cfg_row = db.query(db_models.Config).filter(db_models.Config.id == 1).first()
            if cfg_row and cfg_row.cache_retention_months:
                cache_retention = cfg_row.cache_retention_months
        except Exception:
            pass
        from services.cache import CacheManager
        cache_manager = CacheManager(db, retention_months=cache_retention)

        processor = MP3Processor(api_manager, genre_manager, cache_manager=cache_manager)

        total = len(file_paths)
        publish_event('started', {'total': total})

        # Mettre à jour le job en DB
        job = db.query(db_models.Job).filter(db_models.Job.id == job_id).first()
        # Récupérer le username du créateur pour l'historique
        job_owner_id = None
        job_owner_username = ""
        if job and job.created_by:
            owner = db.query(db_models.User).filter(db_models.User.id == job.created_by).first()
            if owner:
                job_owner_id = owner.id
                job_owner_username = owner.username

        if job:
            job.status = 'running'
            job.total_files = total
            db.commit()

        updated = skipped = errors = 0
        processed = 0

        # Grouper par album — une seule recherche API par album/EP (logique AMTU)
        all_paths = [Path(p) for p in file_paths]
        groups = processor.group_by_album(all_paths)
        logger.info(f"Job {job_id}: {total} fichiers → {len(groups)} groupe(s)")

        for group in groups:
            group_name = None
            try:
                from mutagen.easyid3 import EasyID3
                t = EasyID3(str(group[0]))
                album_vals = t.get('album')
                group_name = album_vals[0] if album_vals else None
            except Exception:
                pass
            label = f"album '{group_name}'" if group_name else group[0].name

            # Progression : annonce le groupe avant traitement
            publish_event('progress', {
                'current': processed + 1,
                'total': total,
                'file': group[0].name,
                'percent': round((processed / total) * 100),
            })
            logger.info(f"Traitement {label} ({len(group)} fichier(s))")

            try:
                results = processor.process_group(group, dry_run=dry_run)
            except Exception as grp_err:
                logger.exception(f"process_group crash sur {label}: {grp_err}")
                from core.processor import TrackResult
                results = [
                    TrackResult(
                        file_path=str(p),
                        file_name=p.name,
                        status='error',
                        error_message=f"Erreur inattendue: {grp_err}",
                    )
                    for p in group
                ]

            for result in results:
                processed += 1

                # Sauvegarder en historique
                try:
                    history_entry = db_models.History(
                        job_id=job_id,
                        file_path=result.file_path,
                        file_name=result.file_name,
                        status=result.status,
                        confidence=result.confidence,
                        source_api=result.source_api,
                        title_before=result.title_before,
                        artist_before=result.artist_before,
                        album_before=result.album_before,
                        label_before=result.label_before,
                        catalog_before=result.catalog_before,
                        genre_before=result.genre_before,
                        title_after=result.title_after,
                        artist_after=result.artist_after,
                        album_after=result.album_after,
                        label_after=result.label_after,
                        catalog_after=result.catalog_after,
                        genre_after=result.genre_after,
                        error_message=result.error_message,
                        skip_reason=result.skip_reason,
                        created_by=job_owner_id,
                        username=job_owner_username,
                    )
                    db.add(history_entry)
                    db.commit()
                except Exception as db_err:
                    logger.error(f"Impossible de sauvegarder history pour {result.file_name}: {db_err}")
                    db.rollback()

                if result.status == 'updated':
                    updated += 1
                elif result.status == 'skipped':
                    skipped += 1
                else:
                    errors += 1

                # Publier résultat fichier
                publish_event('file_done', {
                    'file': result.file_name,
                    'status': result.status,
                    'confidence': result.confidence,
                    'source': result.source_api,
                    'label': result.label_after,
                    'skip_reason': result.skip_reason,
                    'error': result.error_message,
                    'before': {
                        'label': result.label_before,
                        'genre': result.genre_before,
                        'album': result.album_before,
                        'catalog': result.catalog_before,
                    },
                    'after': {
                        'label': result.label_after,
                        'genre': result.genre_after,
                        'album': result.album_after,
                        'catalog': result.catalog_after,
                    },
                })

        # Finaliser le job
        if job:
            job.status = 'completed'
            job.processed_files = total
            job.updated_files = updated
            job.skipped_files = skipped
            job.error_files = errors
            job.completed_at = datetime.utcnow()
            db.commit()

        publish_event('completed', {
            'updated': updated,
            'skipped': skipped,
            'errors': errors,
            'total': total,
        })

        # Envoi email aux utilisateurs avec notifications activées
        try:
            from api.routes.config import _build_smtp_config, _get_or_create_config
            from services.email import send_job_completion_email

            smtp_cfg = _build_smtp_config(db)
            if smtp_cfg.get('enabled'):
                recipients = [
                    u.email for u in db.query(db_models.User).filter(
                        db_models.User.email_notifications == True,
                        db_models.User.is_active == True,
                    ).all()
                    if u.email
                ]
                results_rows = db.query(db_models.History).filter(
                    db_models.History.job_id == job_id
                ).all()
                send_job_completion_email(smtp_cfg, recipients, job, results_rows)
        except Exception as mail_err:
            logger.warning(f"Email non envoyé: {mail_err}")

        # Purger les entrées cache expirées
        try:
            purged = cache_manager.purge_expired()
            if purged:
                logger.info(f"Cache : {purged} entrée(s) expirée(s) supprimée(s)")
        except Exception:
            pass

        return {'updated': updated, 'skipped': skipped, 'errors': errors}

    except Exception as e:
        logger.exception(f"Job {job_id} failed: {e}")

        job = db.query(db_models.Job).filter(db_models.Job.id == job_id).first()
        if job:
            job.status = 'failed'
            db.commit()

        publish_event('error', {'message': str(e)})
        raise

    finally:
        db.close()
