import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Music2, Tag, Users, Download, Upload, RotateCcw, Trash2, History, ChevronDown, ChevronUp, X, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { getGenreMappings, addGenreMapping, updateGenreMapping, deleteGenreMapping, exportGenreMappings, importGenreMappings, getGenreSnapshots, rollbackGenreSnapshot, deleteGenreSnapshot, getGenreAuditLog } from '../lib/api'
import { GenreTable } from '../components/GenreTable'
import { useAuth } from '../contexts/AuthContext'
import type { GenreMappings, GenreSnapshot, GenreAuditEntry } from '../lib/types'
import { useState, useRef } from 'react'

type Tab = 'labels' | 'artists' | 'genres'

const tabs: { id: Tab; label: string; icon: any; source: string; target: string }[] = [
  { id: 'labels', label: 'Labels', icon: Tag, source: 'Label', target: 'Genre' },
  { id: 'artists', label: 'Artistes', icon: Users, source: 'Artiste', target: 'Genre' },
  { id: 'genres', label: 'Aliases', icon: Music2, source: 'Alias', target: 'Genre canonique' },
]

const actionLabel: Record<string, string> = {
  export: 'Export',
  import: 'Import',
  rollback: 'Rollback',
  'pre-import': 'Snapshot avant import',
  'pre-rollback': 'Snapshot avant rollback',
  manual: 'Manuel',
}

const actionColor: Record<string, string> = {
  export: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20',
  import: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20',
  rollback: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20',
}

