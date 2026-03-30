"""Service d'envoi d'emails — notifications fin de traitement"""
import csv
import io
import os
import smtplib
import logging
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List

logger = logging.getLogger(__name__)

APP_URL = os.getenv("APP_URL", "https://amtu.humanbrorecords.club")


def generate_csv(results) -> bytes:
    """Génère un CSV UTF-8 avec BOM (compatible Excel) des résultats du job."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        'Fichier', 'Statut', 'Confiance', 'Source API',
        'Titre avant', 'Artiste avant', 'Album avant', 'Label avant', 'Catalogue avant', 'Genre avant',
        'Titre après', 'Artiste après', 'Album après', 'Label après', 'Catalogue après', 'Genre après',
        'Raison ignoré', 'Erreur',
    ])
    for r in results:
        writer.writerow([
            r.file_name,
            r.status,
            f"{r.confidence:.0%}" if r.confidence else "",
            r.source_api or "",
            r.title_before or "", r.artist_before or "", r.album_before or "",
            r.label_before or "", r.catalog_before or "", r.genre_before or "",
            r.title_after or "", r.artist_after or "", r.album_after or "",
            r.label_after or "", r.catalog_after or "", r.genre_after or "",
            r.skip_reason or "", r.error_message or "",
        ])
    return output.getvalue().encode('utf-8-sig')


def send_job_completion_email(smtp_cfg: dict, recipients: List[str], job, results: list):
    """Envoie un email de notification avec le CSV en pièce jointe."""
    if not smtp_cfg.get('enabled') or not recipients:
        return

    updated = sum(1 for r in results if r.status == 'updated')
    skipped = sum(1 for r in results if r.status == 'skipped')
    errors = sum(1 for r in results if r.status == 'error')

    duration_str = ""
    if job.created_at and job.completed_at:
        secs = int((job.completed_at - job.created_at).total_seconds())
        duration_str = f" en {secs // 60}m {secs % 60}s"

    job_url = f"{APP_URL}/history?job={job.id}"
    short_id = job.id[:8]

    html = f"""
<html><body style="font-family:-apple-system,sans-serif;color:#1f2937;max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:24px 32px">
      <h1 style="color:#fff;margin:0;font-size:20px">✅ Traitement terminé</h1>
      <p style="color:#ddd6fe;margin:6px 0 0;font-size:13px">Lot <code style="background:rgba(255,255,255,.15);padding:2px 6px;border-radius:4px">{short_id}…</code>{duration_str}</p>
    </div>
    <div style="padding:24px 32px">
      <table style="width:100%;border-collapse:separate;border-spacing:8px;margin-bottom:20px">
        <tr>
          <td style="background:#dcfce7;border-radius:10px;padding:14px;text-align:center">
            <div style="font-size:28px;font-weight:700;color:#15803d">{updated}</div>
            <div style="font-size:12px;color:#166534;margin-top:2px">Mis à jour</div>
          </td>
          <td style="background:#fef9c3;border-radius:10px;padding:14px;text-align:center">
            <div style="font-size:28px;font-weight:700;color:#a16207">{skipped}</div>
            <div style="font-size:12px;color:#713f12;margin-top:2px">Ignorés</div>
          </td>
          <td style="background:#fee2e2;border-radius:10px;padding:14px;text-align:center">
            <div style="font-size:28px;font-weight:700;color:#b91c1c">{errors}</div>
            <div style="font-size:12px;color:#991b1b;margin-top:2px">Erreurs</div>
          </td>
        </tr>
      </table>
      <a href="{job_url}" style="display:inline-block;background:#7c3aed;color:#fff;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
        Voir les résultats détaillés →
      </a>
      <p style="font-size:12px;color:#9ca3af;margin-top:20px">
        Le détail complet est joint en pièce jointe (CSV).
      </p>
    </div>
  </div>
</body></html>
"""

    try:
        msg = MIMEMultipart('mixed')
        msg['Subject'] = f"[AMTU] {updated} fichiers mis à jour — lot {short_id}"
        email = smtp_cfg.get('from') or smtp_cfg.get('user') or 'amtu@localhost'
        name = smtp_cfg.get('from_name', '').strip()
        from_addr = f"{name} <{email}>" if name else email
        msg['From'] = from_addr
        msg['To'] = ', '.join(recipients)
        msg.attach(MIMEText(html, 'html', 'utf-8'))

        csv_bytes = generate_csv(results)
        attachment = MIMEBase('application', 'octet-stream')
        attachment.set_payload(csv_bytes)
        encoders.encode_base64(attachment)
        attachment.add_header(
            'Content-Disposition',
            f'attachment; filename="amtu-{short_id}.csv"'
        )
        msg.attach(attachment)

        host = smtp_cfg['host']
        port = smtp_cfg.get('port', 587)
        user = smtp_cfg.get('user', '')
        password = smtp_cfg.get('password', '')
        use_ssl = smtp_cfg.get('ssl', False) or port == 465

        if use_ssl:
            with smtplib.SMTP_SSL(host, port, timeout=10) as server:
                if user:
                    server.login(user, password)
                server.send_message(msg)
        elif smtp_cfg.get('tls', True):
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

        logger.info(f"Email envoyé pour job {job.id} → {recipients}")

    except Exception as e:
        logger.error(f"Erreur envoi email job {job.id}: {e}")
