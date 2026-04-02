/**
 * Traitement local des tags ID3 côté navigateur.
 * Lit les tags avec music-metadata-browser, écrit avec browser-id3-writer.
 * Les fichiers MP3 ne quittent jamais le Mac/PC de l'utilisateur.
 *
 * Pour GRP1 (Regroupement Apple Music) : le backend génère le tag ID3 via mutagen,
 * le frontend réinjecte l'APIC (cover art) depuis le fichier original et reconstruit
 * le fichier sans jamais envoyer les données audio au serveur.
 */
import * as mm from 'music-metadata-browser'
// @ts-ignore — pas de types pour browser-id3-writer
import Writer from 'browser-id3-writer'
import type { EnrichResult } from './types'
import { generateId3Tag } from './api'

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

/**
 * Écrit les tags enrichis via le backend (mutagen) pour assurer la compatibilité
 * Apple Music (GRP1 = Regroupement). La cover art est extraite localement et
 * réinjectée — l'audio ne quitte jamais le navigateur.
 *
 * Retourne null si l'appel backend échoue (le caller peut fallback sur writeTags).
 */
export async function writeTagsViaBackend(
  arrayBuffer: ArrayBuffer,
  existing: ParsedTags,
  enriched: EnrichResult,
): Promise<ArrayBuffer | null> {
  try {
    const existingAlbumCleaned = existing.album
      ? existing.album.replace(/\s*-\s*single\s*$/i, '').trim()
      : undefined
    const album  = enriched.album  || existingAlbumCleaned || undefined
    const label  = enriched.label  || existing.composer || undefined
    const catalog = enriched.catalog || existing.grouping || undefined
    const genre  = enriched.genre  || existing.genre  || undefined
    const year   = enriched.year   ?? existing.year   ?? undefined
    const albumArtist = enriched.album_artist || existing.albumArtist || undefined

    const { tag_b64 } = await generateId3Tag({
      title:        existing.title   || undefined,
      artist:       existing.artist  || undefined,
      album,
      album_artist: albumArtist,
      label,
      catalog,
      genre,
      year,
      track: existing.track || undefined,
    })

    // Décoder le tag ID3 généré par mutagen (base64 → Uint8Array)
    const tagBytes = Uint8Array.from(atob(tag_b64), c => c.charCodeAt(0))

    // Lire la taille du tag généré (synchsafe integer, octets 6-9)
    const tagSize = ((tagBytes[6] & 0x7F) << 21) | ((tagBytes[7] & 0x7F) << 14) | ((tagBytes[8] & 0x7F) << 7) | (tagBytes[9] & 0x7F)

    // Extraire les données audio depuis le fichier original (sauter l'ancien tag ID3)
    const origBytes = new Uint8Array(arrayBuffer)
    let audioStart = 0
    if (origBytes[0] === 0x49 && origBytes[1] === 0x44 && origBytes[2] === 0x33) {
      const origTagSize = ((origBytes[6] & 0x7F) << 21) | ((origBytes[7] & 0x7F) << 14) | ((origBytes[8] & 0x7F) << 7) | (origBytes[9] & 0x7F)
      audioStart = 10 + origTagSize
    }
    const audioData = origBytes.slice(audioStart)

    // Construire le frame APIC depuis les données déjà parsées (plus fiable que
    // re-parser les bytes bruts, qui peut échouer sur certains encodages)
    const apicFrame = existing.picture ? buildApicFrame(existing.picture) : null
    const apicLen = apicFrame?.length ?? 0

    // Construire le fichier final : [tag mutagen] + [APIC si présent] + [audio]
    const result = new Uint8Array(tagBytes.length + apicLen + audioData.length)
    result.set(tagBytes)
    if (apicFrame) {
      result.set(apicFrame, tagBytes.length)
      // Mettre à jour la taille du tag dans le header pour inclure l'APIC
      const newTagSize = tagSize + apicLen
      result[6] = (newTagSize >>> 21) & 0x7F
      result[7] = (newTagSize >>> 14) & 0x7F
      result[8] = (newTagSize >>> 7) & 0x7F
      result[9] = newTagSize & 0x7F
    }
    result.set(audioData, tagBytes.length + apicLen)

    return result.buffer
  } catch {
    return null
  }
}