function ImportModal({ onClose, onImport, isLoading, apiError }: {
  onClose: () => void
  onImport: (data: any) => void
  isLoading: boolean
  apiError?: string
}) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setText(ev.target?.result as string)
    reader.readAsText(file)
  }

  const handleSubmit = () => {
    setError('')
    try {
      const parsed = JSON.parse(text)
      if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Format invalide')
      const data = {
        genres: parsed.genres || {},
        labels: parsed.labels || {},
        artists: parsed.artists || {},
      }
      onImport(data)
    } catch (e: any) {
      setError(e.message || 'JSON invalide')
    }
  }

  const displayError = error || apiError

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-800 dark:text-gray-100">Import JSON complet</h3>
          <button onClick={onClose} disabled={isLoading} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-40"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-lg p-3 flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>L'import <strong>remplace</strong> l'intégralité des mappings globaux. Un snapshot de l'état actuel est créé automatiquement avant l'opération.</span>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Format attendu : <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{"{ \"labels\": {...}, \"artists\": {...}, \"genres\": {...} }"}</code>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Fichier JSON</label>
            <input ref={fileRef} type="file" accept=".json" onChange={handleFile} disabled={isLoading}
              className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-gray-200 dark:file:border-gray-600 file:text-sm file:font-medium file:bg-gray-50 dark:file:bg-gray-700 file:text-gray-700 dark:file:text-gray-200 hover:file:bg-gray-100 dark:hover:file:bg-gray-600 cursor-pointer disabled:opacity-50" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">… ou collez le JSON</label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={8}
              disabled={isLoading}
              placeholder='{"labels": {"Hospital Records": "Drum & Bass"}, "artists": {}, "genres": {}}'
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-xs font-mono bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amtu-500 resize-none disabled:opacity-50"
            />
          </div>
          {displayError && (
            <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {displayError}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-700">
          <button onClick={onClose} disabled={isLoading} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50">Annuler</button>
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || isLoading}
            className="flex items-center gap-2 px-5 py-2 bg-amtu-500 hover:bg-amtu-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                </svg>
                Import en cours…
              </>
            ) : 'Importer'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SnapshotsPanel({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { data: snapshots, isLoading } = useQuery<GenreSnapshot[]>({
    queryKey: ['genre-snapshots'],
    queryFn: getGenreSnapshots,
  })
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const rollbackMutation = useMutation({
    mutationFn: rollbackGenreSnapshot,
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['genres'] })
      qc.invalidateQueries({ queryKey: ['genre-snapshots'] })
      qc.invalidateQueries({ queryKey: ['genre-audit'] })
      setConfirmId(null)
      setResult('Rollback effectué avec succès.')
      setTimeout(() => setResult(null), 4000)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteGenreSnapshot,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['genre-snapshots'] }),
  })

  const fmt = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <RotateCcw className="w-4 h-4 text-orange-500" />
          Snapshots & Rollback
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X className="w-4 h-4" /></button>
      </div>

      {result && (
        <div className="mx-6 mt-4 flex items-center gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700/40 rounded-lg px-3 py-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {result}
        </div>
      )}

      <div className="p-6">
        {isLoading ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">Chargement...</p>
        ) : !snapshots?.length ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">Aucun snapshot disponible. Les snapshots sont créés automatiquement avant chaque import ou rollback.</p>
        ) : (
          <div className="space-y-2">
            {snapshots.map(snap => (
              <div key={snap.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-gray-500 dark:text-gray-400">#{snap.id}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${actionColor[snap.action] || 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-600'}`}>
                      {actionLabel[snap.action] || snap.action}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">par <strong>{snap.username}</strong></span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{fmt(snap.created_at)}</span>
                  </div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {snap.counts.labels} labels · {snap.counts.artists} artistes · {snap.counts.genres} aliases
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {confirmId === snap.id ? (
                    <>
                      <span className="text-xs text-orange-600 dark:text-orange-400">Confirmer ?</span>
                      <button
                        onClick={() => rollbackMutation.mutate(snap.id)}
                        disabled={rollbackMutation.isPending}
                        className="text-xs px-2 py-1 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium disabled:opacity-50"
                      >
                        Oui
                      </button>
                      <button onClick={() => setConfirmId(null)} className="text-xs px-2 py-1 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">Non</button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmId(snap.id)}
                      className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-orange-200 dark:border-orange-700/40 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg font-medium transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Restaurer
                    </button>
                  )}
                  <button
                    onClick={() => deleteMutation.mutate(snap.id)}
                    disabled={deleteMutation.isPending}
                    className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    title="Supprimer ce snapshot"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function AuditLogPanel({ onClose }: { onClose: () => void }) {
  const { data: logs, isLoading } = useQuery<GenreAuditEntry[]>({
    queryKey: ['genre-audit'],
    queryFn: getGenreAuditLog,
  })

  const fmt = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <History className="w-4 h-4 text-blue-500" />
          Journal d'audit
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X className="w-4 h-4" /></button>
      </div>
      <div className="p-6">
        {isLoading ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">Chargement...</p>
        ) : !logs?.length ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">Aucune action enregistrée pour l'instant.</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {logs.map(entry => (
              <div key={entry.id} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${actionColor[entry.action] || 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-600'}`}>
                  {actionLabel[entry.action] || entry.action}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-700 dark:text-gray-200">{entry.details}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    par <strong>{entry.username}</strong> · {fmt(entry.created_at)}
                    {entry.snapshot_id && <span className="ml-1 font-mono">(snap #{entry.snapshot_id})</span>}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function Genres() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('labels')
  const { data, isLoading } = useQuery<GenreMappings>({
    queryKey: ['genres'],
    queryFn: getGenreMappings,
  })

  const addMutation = useMutation({
    mutationFn: ({ type, source, target }: { type: string; source: string; target: string }) =>
      addGenreMapping(type, source, target),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['genres'] })
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, source, target }: { id: number; source: string; target: string }) =>
      updateGenreMapping(id, source, target),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['genres'] })
  })

  const deleteMutation = useMutation({
    mutationFn: deleteGenreMapping,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['genres'] })
  })

  const [showImport, setShowImport] = useState(false)
  const [showSnapshots, setShowSnapshots] = useState(false)
  const [showAudit, setShowAudit] = useState(false)
  const [importResult, setImportResult] = useState<{ counts: Record<string, number> } | null>(null)

  const importMutation = useMutation({
    mutationFn: importGenreMappings,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['genres'] })
      qc.invalidateQueries({ queryKey: ['genre-snapshots'] })
      qc.invalidateQueries({ queryKey: ['genre-audit'] })
      setShowImport(false)
      setImportResult(data)
      setTimeout(() => setImportResult(null), 6000)
    },
    onError: () => {},
  })

  const currentTab = tabs.find(t => t.id === activeTab)!
  const typeMap: Record<Tab, string> = { labels: 'label', artists: 'artist', genres: 'genre' }
  const isAdmin = !!user?.is_admin

  return (
    <div className="max-w-3xl space-y-4">
      {/* Panel admin — outils */}
      {isAdmin && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 px-6 py-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">Administration des listes globales</p>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => exportGenreMappings()}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
              >
                <Download className="w-4 h-4" />
                Exporter JSON
              </button>
              <button
                onClick={() => setShowImport(true)}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
              >
                <Upload className="w-4 h-4" />
                Importer JSON
              </button>
              <button
                onClick={() => { setShowSnapshots(v => !v); setShowAudit(false) }}
                className={`flex items-center gap-1.5 text-sm px-3 py-1.5 border rounded-lg transition-colors font-medium ${showSnapshots ? 'border-orange-300 dark:border-orange-600 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300' : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
              >
                <RotateCcw className="w-4 h-4" />
                Snapshots
                {showSnapshots ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => { setShowAudit(v => !v); setShowSnapshots(false) }}
                className={`flex items-center gap-1.5 text-sm px-3 py-1.5 border rounded-lg transition-colors font-medium ${showAudit ? 'border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
              >
                <History className="w-4 h-4" />
                Journal
                {showAudit ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {importResult && (
            <div className="mt-3 flex items-center gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700/40 rounded-lg px-3 py-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Import réussi : {importResult.counts.labels} labels, {importResult.counts.artists} artistes, {importResult.counts.genres} aliases.
            </div>
          )}
        </div>
      )}

      {/* Snapshots panel */}
      {isAdmin && showSnapshots && (
        <SnapshotsPanel onClose={() => setShowSnapshots(false)} />
      )}

      {/* Audit log panel */}
      {isAdmin && showAudit && (
        <AuditLogPanel onClose={() => setShowAudit(false)} />
      )}

      {/* Mappings */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-gray-100 dark:border-gray-700">
          {tabs.map(tab => {
            const Icon = tab.icon
            const count = data?.[tab.id]?.length || 0
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'border-amtu-500 text-amtu-600 dark:text-amtu-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-amtu-100 dark:bg-amtu-900/30 text-amtu-700 dark:text-amtu-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 mb-4">
            {activeTab === 'labels' && 'Définit le genre automatiquement selon le label du morceau (ex: "Hospital Records" → "Drum & Bass").'}
            {activeTab === 'artists' && 'Assigne un genre selon l\'artiste (ex: "Noisia" → "Drum & Bass").'}
            {activeTab === 'genres' && 'Normalise les genres existants (ex: "dnb" → "Drum & Bass").'}
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-gray-400 dark:text-gray-500">Chargement...</div>
          ) : (
            <GenreTable
              mappings={data?.[activeTab] || []}
              sourceLabel={currentTab.source}
              targetLabel={currentTab.target}
              isAdmin={isAdmin}
              onAdd={(source, target) => addMutation.mutate({ type: typeMap[activeTab], source, target })}
              onUpdate={(id, source, target) => updateMutation.mutate({ id, source, target })}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          )}
        </div>
      </div>

      {/* Import modal */}
      {showImport && (
        <ImportModal
          onClose={() => { if (!importMutation.isPending) { setShowImport(false); importMutation.reset() } }}
          onImport={(data) => importMutation.mutate(data)}
          isLoading={importMutation.isPending}
          apiError={importMutation.error ? (importMutation.error as any)?.response?.data?.detail || 'Erreur lors de l\'import' : undefined}
        />
      )}
    </div>
  )
}
