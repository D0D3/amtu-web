# AMTU Web — Apple Music Tag Updater

Version web de [AMTU](https://github.com/D0D3/AMTU), l'outil Python de mise à jour de tags MP3 pour Apple Music.
Enrichit automatiquement vos fichiers MP3 (label, catalogue, genre, album artist) via MusicBrainz, Spotify et Discogs.

<img width="892" height="707" alt="Capture d&#39;écran 2026-03-30 151525" src="https://github.com/user-attachments/assets/ebbe818c-f4ce-461f-8bf6-14240716a12b" />

---

## Fonctionnalités

- **Traitement local (navigateur)** : sélection ou glisser-déposer d'un dossier / de fichiers MP3, lecture/écriture directement sur votre machine (File System Access API — Chrome/Edge uniquement)
- **Traitement serveur** : dossier monté côté serveur, traitement asynchrone via Celery + Redis avec progression en temps réel (SSE)
- **Groupement album/EP** : une seule requête API par album (même logique que la version Python AMTU)
- **Trois sources** : MusicBrainz (gratuit), Spotify, Discogs — le meilleur score gagne
- **Mode aperçu (dry-run)** : simulation sans modification des fichiers
- **Historique** : chaque traitement (local ou serveur) est enregistré avec avant/après
- **Genres mappés** : cartographie source → cible par genre, label ou artiste (import/export JSON)
- **Snapshots de genres** : versionnage des règles de mapping
- **Notifications email** : résumé de traitement par SMTP
- **Multi-utilisateurs** : rôles admin / utilisateur, authentification JWT

---

## Démarrage rapide

### Prérequis

- Docker + Docker Compose
- (Optionnel) Traefik comme reverse proxy

### Installation

```bash
git clone https://github.com/D0D3/amtu-web.git
cd amtu-web

# Copier et configurer
cp .env.example .env
nano .env   # Changer SECRET_KEY, MUSIC_DIR, DOMAIN, ADMIN_*

# Lancer
docker compose up -d

# Ouvrir
# http://localhost:3000  (ou votre domaine si Traefik configuré)
```

### Variables d'environnement (`.env`)

| Variable | Description | Défaut |
|----------|-------------|--------|
| `SECRET_KEY` | Clé de chiffrement JWT (32+ chars, changez-la !) | `amtu-please-change-this-secret-key-32chars` |
| `MUSIC_DIR` | Chemin vers votre dossier de musique (lecture seule) | `./music_sample` |
| `DOMAIN` | Domaine exposé par Traefik | `amtu.yourdomain.yxz` |
| `APP_URL` | URL publique (liens emails) | `https://amtu.yourdomain.yxz` |
| `ADMIN_USERNAME` | Identifiant admin initial | `admin` |
| `ADMIN_PASSWORD` | Mot de passe admin initial (changez-le !) | `amtu-change-me` |
| `ADMIN_EMAIL` | Email admin | `admin@exemple.com` |
| `ADMIN_FIRST_NAME` | Prénom admin | `Admin` |
| `ADMIN_LAST_NAME` | Nom admin | `AMTU` |

---

## Rôles et droits

### Administrateur (`is_admin: true`)

| Fonctionnalité | Admin | Utilisateur |
|----------------|-------|-------------|
| Traitement MP3 (local + serveur) | ✅ | ✅ |
| Historique (ses traitements) | ✅ | ✅ |
| Genres — lecture des mappings | ✅ | ✅ |
| Genres — ajout/modification/suppression | ✅ | ✅ (ses propres) |
| Genres — import/export JSON | ✅ | ✅ |
| Genres — snapshots (créer/restaurer/supprimer) | ✅ | ❌ |
| Genres — audit log | ✅ | ❌ |
| Réglages (clés API, SMTP, config) | ✅ | ❌ |
| Gestion des utilisateurs | ✅ | ❌ |
| Historique global (tous utilisateurs) | ✅ | ❌ |

Le premier administrateur est créé automatiquement au premier démarrage à partir des variables `ADMIN_*`.

---

## Gestion des genres

### Mappings

Les mappings permettent de normaliser les genres détectés par les APIs en genres Apple Music cohérents.
Il existe trois types de mappings :
- **Genre** : `Techno` → `Electronic`
- **Label** : `Drumcode` → `Techno`
- **Artiste** : `deadmau5` → `Electronic`

Priorité de détection : **Label** > **Artiste** > **Genre** API

### Import / Export

**Exporter** : `Genres` → bouton **Exporter** → télécharge un fichier JSON contenant tous les mappings actuels.

**Importer** : `Genres` → bouton **Importer** → sélectionner un fichier JSON exporté précédemment.

Format du fichier JSON exporté :

```json
{
  "genres": [
    { "source": "Techno", "target": "Electronic" }
  ],
  "labels": [
    { "source": "Drumcode", "target": "Techno" }
  ],
  "artists": [
    { "source": "deadmau5", "target": "Electronic" }
  ]
}
```

Les mappings importés sont fusionnés avec les mappings existants (pas de remplacement complet).

### Snapshots

Un snapshot sauvegarde l'état complet de tous vos mappings à un instant T.

- **Créer un snapshot** : avant toute modification importante
- **Restaurer un snapshot** : revenir à un état précédent (écrase les mappings actuels)
- **Supprimer un snapshot** : admin uniquement
- **Nombre maximum de snapshots** : configurable dans Réglages (défaut : 3)

Un snapshot est créé automatiquement avant chaque import et avant chaque restauration.

---

## Tags Apple Music écrits

| Tag Apple Music | Frame ID3 | Rôle |
|-----------------|-----------|------|
| Label | `TCOM` (Composer) | Record label du release |
| Catalogue | `GRP1` (Grouping) | Numéro de catalogue |
| Album Artist | `TPE2` (Band) | Artiste de l'album |
| Genre | `TCON` | Genre musical |
| Album | `TALB` | Titre de l'album |
| Année | `TDRC` / `TYER` | Année de sortie |

> **GRP1 (Regroupement Apple Music)** : le tag est généré côté serveur via mutagen pour garantir la compatibilité — `browser-id3-writer` ne supporte pas ce frame. L'audio ne quitte jamais le navigateur.

> **Préservation de la pochette (APIC)** : la cover art existante est extraite via `music-metadata-browser` puis ré-encodée en frame APIC ID3v2.3 (`buildApicFrame`) et réinjectée dans le fichier final. Cette approche est plus fiable que de re-parser les bytes bruts du fichier original, qui peut échouer selon l'encodage (extended header, tailles synchsafe vs big-endian).

**Confiance minimale requise : 60% + label présent**
En dessous de ce seuil, le fichier est ignoré (pas de modification).

---

## Architecture

```
amtu-web/
├── backend/          # FastAPI — API REST + logique de traitement
│   ├── api/          # Routes (auth, config, history, genres, jobs)
│   ├── core/         # Processor (enrichissement MP3) + Worker Celery
│   ├── db/           # Modèles SQLAlchemy + migrations
│   └── services/     # Auth JWT, email SMTP
├── frontend/         # React + Vite + Tailwind
│   └── src/
│       ├── pages/    # Dashboard, History, Genres, Settings, Users
│       └── lib/      # API client, localProcessor, types
├── data/             # Volume Docker — SQLite DB + uploads (non versionné)
├── .env.example      # Template de configuration
└── docker-compose.yml
```

**Stack :**
- Frontend : React 18, Vite, Tailwind CSS, Lucide Icons
- Backend : FastAPI, SQLAlchemy, SQLite, Pydantic
- Worker : Celery 5, Redis 7
- Proxy : Traefik (optionnel)

---

## Configuration des APIs

Dans l'interface : **Réglages** (admin uniquement)

| API | Clé requise | Lien |
|-----|-------------|------|
| MusicBrainz | Non — activé par défaut | — |
| Spotify | Client ID + Client Secret | [developer.spotify.com](https://developer.spotify.com/dashboard) |
| Discogs | Personal Access Token | [discogs.com/settings/developers](https://www.discogs.com/settings/developers) |

---

## Licence

Projet personnel — usage libre.
