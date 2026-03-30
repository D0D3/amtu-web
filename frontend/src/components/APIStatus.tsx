import { useQuery } from '@tanstack/react-query'
import { getApiStatus } from '../lib/api'
import type { ApiStatus } from '../lib/types'

const ServiceDot = ({ label, status }: { label: string; status: { enabled: boolean; connected: boolean; error?: string } }) => {
  const color = !status.enabled
    ? 'bg-gray-300 dark:bg-gray-600'
    : status.connected
    ? 'bg-green-400'
    : 'bg-red-400'

  const bgLight = !status.enabled
    ? 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600'
    : status.connected
    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'

  const textColor = !status.enabled
    ? 'text-gray-400 dark:text-gray-500'
    : status.connected
    ? 'text-green-700 dark:text-green-400'
    : 'text-red-600 dark:text-red-400'

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${bgLight}`}>
      <span className={`w-2 h-2 rounded-full ${color}`} />
      <span className={textColor}>{label}</span>
    </div>
  )
}

export function APIStatus() {
  const { data, isLoading } = useQuery<ApiStatus>({
    queryKey: ['api-status'],
    queryFn: getApiStatus,
    refetchInterval: 30000,
    retry: 1,
  })

  if (isLoading || !data) {
    return (
      <div className="flex gap-2">
        {['MusicBrainz', 'Spotify', 'Discogs'].map(s => (
          <div key={s} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600">
            <span className="w-2 h-2 rounded-full bg-gray-200 dark:bg-gray-600 animate-pulse" />
            <span className="text-xs text-gray-400 dark:text-gray-500">{s}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex gap-2">
      <ServiceDot label="MusicBrainz" status={data.musicbrainz} />
      <ServiceDot label="Spotify" status={data.spotify} />
      <ServiceDot label="Discogs" status={data.discogs} />
    </div>
  )
}
