"""
AMTU Web - Core MP3 Processor
Adapté de src/AMTU.py - logique pure sans Tkinter
Préserve 100% de la logique des tags Apple Music
"""
import os
import re
import csv
import time
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any, Callable
from dataclasses import dataclass, asdict

import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
import discogs_client
import musicbrainzngs
from mutagen.easyid3 import EasyID3
from mutagen.id3 import ID3, TCOM, GRP1, TPE2, TALB, TIT2, TPE1, TCON

logger = logging.getLogger(__name__)


@dataclass
class TrackMetadata:
    title: str
    artist: str
    album: str
    label: Optional[str] = None
    catalog_number: Optional[str] = None
    artist_sort: Optional[str] = None
    is_single: bool = False
    confidence: float = 0.0
    source: str = ""
    year: Optional[int] = None
    genre: Optional[str] = None


@dataclass
class TrackResult:
    file_path: str
    file_name: str
    status: str  # updated | skipped | error
    confidence: float = 0.0
    source_api: str = ""
    title_before: str = ""
    artist_before: str = ""
    album_before: str = ""
    label_before: str = ""
    catalog_before: str = ""
    genre_before: str = ""
    title_after: str = ""
    artist_after: str = ""
    album_after: str = ""
    label_after: str = ""
    catalog_after: str = ""
    genre_after: str = ""
    error_message: str = ""
    skip_reason: str = ""


class GenreManager:
    """Gestionnaire de genres - même logique que src/genre_manager.py"""

    def __init__(self, mappings: Optional[Dict] = None):
        self.genre_mapping = {
            'drum and bass': 'Drum & Bass', 'dnb': 'Drum & Bass',
            'liquid funk': 'Drum & Bass', 'neurofunk': 'Drum & Bass',
            'jump up': 'Drum & Bass', 'jungle': 'Drum & Bass',
            'dubstep': 'Dubstep', 'brostep': 'Dubstep', 'riddim': 'Dubstep',
            'melodic dubstep': 'Melodic Dubstep',
            'house': 'House', 'deep house': 'Deep House',
            'tech house': 'Tech House', 'progressive house': 'Progressive House',
            'electro house': 'Electro House', 'future house': 'Future House',
            'bass house': 'Bass House', 'drumstep': 'Drumstep',
            'breakbeat': 'Breakbeat', 'trap': 'Trap', 'future bass': 'Future Bass',
            'hardstyle': 'Hardstyle', 'trance': 'Trance', 'psytrance': 'Psytrance',
            'ambient': 'Ambient', 'synthwave': 'Synthwave',
        }
        self.label_genre_rules = {
            'hospital records': 'Drum & Bass', 'ram records': 'Drum & Bass',
            'monstercat': 'EDM', 'spinnin': 'House', 'revealed': 'Electro House',
            'mau5trap': 'Progressive House', 'never say die': 'Dubstep',
        }
        self.artist_genre_rules = {
            'noisia': 'Drum & Bass', 'pendulum': 'Drum & Bass',
            'skrillex': 'Dubstep', 'deadmau5': 'Progressive House',
            'martin garrix': 'Electro House', 'andy c': 'Drum & Bass',
            'sub focus': 'Drum & Bass', 'dj zinc': 'Drum & Bass',
        }
        if mappings:
            self.update_mappings(mappings)

    def update_mappings(self, mappings: Dict):
        self.genre_mapping.update(mappings.get('genres', {}))
        self.label_genre_rules.update(mappings.get('labels', {}))
        self.artist_genre_rules.update(mappings.get('artists', {}))

    def get_all_mappings(self) -> Dict:
        return {
            'genres': dict(self.genre_mapping),
            'labels': dict(self.label_genre_rules),
            'artists': dict(self.artist_genre_rules),
        }

    def detect_genre(self, metadata: TrackMetadata) -> str:
        detected_genre = None
        if metadata.label:
            label_lower = metadata.label.lower()
            for key, genre in self.label_genre_rules.items():
                if key in label_lower:
                    detected_genre = genre
                    break
        if not detected_genre and metadata.artist:
            artist_lower = metadata.artist.lower()
            for key, genre in self.artist_genre_rules.items():
                if key in artist_lower:
                    detected_genre = genre
                    break
        if not detected_genre and metadata.genre:
            detected_genre = self.genre_mapping.get(metadata.genre.lower(), metadata.genre)
        return detected_genre or 'Electronic'


