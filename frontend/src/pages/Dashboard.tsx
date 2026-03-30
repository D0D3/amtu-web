import { useState, useCallback, useRef } from 'react'
import {
  FolderOpen, Play, Square, CheckCircle2, SkipForward,
  AlertCircle, RefreshCw, Eye, Tag, ChevronDown, ChevronRight,
} from 'lucide-react'
import { enrichTrack, saveHistoryBatch } from '../lib/api'
import { readTags, writeTags, collectMp3Files } from '../lib/localProcessor'
import type { LocalTrackResult } from '../lib/types'

type Filter = 'all' | 'updated' | 'skipped' | 'error'

const CONFIDENCE_THRESHOLD = 60

export function Dashboard() {
  const [folderName, setFolderName] = useState('')
  const [fileEntries, setFileEntries] = useState<
    Array<{ name: string; relativePath: string; handle: FileSystemFileHandle }>
  >([])
  const [isScanning, setIsScanning] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processed, setProcessed] = useState(0)
  const [currentFile, setCurrentFile] = useState('')
  const [results, setResults] = useState<LocalTrackResult[]>([])
  const [summary, setSummary] = useState<{
    updated: number; skipped: number; errors: number; total: number
  } | null>(null)
  const [dryRun, setDryRun] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const abortRef = useRef(false)

  const toggleRow = (i: number) =>
    setExpandedRows(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })

  const resetState = () => {
    setResults([])
    setSummary(null)
    setProcessed(0)
    setFileEntries([])
  }

  // ── Sélection d'un dossier (File System Access API) ──
  const handlePickFolder = useCallback(async () => {
    if (!('showDirectoryPicker' in window)) {
      alert('Cette fonctionnalité nécessite Chrome ou Edge.')
      return
    }
    try {
      const dirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
      setFolderName(dirHandle.name)
      setIsScanning(true)
      resetState()
      const entries = await collectMp3Files(dirHandle)
      setFileEntries(entries)
      setIsScanning(false)
    } catch {
      setIsScanning(false)
    }
  }, [])

  // ── Sélection de fichiers individuels ──
  const handlePickFiles = useCallback(async () => {
    if (!('showOpenFilePicker' in window)) {
      alert('Cette fonctionnalité nécessite Chrome ou Edge.')
      return
    }
    try {
      const handles: FileSystemFileHandle[] = await (window as any).showOpenFilePicker({
        multiple: true,
        types: [{ description: 'Fichiers MP3', accept: { 'audio/mpeg': ['.mp3'] } }],
      })
      if (!handles.length) return
      resetState()
      setFolderName(`${handles.length} fichier${handles.length > 1 ? 's' : ''} sélectionné${handles.length > 1 ? 's' : ''}`)
      const entries = handles.map(h => ({ name: h.name, relativePath: h.name, handle: h }))
      setFileEntries(entries)
    } catch {
      // annulé
    }
  }, [])

  // ── Traitement ──
  const handleProcess = useCallback(async () => {
    if (!fileEntries.length) return
    abortRef.current = false
    setIsProcessing(true)
    setResults([])
    setSummary(null)
    setProcessed(0)
    setExpandedRows(new Set())

    let updated = 0, skipped = 0, errors = 0
    const batchResults: typeof results = []

    // ── Phase 1 : lecture des tags pour groupement par album ──
    type EntryWithTags = { entry: typeof fileEntries[0]; tags: Awaited<ReturnType<typeof readTags>> | null }
    const entriesWithTags: EntryWithTags[] = []
    for (const entry of fileEntries) {
      try {
        const file = await entry.handle.getFile()
        const buf = await file.arrayBuffer()
        const tags = await readTags(buf)
        entriesWithTags.push({ entry, tags })
      } catch {
        entriesWithTags.push({ entry, tags: null })
      }
    }

    // ── Phase 2 : groupement par album (tag album identique = même groupe) ──
    const groups = new Map<string, EntryWithTags[]>()
    for (const et of entriesWithTags) {
      const key = et.tags?.album?.trim() || `__solo__${et.entry.name}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(et)
    }

    // ── Phase 3 : traitement par groupe ──
    let processedCount = 0
    for (const [albumKey, group] of groups) {
      if (abortRef.current) break

      const isAlbum = !albumKey.startsWith('__solo__')
      const isEP = isAlbum && group.length < 7

      // Recherche API sur le premier fichier valide du groupe uniquement
      let groupEnriched: Awaited<ReturnType<typeof enrichTrack>> | null = null
      const firstValid = group.find(et => et.tags?.title && et.tags?.artist)

      if (firstValid?.tags) {
        setCurrentFile(isAlbum
          ? `${albumKey} (${isEP ? 'EP' : 'Album'} · ${group.length} pistes)`
          : firstValid.entry.relativePath
        )
        try {
          groupEnriched = await enrichTrack({
            title: firstValid.tags.title,
            artist: firstValid.tags.artist,
            album: firstValid.tags.album,
            current_genre: firstValid.tags.genre,
          })
        } catch {
          groupEnriched = null
        }
      }

      // Application à chaque fichier du groupe
      for (const { entry, tags } of group) {
        if (abortRef.current) break
        processedCount++
        setProcessed(processedCount)

        try {
          if (!tags) {
            skipped++
            const r = { file_name: entry.name, relative_path: entry.relativePath, status: 'skipped' as const, confidence: 0, source: '', skip_reason: 'Lecture des tags impossible' }
            batchResults.push(r); setResults(p => [r, ...p]); continue
          }

          if (!tags.title || !tags.artist) {
            skipped++
            const r = { file_name: entry.name, relative_path: entry.relativePath, status: 'skipped' as const, confidence: 0, source: '', skip_reason: 'Tags titre/artiste manquants' }
            batchResults.push(r); setResults(p => [r, ...p]); continue
          }

          if (!groupEnriched || !groupEnriched.found) {
            skipped++
            const r = { file_name: entry.name, relative_path: entry.relativePath, status: 'skipped' as const, confidence: groupEnriched?.confidence || 0, source: '', skip_reason: groupEnriched?.skip_reason || 'Non trouvé' }
            batchResults.push(r); setResults(p => [r, ...p]); continue
          }

          if (!dryRun) {
            const file = await entry.handle.getFile()
            const arrayBuffer = await file.arrayBuffer()
            const newBuffer = writeTags(arrayBuffer, tags, groupEnriched)
            const writable = await (entry.handle as any).createWritable()
            await writable.write(newBuffer)
            await writable.close()
          }

          updated++
          const r = {
            file_name: entry.name, relative_path: entry.relativePath,
            status: (dryRun ? 'dry_run' : 'updated') as any,
            confidence: groupEnriched.confidence, source: groupEnriched.source,
            label: groupEnriched.label, catalog: groupEnriched.catalog,
            genre_before: tags.genre, genre_after: groupEnriched.genre,
            album_artist_after: groupEnriched.album_artist,
          }
          batchResults.push(r); setResults(p => [r, ...p])

        } catch (e: any) {
          errors++
          const r = { file_name: entry.name, relative_path: entry.relativePath, status: 'error' as const, confidence: 0, source: '', error_message: e?.message || String(e) }
          batchResults.push(r); setResults(p => [r, ...p])
        }
      }
    }

    setSummary({ updated, skipped, errors, total: fileEntries.length })
    setIsProcessing(false)
    setCurrentFile('')

    // Sauvegarder tous les résultats en historique
    const batch = batchResults.map(r => ({
      file_name: r.file_name,
      status: (r.status === 'dry_run' ? 'updated' : r.status) as string,
      dry_run: dryRun,
      confidence: r.confidence || 0,
      source_api: r.source || '',
      artist_before: '',
      genre_before: r.genre_before || '',
      label_after: r.label || '',
      catalog_after: r.catalog || '',
      genre_after: r.genre_after || '',
      skip_reason: r.skip_reason || '',
      error_message: r.error_message || '',
    }))
    if (batch.length > 0) {
      saveHistoryBatch(batch).catch(() => {})
    }
  }, [fileEntries, dryRun])

  const handleCancel = () => { abortRef.current = true }

  const progress = fileEntries.length > 0 ? Math.round((processed / fileEntries.length) * 100) : 0
  const filteredResults = results.filter(r =>
    filter === 'all' ? true
    : filter === 'updated' ? (r.status === 'updated' || r.status === 'dry_run')
    : filter === 'skipped' ? r.status === 'skipped'
    : r.status === 'error'
  )

  const statusColor = {
    updated: 'text-green-700 bg-green-50 border-green-100 dark:text-green-400 dark:bg-green-900/20 dark:border-green-800',
    dry_run: 'text-blue-700 bg-blue-50 border-blue-100 dark:text-blue-400 dark:bg-blue-900/20 dark:border-blue-800',
    skipped: 'text-amber-700 bg-amber-50 border-amber-100 dark:text-amber-400 dark:bg-amber-900/20 dark:border-amber-800',
    error:   'text-red-700 bg-red-50 border-red-100 dark:text-red-400 dark:bg-red-900/20 dark:border-red-800',
  }
  const statusLabel = {
    updated: 'Mis à jour', dry_run: 'Aperçu', skipped: 'Ignoré', error: 'Erreur',
  }

  return (
    <div className="space-y-6">

      {/* Sélection dossier */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-5">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Dossier à traiter</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Les fichiers sont lus et modifiés directement sur votre Mac / PC — rien n'est envoyé au serveur.
          </p>
        </div>

        {/* Boutons de sélection */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handlePickFolder}
            disabled={isProcessing}
            className={`
              flex flex-col items-center justify-center gap-3 py-8 rounded-xl border-2 border-dashed transition-all
              ${isScanning ? 'border-amtu-300 bg-amtu-50 dark:bg-amtu-900/20 cursor-wait'
                : folderName ? 'border-amtu-400 bg-amtu-50 dark:bg-amtu-900/20 hover:bg-amtu-100 dark:hover:bg-amtu-900/30'
                : 'border-gray-200 dark:border-gray-600 hover:border-amtu-400 hover:bg-amtu-50 dark:hover:bg-amtu-900/20 cursor-pointer'}
              ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${folderName ? 'bg-amtu-100 dark:bg-amtu-900/30' : 'bg-gray-100 dark:bg-gray-700'}`}>
              {isScanning
                ? <RefreshCw className="w-6 h-6 text-amtu-500 animate-spin" />
                : <FolderOpen className={`w-6 h-6 ${folderName ? 'text-amtu-500' : 'text-gray-400 dark:text-gray-500'}`} />
              }
            </div>
            <div className="text-center">
              {isScanning ? (
                <p className="font-medium text-amtu-700 dark:text-amtu-400 text-sm">Lecture...</p>
              ) : folderName ? (
                <>
                  <p className="font-semibold text-amtu-700 dark:text-amtu-400 text-sm truncate max-w-[160px]">{folderName}</p>
                  <p className="text-xs text-amtu-500 mt-0.5">
                    {fileEntries.length} fichier{fileEntries.length > 1 ? 's' : ''} MP3
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Changer de dossier</p>
                </>
              ) : (
                <>
                  <p className="font-medium text-gray-700 dark:text-gray-200 text-sm">Choisir un dossier</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Tous les MP3 du dossier</p>
                </>
              )}
            </div>
          </button>

          <button
            onClick={handlePickFiles}
            disabled={isProcessing || isScanning}
            className={`
              flex flex-col items-center justify-center gap-3 py-8 rounded-xl border-2 border-dashed transition-all
              border-gray-200 dark:border-gray-600 hover:border-amtu-400 hover:bg-amtu-50 dark:hover:bg-amtu-900/20 cursor-pointer
              ${isProcessing || isScanning ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <div className="w-12 h-12 rounded-full flex items-center justify-center bg-gray-100 dark:bg-gray-700">
              <Tag className="w-6 h-6 text-gray-400 dark:text-gray-500" />
            </div>
            <div className="text-center">
              <p className="font-medium text-gray-700 dark:text-gray-200 text-sm">Choisir des fichiers</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Sélection individuelle MP3</p>
            </div>
          </button>
        </div>

        {/* Options + actions */}
        {fileEntries.length > 0 && (
          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <button
                type="button"
                onClick={() => setDryRun(!dryRun)}
                className={`relative w-10 h-6 rounded-full transition-colors focus:outline-none ${dryRun ? 'bg-amtu-500' : 'bg-gray-200 dark:bg-gray-600'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${dryRun ? 'translate-x-4' : ''}`} />
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-1">
                <Eye className="w-3.5 h-3.5" />
                Aperçu <span className="text-gray-400 dark:text-gray-500">(sans modifier les fichiers)</span>
              </span>
            </label>

            <div className="flex gap-2">
              {isProcessing && (
                <button
                  onClick={handleCancel}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-medium"
                >
                  <Square className="w-4 h-4" /> Annuler
                </button>
              )}
              <button
                onClick={handleProcess}
                disabled={isProcessing || fileEntries.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amtu-500 hover:bg-amtu-600 text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              >
                <Play className="w-4 h-4" />
                {dryRun ? 'Analyser' : `Traiter ${fileEntries.length} fichier${fileEntries.length > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Progression */}
      {(isProcessing || summary) && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
              {isProcessing ? `${processed} / ${fileEntries.length}` : 'Terminé'}
            </span>
            <span className="text-sm text-gray-400 dark:text-gray-500">{progress}%</span>
          </div>
          <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${summary && !isProcessing ? 'bg-green-500' : 'bg-amtu-500'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          {currentFile && isProcessing && (
            <p className="text-xs text-gray-400 dark:text-gray-500 truncate flex items-center gap-1.5">
              <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
              {currentFile}
            </p>
          )}

          {summary && (
            <div className="grid grid-cols-3 gap-3 pt-1">
              <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-100 dark:border-green-800">
                <CheckCircle2 className="w-5 h-5 text-green-500 mx-auto mb-1" />
                <p className="text-xl font-bold text-green-700 dark:text-green-400">{summary.updated}</p>
                <p className="text-xs text-green-600 dark:text-green-500">{dryRun ? 'Trouvés' : 'Mis à jour'}</p>
              </div>
              <div className="text-center p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-800">
                <SkipForward className="w-5 h-5 text-amber-500 mx-auto mb-1" />
                <p className="text-xl font-bold text-amber-700 dark:text-amber-400">{summary.skipped}</p>
                <p className="text-xs text-amber-600 dark:text-amber-500">Ignorés</p>
              </div>
              <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-800">
                <AlertCircle className="w-5 h-5 text-red-500 mx-auto mb-1" />
                <p className="text-xl font-bold text-red-700 dark:text-red-400">{summary.errors}</p>
                <p className="text-xs text-red-600 dark:text-red-500">Erreurs</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Résultats */}
      {results.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">
              Résultats <span className="text-gray-400 dark:text-gray-500 font-normal text-sm">({results.length})</span>
            </h2>
            <div className="flex gap-1.5">
              {(['all', 'updated', 'skipped', 'error'] as Filter[]).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${filter === f ? 'bg-amtu-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                  {f === 'all' ? 'Tous' : f === 'updated' ? 'Traités' : f === 'skipped' ? 'Ignorés' : 'Erreurs'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
            {filteredResults.map((r, i) => {
              const hasDetails = (r.status === 'updated' || r.status === 'dry_run')
                ? !!(r.label || r.catalog || r.genre_after || r.album_artist_after || r.source)
                : !!(r.skip_reason || r.error_message)
              const isOpen = expandedRows.has(i)
              return (
                <div key={i} className={`rounded-xl border text-sm ${statusColor[r.status]}`}>
                  <button
                    type="button"
                    onClick={() => hasDetails && toggleRow(i)}
                    className={`w-full flex items-start justify-between gap-2 px-4 py-3 text-left ${hasDetails ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{r.file_name}</p>
                      {r.relative_path !== r.file_name && (
                        <p className="text-xs opacity-60 truncate mt-0.5">{r.relative_path}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                      <span className="text-xs font-semibold">{statusLabel[r.status]}</span>
                      {hasDetails && (
                        isOpen
                          ? <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                          : <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                      )}
                    </div>
                  </button>

                  {isOpen && hasDetails && (
                    <div className="px-4 pb-3 border-t border-current border-opacity-10">
                      {(r.status === 'updated' || r.status === 'dry_run') && (
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-80">
                          {r.label && <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{r.label}</span>}
                          {r.catalog && <span>Cat. {r.catalog}</span>}
                          {r.genre_after && r.genre_after !== r.genre_before && (
                            <span>{r.genre_before || '?'} → {r.genre_after}</span>
                          )}
                          {r.album_artist_after && <span>Album artist: {r.album_artist_after}</span>}
                          {r.source && <span className="opacity-50">{r.source} · {r.confidence.toFixed(0)}%</span>}
                        </div>
                      )}
                      {r.skip_reason && (
                        <p className="text-xs mt-2 opacity-70">{r.skip_reason}</p>
                      )}
                      {r.error_message && (
                        <p className="text-xs mt-2 opacity-80 font-mono break-all">{r.error_message}</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
