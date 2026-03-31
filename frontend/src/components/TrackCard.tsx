import { CheckCircle2, XCircle, SkipForward, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import type { TrackResult } from '../lib/types'

const statusConfig = {
  updated: { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-50 border-green-100', label: 'Mis à jour' },
  skipped: { icon: SkipForward, color: 'text-amber-500', bg: 'bg-amber-50 border-amber-100', label: 'Ignoré' },
  error: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50 border-red-100', label: 'Erreur' },
}

const errorTypeBadge: Record<string, string> = { write: 'Locale', api: 'API' }

const sourceColors: Record<string, string> = {
  MusicBrainz: 'bg-purple-100 text-purple-700',
  Spotify: 'bg-green-100 text-green-700',
  Discogs: 'bg-orange-100 text-orange-700',
}

function TagDiff({ label, before, after }: { label: string; before?: string; after?: string }) {
  if (!before && !after) return null
  const changed = before !== after && after
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="text-gray-400 w-14 shrink-0 mt-0.5">{label}</span>
      <div className="flex flex-col gap-0.5">
        {before && (
          <span className={changed ? 'line-through text-gray-400' : 'text-gray-600'}>{before || '—'}</span>
        )}
        {changed && <span className="text-green-700 font-medium">{after}</span>}
      </div>
    </div>
  )
}

interface Props {
  track: TrackResult
  animate?: boolean
}

export function TrackCard({ track, animate }: Props) {
  const [expanded, setExpanded] = useState(false)
  const cfg = statusConfig[track.status] || statusConfig.error
  const Icon = cfg.icon

  return (
    <div className={`border rounded-lg ${cfg.bg} transition-all duration-300 ${animate ? 'animate-pulse' : ''}`}>
      <div className="flex items-center gap-3 p-3">
        <Icon className={`w-5 h-5 shrink-0 ${cfg.color}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{track.file_name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {track.after?.label && (
              <span className="text-xs text-gray-500">{track.after.label}</span>
            )}
            {track.skip_reason && (
              <span className="text-xs text-amber-600">{track.skip_reason}</span>
            )}
            {track.error_message && (
              <span className="text-xs text-red-600 truncate">{track.error_message}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {track.status === 'error' && track.error_type && (
            <span className="text-xs font-medium text-red-400 border border-red-300 rounded px-1">
              {errorTypeBadge[track.error_type] ?? track.error_type}
            </span>
          )}
          {track.source_api && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sourceColors[track.source_api] || 'bg-gray-100 text-gray-600'}`}>
              {track.source_api}
            </span>
          )}
          {track.confidence > 0 && (
            <span className="text-xs text-gray-500">{track.confidence.toFixed(0)}%</span>
          )}
          {track.status === 'updated' && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 hover:bg-white rounded transition-colors"
            >
              {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
          )}
        </div>
      </div>
      {expanded && track.status === 'updated' && (
        <div className="px-4 pb-3 border-t border-green-100 pt-3 space-y-1.5">
          <TagDiff label="Label" before={track.before?.label} after={track.after?.label} />
          <TagDiff label="Catalog" before={track.before?.catalog} after={track.after?.catalog} />
          <TagDiff label="Genre" before={track.before?.genre} after={track.after?.genre} />
          <TagDiff label="Album" before={track.before?.album} after={track.after?.album} />
        </div>
      )}
    </div>
  )
}
