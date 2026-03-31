/**
 * Traitement local des tags ID3 côté navigateur.
 * Lit les tags avec music-metadata-browser, écrit avec browser-id3-writer.
 * Les fichiers MP3 ne quittent jamais le Mac/PC de l'utilisateur.
 */
import * as mm from 'music-metadata-browser'
// @ts-ignore — pas de types pour browser-id3-writer
import Writer from 'browser-id3-writer'
import type { EnrichResult } from './types'

export interface ParsedTags {
  title: string
  artist: string
  album: string
  genre: string
  albumArtist: string
  composer: string   // label
  grouping: string   // catalog
  year?: number
  track?: number
  picture?: mm.IPicture
}

/** Lit les tags ID3 d'un ArrayBuffer MP3. */
export async function readTags(arrayBuffer: ArrayBuffer): Promise<ParsedTags> {
  const metadata = await mm.parseBuffer(new Uint8Array(arrayBuffer), { mimeType: 'audio/mpeg' })
  const c = metadata.common
  return {
    title:       c.title        || '',
    artist:      c.artist       || (c.artists?.[0] || ''),
    album:       c.album        || '',
    genre:       c.genre?.[0]   || '',
    albumArtist: c.albumartist  || '',
    composer:    c.composer?.[0]|| '',
    grouping:    (c as any).grouping || '',
    year:        c.year ?? undefined,
    track:       c.track?.no ?? undefined,
    picture:     c.picture?.[0],
  }
}

/** Écrit les tags enrichis dans le fichier, préserve tous les champs existants. */
export function writeTags(
  arrayBuffer: ArrayBuffer,
  existing: ParsedTags,
  enriched: EnrichResult,
): ArrayBuffer {
  const writer = new Writer(arrayBuffer)

  // ── Champs existants à préserver ──
  if (existing.title)           writer.setFrame('TIT2', existing.title)
  if (existing.artist)          writer.setFrame('TPE1', [existing.artist])
  if (existing.year)            writer.setFrame('TYER', String(existing.year))
  if (existing.track)           writer.setFrame('TRCK', String(existing.track))

  // Album (possiblement nettoyé de "- Single" par le serveur)
  const album = enriched.album || existing.album
  if (album)                    writer.setFrame('TALB', album)

  // Cover art — critique pour Apple Music
  if (existing.picture) {
    const pic = existing.picture
    const data = pic.data instanceof Uint8Array
      ? pic.data.buffer.slice(pic.data.byteOffset, pic.data.byteOffset + pic.data.byteLength)
      : pic.data
    writer.setFrame('APIC', {
      type: 3,
      data,
      description: '',
      useUnicodeEncoding: false,
    })
  }

  // ── Enrichissement AMTU ──
  // Album Artist / Band → groupement des albums dans Apple Music
  if (enriched.album_artist)    writer.setFrame('TPE2', enriched.album_artist)
  else if (existing.albumArtist) writer.setFrame('TPE2', existing.albumArtist)

  // Genre
  const genre = enriched.genre || existing.genre
  if (genre)                    writer.setFrame('TCON', [genre])

  // Label → champ Composer (TCOM) — même logique que l'app desktop AMTU
  if (enriched.label)           writer.setFrame('TCOM', [enriched.label])
  else if (existing.composer)   writer.setFrame('TCOM', [existing.composer])

  // Numéro de catalogue → Grouping (TIT1)
  if (enriched.catalog)         writer.setFrame('TIT1', enriched.catalog)
  else if (existing.grouping)   writer.setFrame('TIT1', existing.grouping)

  writer.addTag()
  return writer.arrayBuffer
}

/** Collecte récursivement tous les .mp3 dans un FileSystemDirectoryHandle. */
export async function collectMp3Files(
  dirHandle: FileSystemDirectoryHandle,
  basePath = '',
): Promise<Array<{ name: string; relativePath: string; handle: FileSystemFileHandle }>> {
  const entries: Array<{ name: string; relativePath: string; handle: FileSystemFileHandle }> = []
  for await (const [name, handle] of (dirHandle as any).entries()) {
    if (name.startsWith('.') || name.startsWith('._')) continue
    const rel = basePath ? `${basePath}/${name}` : name
    if (handle.kind === 'directory') {
      const sub = await collectMp3Files(handle, rel)
      entries.push(...sub)
    } else if (handle.kind === 'file' && name.toLowerCase().endsWith('.mp3')) {
      entries.push({ name, relativePath: rel, handle })
    }
  }
  return entries
}
