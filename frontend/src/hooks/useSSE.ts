import { useEffect, useRef, useCallback } from 'react'
import type { SSEEvent } from '../lib/types'

type SSEHandler = (event: SSEEvent) => void

export function useSSE(jobId: string | null, onEvent: SSEHandler) {
  const esRef = useRef<EventSource | null>(null)

  const connect = useCallback(() => {
    if (!jobId) return
    if (esRef.current) esRef.current.close()

    const token = localStorage.getItem('amtu_token') || ''
    const es = new EventSource(`/api/jobs/${jobId}/stream?token=${encodeURIComponent(token)}`)

    es.onmessage = (e) => {
      try {
        const data: SSEEvent = JSON.parse(e.data)
        onEvent(data)
      } catch {
        // ignorer heartbeat malformé
      }
    }
    es.onerror = () => es.close()
    esRef.current = es
  }, [jobId, onEvent])

  useEffect(() => {
    connect()
    return () => {
      esRef.current?.close()
      esRef.current = null
    }
  }, [connect])

  return {
    disconnect: () => {
      esRef.current?.close()
      esRef.current = null
    }
  }
}
