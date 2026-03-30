import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, Trash2, ChevronDown, ChevronRight, CheckCircle2, SkipForward, XCircle } from 'lucide-react'
import { getHistory, deleteHistory, clearHistory, exportHistory } from '../lib/api'
import type { HistoryItem } from '../lib/types'

const statusIcon = (s: string) => {
  if (s === 'updated') return <CheckCircle2 className="w-4 h-4 text-green-500" />
  if (s === 'skipped') return <SkipForward className="w-4 h-4 text-amber-500" />
  return <XCircle className="w-4 h-4 text-red-500" />
}

const DryRunBadge = () => (
  <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 uppercase tracking-wide">
    aperçu
  </span>
)

const sourceColors: Record<string, string> = {
  MusicBrainz: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
  Spotify: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  Discogs: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
}

function HistoryRow({ item, onDelete }: { item: HistoryItem; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/40 group transition-colors">
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setExpanded(!expanded)} className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400">
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            {statusIcon(item.status)}
          </div>
        </td>
        <td className="px-4 py-3">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate max-w-[200px]">
            {item.file_name}
            {item.dry_run && <DryRunBadge />}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{item.artist}</p>
        </td>
        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 hidden md:table-cell">{item.album}</td>
        <td className="px-4 py-3">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{item.label || '—'}</span>
        </td>
        <td className="px-4 py-3 hidden lg:table-cell">
          {item.source_api && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sourceColors[item.source_api] || 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
              {item.source_api}
            </span>
          )}
        </td>
        <td className="px-4 py-3 hidden lg:table-cell">
          {item.confidence > 0 && (
            <span className={`text-sm ${item.confidence >= 80 ? 'text-green-600 dark:text-green-400' : item.confidence >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-500 dark:text-red-400'}`}>
              {item.confidence.toFixed(0)}%
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500 hidden xl:table-cell">
          {new Date(item.processed_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </td>
        <td className="px-4 py-3">
          <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all">
            <Trash2 className="w-4 h-4" />
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} className="px-10 py-3 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
            <div className="grid grid-cols-2 gap-6 text-xs">
              <div>
                <p className="font-medium text-gray-500 dark:text-gray-400 mb-2">Avant</p>
                <div className="space-y-1 text-gray-700 dark:text-gray-300">
                  <p><span className="text-gray-400 dark:text-gray-500 w-16 inline-block">Label</span> {item.before?.label || '—'}</p>
                  <p><span className="text-gray-400 dark:text-gray-500 w-16 inline-block">Genre</span> {item.before?.genre || '—'}</p>
                  <p><span className="text-gray-400 dark:text-gray-500 w-16 inline-block">Album</span> {item.before?.album || '—'}</p>
                  <p><span className="text-gray-400 dark:text-gray-500 w-16 inline-block">Catalog</span> {item.before?.catalog || '—'}</p>
                </div>
              </div>
              <div>
                <p className="font-medium text-gray-500 dark:text-gray-400 mb-2">Après</p>
                <div className="space-y-1">
                  <p><span className="text-gray-400 dark:text-gray-500 w-16 inline-block">Label</span> <span className="text-green-700 dark:text-green-400 font-medium">{item.after?.label || '—'}</span></p>
                  <p><span className="text-gray-400 dark:text-gray-500 w-16 inline-block">Genre</span> <span className="text-green-700 dark:text-green-400 font-medium">{item.after?.genre || '—'}</span></p>
                  <p><span className="text-gray-400 dark:text-gray-500 w-16 inline-block">Album</span> <span className="text-green-700 dark:text-green-400 font-medium">{item.after?.album || '—'}</span></p>
                  <p><span className="text-gray-400 dark:text-gray-500 w-16 inline-block">Catalog</span> <span className="text-green-700 dark:text-green-400 font-medium">{item.after?.catalog || '—'}</span></p>
                </div>
              </div>
              {item.skip_reason && (
                <div className="col-span-2">
                  <p className="text-amber-600 dark:text-amber-400">Raison: {item.skip_reason}</p>
                </div>
              )}
              {item.error_message && (
                <div className="col-span-2">
                  <p className="text-red-600 dark:text-red-400">Erreur: {item.error_message}</p>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export function History() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [artistFilter, setArtistFilter] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['history', page, statusFilter, artistFilter],
    queryFn: () => getHistory({ page, per_page: 50, status: statusFilter || undefined, artist: artistFilter || undefined }),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteHistory,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['history'] })
  })

  const clearMutation = useMutation({
    mutationFn: clearHistory,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['history'] }); setConfirmClear(false) }
  })

  const totalPages = data ? Math.ceil(data.total / 50) : 1
  const inputClass = 'px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amtu-500'

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 flex flex-wrap items-center gap-3">
        <input
          value={artistFilter}
          onChange={e => { setArtistFilter(e.target.value); setPage(1) }}
          placeholder="Filtrer par artiste..."
          className={`${inputClass} w-48`}
        />
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
          className={inputClass}
        >
          <option value="">Tous les statuts</option>
          <option value="updated">Mis à jour</option>
          <option value="skipped">Ignorés</option>
          <option value="error">Erreurs</option>
        </select>
        <span className="text-sm text-gray-400 dark:text-gray-500 ml-auto">{data?.total || 0} entrée(s)</span>
        <button
          onClick={exportHistory}
          className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <Download className="w-4 h-4" /> Exporter CSV
        </button>
        {!confirmClear ? (
          <button
            onClick={() => setConfirmClear(true)}
            className="flex items-center gap-1.5 px-3 py-2 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <Trash2 className="w-4 h-4" /> Vider
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm text-red-600 dark:text-red-400">Confirmer ?</span>
            <button onClick={() => clearMutation.mutate()} className="text-sm text-red-600 dark:text-red-400 font-medium hover:underline">Oui</button>
            <button onClick={() => setConfirmClear(false)} className="text-sm text-gray-500 dark:text-gray-400 hover:underline">Non</button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-400 dark:text-gray-500">Chargement...</div>
        ) : !data?.items.length ? (
          <div className="p-12 text-center text-gray-400 dark:text-gray-500">
            <p className="text-lg font-medium mb-1">Aucun historique</p>
            <p className="text-sm">Lancez un traitement depuis le Dashboard</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
                <tr>
                  <th className="w-16 px-4 py-3" />
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Fichier</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden md:table-cell">Album</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Label</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden lg:table-cell">Source</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden lg:table-cell">Conf.</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden xl:table-cell">Date</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {data.items.map(item => (
                  <HistoryRow key={item.id} item={item} onDelete={() => deleteMutation.mutate(item.id)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">Préc.</button>
          <span className="text-sm text-gray-500 dark:text-gray-400">Page {page} / {totalPages}</span>
          <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">Suiv.</button>
        </div>
      )}
    </div>
  )
}