/**
 * Fallback : écrit les tags enrichis localement avec browser-id3-writer.
 * N'écrit PAS GRP1 (non supporté) — Apple Music n'affichera pas le Regroupement.
 * Utilisé uniquement si writeTagsViaBackend échoue (réseau indisponible, etc.).
 */
export function writeTags(
  arrayBuffer: ArrayBuffer,
  existing: ParsedTags,
  enriched: EnrichResult,
): ArrayBuffer {
  const writer = new Writer(arrayBuffer)

  if (existing.title)           writer.setFrame('TIT2', existing.title)
  if (existing.artist)          writer.setFrame('TPE1', [existing.artist])
  if (existing.track)           writer.setFrame('TRCK', String(existing.track))

  // Année — priorité API, sinon existante
  const year = enriched.year ?? existing.year
  if (year)                     writer.setFrame('TYER', String(year))

  const album = enriched.album || existing.album
  if (album)                    writer.setFrame('TALB', album)

  if (existing.picture) {
    const pic = existing.picture
    const data = pic.data instanceof Uint8Array
      ? pic.data.buffer.slice(pic.data.byteOffset, pic.data.byteOffset + pic.data.byteLength)
      : pic.data
    writer.setFrame('APIC', { type: 3, data, description: '', useUnicodeEncoding: false })
  }

  if (enriched.album_artist)    writer.setFrame('TPE2', enriched.album_artist)
  else if (existing.albumArtist) writer.setFrame('TPE2', existing.albumArtist)

  const genre = enriched.genre || existing.genre
  if (genre)                    writer.setFrame('TCON', [genre])

  if (enriched.label)           writer.setFrame('TCOM', [enriched.label])
  else if (existing.composer)   writer.setFrame('TCOM', [existing.composer])

  // TIT1 = Content Group (standard) — pas GRP1, ne s'affiche pas comme "Regroupement" dans Apple Music
  const catalog = enriched.catalog || existing.grouping
  if (catalog)                  writer.setFrame('TIT1', catalog)

  writer.addTag()
  return writer.arrayBuffer
}

/**
 * Construit un frame APIC (cover art) ID3v2.3 depuis les données déjà parsées.
 * Plus fiable que re-parser les bytes bruts du fichier original, qui peut échouer
 * sur certains encodages (extended header, taille synchsafe vs big-endian, etc.).
 */
function buildApicFrame(picture: mm.IPicture): Uint8Array {
  const mime = new TextEncoder().encode(picture.format || 'image/jpeg')
  const picData = picture.data instanceof Uint8Array
    ? picture.data
    : new Uint8Array((picture.data as any).buffer ?? picture.data)

  // Contenu du frame : encoding(1) + mime + null(1) + picType(1) + desc null(1) + data
  const frameDataLen = 1 + mime.length + 1 + 1 + 1 + picData.length
  const frameData = new Uint8Array(frameDataLen)
  let pos = 0
  frameData[pos++] = 0x00             // encoding ISO-8859-1
  frameData.set(mime, pos); pos += mime.length
  frameData[pos++] = 0x00             // null après le MIME type
  frameData[pos++] = 0x03             // picture type : Cover front
  frameData[pos++] = 0x00             // description vide (null terminator)
  frameData.set(picData, pos)

  // Header du frame : "APIC" + taille big-endian 4 octets + flags 2 octets
  const frame = new Uint8Array(10 + frameDataLen)
  frame[0] = 0x41; frame[1] = 0x50; frame[2] = 0x49; frame[3] = 0x43 // 'APIC'
  frame[4] = (frameDataLen >>> 24) & 0xFF
  frame[5] = (frameDataLen >>> 16) & 0xFF
  frame[6] = (frameDataLen >>> 8)  & 0xFF
  frame[7] =  frameDataLen         & 0xFF
  frame[8] = 0x00; frame[9] = 0x00  // flags
  frame.set(frameData, 10)
  return frame
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