class APIManager:
    """Gestionnaire APIs musicales - même logique que src/AMTU.py::APIManager"""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.spotify = None
        self.discogs = None
        self.musicbrainz = None
        self.init_errors: Dict[str, str] = {}
        self._init_apis()

    def _init_apis(self):
        services = self.config.get('services', {})
        if services.get('musicbrainz', True):
            self._init_musicbrainz()
        if services.get('spotify', False):
            self._init_spotify()
        if services.get('discogs', False):
            self._init_discogs()

    def _init_musicbrainz(self):
        try:
            musicbrainzngs.set_useragent("AMTU-Web", "1.0", "https://github.com/amtu")
            self.musicbrainz = musicbrainzngs
        except Exception as e:
            self.init_errors['musicbrainz'] = str(e)
            logger.error(f"MusicBrainz init error: {e}")

    def _init_spotify(self):
        try:
            client_id = self.config.get('spotify_client_id', '')
            client_secret = self.config.get('spotify_client_secret', '')
            if not client_id or not client_secret:
                raise ValueError("Spotify credentials missing")
            auth_manager = SpotifyClientCredentials(
                client_id=client_id,
                client_secret=client_secret
            )
            self.spotify = spotipy.Spotify(auth_manager=auth_manager)
        except Exception as e:
            self.init_errors['spotify'] = str(e)
            logger.error(f"Spotify init error: {e}")

    def _init_discogs(self):
        try:
            token = self.config.get('discogs_token', '')
            if not token:
                raise ValueError("Discogs token missing")
            self.discogs = discogs_client.Client('AMTU-Web/1.0', user_token=token)
        except Exception as e:
            self.init_errors['discogs'] = str(e)
            logger.error(f"Discogs init error: {e}")

    def get_status(self) -> Dict[str, Any]:
        services = self.config.get('services', {})
        return {
            'musicbrainz': {
                'enabled': services.get('musicbrainz', True),
                'connected': self.musicbrainz is not None,
                'error': self.init_errors.get('musicbrainz'),
            },
            'spotify': {
                'enabled': services.get('spotify', False),
                'connected': self.spotify is not None,
                'error': self.init_errors.get('spotify'),
            },
            'discogs': {
                'enabled': services.get('discogs', False),
                'connected': self.discogs is not None,
                'error': self.init_errors.get('discogs'),
            },
        }

    def _levenshtein_ratio(self, s1: str, s2: str) -> float:
        if not s1 or not s2:
            return 0.0
        distances = {}
        len1, len2 = len(s1), len(s2)
        for i in range(len1 + 1):
            distances[i] = {0: i}
        for j in range(len2 + 1):
            distances[0][j] = j
        for i in range(1, len1 + 1):
            for j in range(1, len2 + 1):
                if s1[i-1] == s2[j-1]:
                    distances[i][j] = distances[i-1][j-1]
                else:
                    distances[i][j] = min(distances[i-1][j], distances[i][j-1], distances[i-1][j-1]) + 1
        max_length = max(len1, len2)
        return 1 - (distances[len1][len2] / max_length) if max_length else 1.0

    def _calculate_confidence(self, qt: str, qa: str, rt: str, ra: str) -> float:
        def clean(text: str) -> str:
            while '(' in text and ')' in text:
                start, end = text.find('('), text.find(')')
                if start < end:
                    text = text[:start] + text[end+1:]
                else:
                    break
            return ''.join(c for c in text.lower().strip() if c.isalnum() or c.isspace()).strip()

        qt_c, qa_c = clean(qt), clean(qa.split('&')[0])
        rt_c, ra_c = clean(rt), clean(ra.split('&')[0])
        title_ratio = self._levenshtein_ratio(qt_c, rt_c)
        artist_ratio = self._levenshtein_ratio(qa_c, ra_c)
        confidence = (title_ratio * 0.6 + artist_ratio * 0.4) * 100
        if qt_c in rt_c or rt_c in qt_c:
            confidence = min(100, confidence + 20)
        return confidence

    def search_track(self, title: str, artist: str, retries: int = 3,
                     prefer_single: bool = False) -> List[TrackMetadata]:
        for attempt in range(retries):
            try:
                results = self._execute_search(title, artist, prefer_single=prefer_single)
                if results:
                    return results
            except Exception as e:
                if attempt == retries - 1:
                    logger.error(f"All search attempts failed for {title}: {e}")
                    raise
                time.sleep(1)
        return []

    def _execute_search(self, title: str, artist: str, prefer_single: bool = False) -> List[TrackMetadata]:
        best_result = None
        services = self.config.get('services', {})
        # MusicBrainz actif par défaut (cohérent avec _init_apis)
        defaults = {'musicbrainz': True, 'spotify': False, 'discogs': False}
        candidates = [
            ('musicbrainz', self._search_musicbrainz),
            ('spotify', self._search_spotify),
            ('discogs', self._search_discogs),
        ]
        for service_name, search_func in candidates:
            if not services.get(service_name, defaults[service_name]):
                continue
            try:
                if service_name == 'musicbrainz':
                    results = search_func(title, artist, prefer_single=prefer_single)
                else:
                    results = search_func(title, artist)
                if not results:
                    continue
                current_best = max(results, key=lambda x: x.confidence)
                if current_best.label and (not best_result or current_best.confidence > best_result.confidence):
                    best_result = current_best
            except Exception as e:
                logger.warning(f"Search error on {service_name}: {e}")
        return [best_result] if best_result else []

    def _search_musicbrainz(self, title: str, artist: str, prefer_single: bool = False) -> List[TrackMetadata]:
        if not self.musicbrainz:
            return []
        results = []
        try:
            clean_title = title.split('(')[0].strip()
            clean_artist = artist.split('&')[0].strip()
            search_results = self.musicbrainz.search_recordings(
                query=f'recording:"{clean_title}" AND artist:"{clean_artist}"', limit=5
            )
            artist_result = self.musicbrainz.search_artists(clean_artist, limit=1)
            artist_sort_name = None
            if 'artist-list' in artist_result and artist_result['artist-list']:
                artist_sort_name = artist_result['artist-list'][0].get('sort-name')

            for recording in search_results.get('recording-list', []):
                if not recording.get('release-list'):
                    continue

                # Parcourir tous les releases pour trouver le plus pertinent avec un label/catno
                # Si prefer_single, prioriser les releases de type Single ; sinon Album/EP
                best_release = None
                best_label = None
                best_catalog = None
                best_is_single = False

                for release_stub in recording['release-list']:
                    try:
                        rd = self.musicbrainz.get_release_by_id(
                            release_stub['id'], includes=['labels', 'release-groups']
                        )
                        rel = rd.get('release', {})
                        rg_type = rel.get('release-group', {}).get('type', '').lower()
                        is_single = rg_type == 'single'

                        lbl, catno = None, None
                        if 'label-info-list' in rel:
                            li = rel['label-info-list'][0]
                            lbl = li.get('label', {}).get('name')
                            catno = li.get('catalog-number')

                        if not lbl:
                            continue  # Pas de label → inutile

                        # Choisir ce release si :
                        # - premier avec label, ou
                        # - correspond mieux au type attendu (single vs album)
                        if best_release is None:
                            best_release, best_label, best_catalog, best_is_single = rel, lbl, catno, is_single
                        elif prefer_single and is_single and not best_is_single:
                            best_release, best_label, best_catalog, best_is_single = rel, lbl, catno, is_single
                        elif not prefer_single and not is_single and best_is_single:
                            best_release, best_label, best_catalog, best_is_single = rel, lbl, catno, is_single
                    except Exception:
                        continue

                if not best_release:
                    continue

                confidence = self._calculate_confidence(
                    title, artist,
                    recording['title'],
                    recording['artist-credit'][0]['artist']['name']
                )
                results.append(TrackMetadata(
                    title=recording['title'],
                    artist=recording['artist-credit'][0]['artist']['name'],
                    album=best_release.get('title', ''),
                    label=best_label, catalog_number=best_catalog,
                    artist_sort=artist_sort_name,
                    is_single=best_is_single,
                    confidence=confidence, source='MusicBrainz'
                ))
        except Exception as e:
            logger.error(f"MusicBrainz search error: {e}")
        return sorted(results, key=lambda x: x.confidence, reverse=True)

    def _search_spotify(self, title: str, artist: str) -> List[TrackMetadata]:
        if not self.spotify:
            return []
        results = []
        try:
            search_results = self.spotify.search(
                f'track:"{title}" artist:"{artist}"', type='track', limit=5
            )
            for track in search_results.get('tracks', {}).get('items', []):
                album = track['album']
                confidence = self._calculate_confidence(title, artist, track['name'], track['artists'][0]['name'])
                album_detail = self.spotify.album(album['id'])
                is_single = album.get('album_type', '').lower() == 'single'
                results.append(TrackMetadata(
                    title=track['name'], artist=track['artists'][0]['name'],
                    album=album['name'], label=album_detail.get('label'),
                    is_single=is_single,
                    confidence=confidence, source='Spotify'
                ))
        except Exception as e:
            logger.error(f"Spotify search error: {e}")
        return results

    def _search_discogs(self, title: str, artist: str) -> List[TrackMetadata]:
        if not self.discogs:
            return []
        results = []
        try:
            search_results = self.discogs.search(f"{title} {artist}", type='release')
            for release in list(search_results)[:5]:
                try:
                    artist_name = release.artists[0].name if release.artists else "Unknown"
                    label_name = release.labels[0].name if release.labels else None
                    catalog_num = release.labels[0].catno if release.labels else None
                    confidence = self._calculate_confidence(title, artist, release.title, artist_name)
                    results.append(TrackMetadata(
                        title=release.title, artist=artist_name, album=release.title,
                        label=label_name, catalog_number=catalog_num,
                        confidence=confidence, source='Discogs'
                    ))
                except Exception:
                    continue
        except Exception as e:
            logger.warning(f"Discogs search error: {e}")
        return results


