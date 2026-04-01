import { useQuery } from '@tanstack/react-query'
import * as Tooltip from '@radix-ui/react-tooltip'
import { getApiStatus } from '../lib/api'
import type { ApiStatus } from '../lib/types'

const SERVICES = [
  { key: 'musicbrainz', abbr: 'MB', full: 'MusicBrainz' },
  { key: 'spotify',     abbr: 'SP', full: 'Spotify' },
  { key: 'discogs',     abbr: 'DG', full: 'Discogs' },
] as const

function ServiceBadge({
  abbr, full, status,
}: {
  abbr: string
  full: string
  status: { enabled: boolean; connected: boolean; error?: string }
}) {
  const dotColor = !status.enabled
    ? 'bg-gray-300 dark:bg-gray-600'
    : status.connected
    ? 'bg-green-400'
    : 'bg-red-400'

  const pill = !status.enabled
    ? 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500'
    : status.connected
    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'

  const statusLabel = !status.enabled
    ? 'Désactivé'
    : status.connected
    ? 'Connecté'
    : status.error || 'Erreur de connexion'

  return (
    <Tooltip.Root delayDuration={150}>
      <Tooltip.Trigger asChild>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium cursor-default select-none ${pill}`}>
          <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
          <span>{abbr}</span>
        </div>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="bottom"
          sideOffset={6}
          className="z-50 px-3 py-2 rounded-lg shadow-lg border text-xs leading-snug
            bg-white dark:bg-gray-800
            border-gray-200 dark:border-gray-700
            text-gray-700 dark:text-gray-200
            animate-in fade-in-0 zoom-in-95"
        >
          <p className="font-semibold text-gray-900 dark:text-gray-100 mb-0.5">{full}</p>
          <p className={
            !status.enabled
              ? 'text-gray-400 dark:text-gray-500'
              : status.connected
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-500 dark:text-red-400'
          }>
            {statusLabel}
          </p>
          <Tooltip.Arrow className="fill-white dark:fill-gray-800" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

export function APIStatus() {
  const { data, isLoading } = useQuery<ApiStatus>({
    queryKey: ['api-status'],
    queryFn: getApiStatus,
    refetchInterval: 30000,
    retry: 1,
  })

  return (
    <Tooltip.Provider>
      <div className="flex gap-1.5">
        {isLoading || !data
          ? SERVICES.map(s => (
              <div key={s.key} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600">
                <span className="w-2 h-2 rounded-full bg-gray-200 dark:bg-gray-600 animate-pulse" />
                <span className="text-xs text-gray-400 dark:text-gray-500">{s.abbr}</span>
              </div>
            ))
          : SERVICES.map(s => (
              <ServiceBadge
                key={s.key}
                abbr={s.abbr}
                full={s.full}
                status={(data as any)[s.key]}
              />
            ))
        }
      </div>
    </Tooltip.Provider>
  )
}