class MP3Processor:
    """Traitement MP3 - même logique Apple Music tags que src/AMTU.py::MP3Processor"""

    def __init__(self, api_manager: APIManager, genre_manager: GenreManager):
        self.api_manager = api_manager
        self.genre_manager = genre_manager

    def _is_valid_mp3(self, file_path: Path) -> bool:
        if file_path.name.startswith('._') or file_path.name.startswith('.'):
            return False
        try:
            EasyID3(str(file_path))
            return True
        except Exception:
            return False

    def _read_tags(self, file_path: Path) -> Optional[Dict]:
        try:
            audio = EasyID3(str(file_path))
            return {
                'title': audio.get('title', [''])[0],
                'artist': audio.get('artist', [''])[0],
                'album': audio.get('album', [''])[0],
                'label': audio.get('composer', [''])[0],
                'catalog': audio.get('grouping', [''])[0],
                'genre': audio.get('genre', [''])[0],
            }
        except Exception as e:
            logger.warning(f"Read tags error {file_path.name}: {e}")
            return None

    def process_file(self, file_path: Path, dry_run: bool = False,
                     forced_meta: Optional['TrackMetadata'] = None) -> TrackResult:
        """Traite un fichier MP3. dry_run=True pour prévisualiser sans modifier.
        forced_meta: si fourni (cas album/EP groupé), utilise ces métadonnées sans appel API."""
        result = TrackResult(
            file_path=str(file_path),
            file_name=file_path.name,
            status='skipped'  # défaut : ignoré ; 'error' uniquement sur exception d'écriture
        )

        if not self._is_valid_mp3(file_path):
            result.skip_reason = "Fichier MP3 invalide ou caché"
            return result

        tags = self._read_tags(file_path)
        if not tags:
            result.skip_reason = "Impossible de lire les tags"
            return result

        # Enregistrer état avant
        result.title_before = tags['title']
        result.artist_before = tags['artist']
        result.album_before = tags['album']
        result.label_before = tags['label']
        result.catalog_before = tags['catalog']
        result.genre_before = tags['genre']

        if not tags['title'] or not tags['artist']:
            result.skip_reason = "Titre ou artiste manquant"
            return result

        if forced_meta is not None:
            # Métadonnées déjà trouvées (groupe album/EP) — pas d'appel API
            best = forced_meta
        else:
            # Détecter si le fichier est un single (tag album contient "Single")
            is_single_hint = bool(re.search(r'\bsingle\b', tags.get('album', ''), re.IGNORECASE))

            # Délai API
            time.sleep(0.5)

            try:
                api_results = self.api_manager.search_track(
                    tags['title'], tags['artist'], prefer_single=is_single_hint
                )
            except Exception as e:
                result.error_message = f"Erreur API: {str(e)}"
                result.status = 'error'
                return result

            if not api_results:
                result.skip_reason = "Aucun résultat trouvé sur les APIs"
                return result

            best = api_results[0]
            result.confidence = best.confidence
            result.source_api = best.source

            if best.confidence < 60:
                result.skip_reason = f"Confiance insuffisante ({best.confidence:.0f}% < 60%)"
                return result

            if not best.label:
                result.skip_reason = "Label non trouvé"
                return result

        # Détecter genre
        best.genre = self.genre_manager.detect_genre(best)

        # Calculer nouvel album (suppression "- Single")
        new_album = tags['album']
        for pattern in [r'\s*-\s*Single\s*$', r'\s*\(Single\)\s*$']:
            new_album = re.sub(pattern, '', new_album, flags=re.IGNORECASE)
        new_album = new_album.strip()

        # Calculer nouveau genre
        new_genre = tags['genre']
        label_lower = (best.label or '').lower()
        artist_lower = (tags['artist'] or '').lower()
        if label_lower in self.genre_manager.label_genre_rules:
            new_genre = self.genre_manager.label_genre_rules[label_lower]
        elif artist_lower in self.genre_manager.artist_genre_rules:
            new_genre = self.genre_manager.artist_genre_rules[artist_lower]
        elif tags['genre']:
            new_genre = self.genre_manager.genre_mapping.get(tags['genre'].lower(), tags['genre'])
        elif best.genre:
            new_genre = best.genre

        # État après (pour affichage)
        result.title_after = tags['title']
        result.artist_after = tags['artist']
        result.album_after = new_album
        result.label_after = best.label or tags['label']
        result.catalog_after = best.catalog_number or tags['catalog']
        result.genre_after = new_genre

        if dry_run:
            result.status = 'updated'
            return result

        # Appliquer les tags — logique identique AMTU.py::_update_metadata
        try:
            try:
                audio = ID3(str(file_path))
            except Exception:
                audio = ID3()
                audio.save(str(file_path))
                audio = ID3(str(file_path))

            updated = False
            original_time = os.path.getmtime(file_path)

            # Label → TCOM (Composer) — critique Apple Music
            if best.label:
                current = str(audio.get('TCOM', [''])[0]) if 'TCOM' in audio else ''
                if current.lower() != best.label.lower():
                    audio['TCOM'] = TCOM(encoding=3, text=[best.label])
                    updated = True

            # Catalog → GRP1 (Grouping)
            if best.catalog_number:
                current = str(audio.get('GRP1', [''])[0]) if 'GRP1' in audio else ''
                if current.lower() != best.catalog_number.lower():
                    audio['GRP1'] = GRP1(encoding=3, text=[best.catalog_number])
                    updated = True

            # Album Artist → TPE2 (Band) — crucial pour groupement Apple Music
            if tags['artist']:
                current = str(audio.get('TPE2', [''])[0]) if 'TPE2' in audio else ''
                if current != tags['artist']:
                    audio['TPE2'] = TPE2(encoding=3, text=[tags['artist']])
                    updated = True

            # Album nettoyé
            if new_album != tags['album']:
                audio['TALB'] = TALB(encoding=3, text=[new_album])
                updated = True

            # Genre
            if new_genre and new_genre != tags['genre']:
                for key in list(audio.keys()):
                    if 'TCON' in key or 'GENRE' in key:
                        audio.delall(key)
                audio['TCON'] = TCON(encoding=3, text=[new_genre])
                updated = True

            if updated:
                audio.save(v2_version=4)
                os.utime(file_path, (original_time, original_time))  # Préserver timestamp

            result.status = 'updated'

        except Exception as e:
            result.error_message = f"Erreur écriture tags: {str(e)}"
            result.status = 'error'

        return result

    def scan_directory(self, directory: Path) -> List[Path]:
        """Liste tous les MP3 valides dans un dossier (récursif)."""
        return [f for f in directory.rglob("*.mp3") if self._is_valid_mp3(f)]

    def group_by_album(self, file_paths: List[Path]) -> List[List[Path]]:
        """Groupe les fichiers par album (tag album identique = même groupe).
        EP = < 7 fichiers, Album = >= 7. Même logique que AMTU.py::group_files_by_album."""
        groups: dict = {}
        solo: List[List[Path]] = []

        for path in file_paths:
            tags = self._read_tags(path)
            album = tags.get('album', '').strip() if tags else ''
            if album:
                if album not in groups:
                    groups[album] = []
                groups[album].append(path)
            else:
                solo.append([path])

        return list(groups.values()) + solo

    def process_group(self, file_paths: List[Path], dry_run: bool = False) -> List[TrackResult]:
        """Traite un groupe de fichiers (album/EP) : une seule recherche API
        sur le premier fichier, résultat appliqué à tous. Logique identique
        à AMTU.py::process_directory avec groupement par album."""
        if not file_paths:
            return []

        # Recherche sur le premier fichier valide du groupe
        first = next((p for p in file_paths if self._is_valid_mp3(p)), None)
        if not first:
            return [TrackResult(file_path=str(p), file_name=p.name,
                                status='skipped', skip_reason='Fichier invalide')
                    for p in file_paths]

        tags = self._read_tags(first)
        group_meta = None

        if tags and tags.get('title') and tags.get('artist'):
            is_single_hint = bool(re.search(r'\bsingle\b', tags.get('album', ''), re.IGNORECASE))
            time.sleep(0.5)
            try:
                api_results = self.api_manager.search_track(
                    tags['title'], tags['artist'], prefer_single=is_single_hint
                )
                if api_results:
                    best = api_results[0]
                    if best.confidence >= 60 and best.label:
                        best.genre = self.genre_manager.detect_genre(best)
                        group_meta = best
            except Exception as e:
                logger.error(f"Erreur API pour groupe '{tags.get('album', first.name)}': {e}")

        # Application à chaque fichier du groupe
        results = []
        for path in file_paths:
            if group_meta is None:
                result = TrackResult(
                    file_path=str(path), file_name=path.name, status='skipped',
                    skip_reason='Aucun résultat trouvé pour cet album/EP',
                )
                # Remplir les tags avant même si skip
                t = self._read_tags(path)
                if t:
                    result.title_before = t.get('title', '')
                    result.artist_before = t.get('artist', '')
                    result.album_before = t.get('album', '')
                    result.label_before = t.get('label', '')
                    result.genre_before = t.get('genre', '')
                results.append(result)
            else:
                results.append(self.process_file(path, dry_run=dry_run,
                                                  forced_meta=group_meta))
        return results
