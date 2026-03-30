import axios from 'axios'
import type { Config, ApiStatus, Job, TrackResult, HistoryItem, GenreMappings, User, EnrichResult, GenreSnapshot, GenreAuditEntry } from './types'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Inject token automatiquement
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('amtu_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// Redirect to login on 401
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401 && window.location.pathname !== '/login') {
      localStorage.removeItem('amtu_token')
      localStorage.removeItem('amtu_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// Auth
export const login = (username: string, password: string) =>
  api.post<{ access_token: string; token_type: string; user: User }>('/auth/login', { username, password }).then(r => r.data)

export const getMe = () => api.get<User>('/auth/me').then(r => r.data)

export const updateMe = (data: {
  username?: string; first_name?: string; last_name?: string
  email?: string; email_notifications?: boolean; password?: string
}) => api.patch<User>('/auth/me', data).then(r => r.data)

// Users (admin)
export const getUsers = () => api.get<User[]>('/users').then(r => r.data)

export const createUser = (data: {
  username: string; first_name: string; last_name: string
  email: string; password: string; is_admin?: boolean; email_notifications?: boolean
}) => api.post<User>('/users', data).then(r => r.data)

export const updateUser = (id: number, data: Partial<{
  first_name: string; last_name: string; email: string; password: string
  is_admin: boolean; is_active: boolean; email_notifications: boolean
}>) => api.patch(`/users/${id}`, data).then(r => r.data)

export const deleteUser = (id: number) => api.delete(`/users/${id}`).then(r => r.data)

// Enrich (traitement local File System Access API)
export const enrichTrack = (data: {
  title: string; artist: string; album?: string; current_genre?: string
}) => api.post<EnrichResult>('/enrich', data).then(r => r.data)

// Config
export const getConfig = () => api.get<Config>('/config').then(r => r.data)
export const saveConfig = (data: Partial<Config> & {
  spotify_client_secret?: string; discogs_token?: string; smtp_password?: string
}) => api.post('/config', data).then(r => r.data)
export const getApiStatus = () => api.get<ApiStatus>('/config/status').then(r => r.data)
export const testApis = () => api.post<ApiStatus>('/config/test').then(r => r.data)
export const testSmtp = () => api.post<{ success: boolean; message: string }>('/config/test-email').then(r => r.data)
export const getCacheStats = () => api.get<{ total: number; active: number; expired: number; total_hits: number; oldest_entry: string | null }>('/config/cache/stats').then(r => r.data)
export const purgeCache = (expiredOnly = false) => api.delete<{ success: boolean; deleted: number; scope: string }>(`/config/cache?expired_only=${expiredOnly}`).then(r => r.data)

// Jobs
export const createJob = (data: { file_paths?: string[]; scan_path?: string; dry_run?: boolean }) =>
  api.post<{ job_id: string; total_files: number }>('/jobs', data).then(r => r.data)
export const getJob = (jobId: string) => api.get<Job>(`/jobs/${jobId}`).then(r => r.data)
export const cancelJob = (jobId: string) => api.post(`/jobs/${jobId}/cancel`).then(r => r.data)
export const getJobResults = (jobId: string) => api.get<TrackResult[]>(`/jobs/${jobId}/results`).then(r => r.data)

// History
export const getHistory = (params?: { page?: number; per_page?: number; status?: string; artist?: string; user_id?: number }) =>
  api.get<{ total: number; page: number; per_page: number; items: HistoryItem[] }>('/history', { params }).then(r => r.data)
export const saveHistoryBatch = (entries: {
  file_name: string; status: string; dry_run: boolean; confidence: number; source_api: string;
  title_before?: string; artist_before?: string; album_before?: string; label_before?: string; genre_before?: string;
  label_after?: string; catalog_after?: string; genre_after?: string; album_after?: string;
  skip_reason?: string; error_message?: string;
}[]) => api.post('/history/batch', entries).then(r => r.data)
export const deleteHistory = (id: number) => api.delete(`/history/${id}`).then(r => r.data)
export const clearHistory = () => api.delete('/history').then(r => r.data)
export const exportHistory = () => {
  const token = localStorage.getItem('amtu_token')
  window.open(`/api/history/export${token ? `?token=${token}` : ''}`, '_blank')
}

// Genres
export const getGenreMappings = () => api.get<GenreMappings>('/genres/mappings').then(r => r.data)
export const addGenreMapping = (type: string, source: string, target: string) =>
  api.post('/genres/mappings', { type, source, target }).then(r => r.data)
export const updateGenreMapping = (id: number, source?: string, target?: string) =>
  api.put(`/genres/mappings/${id}`, { source, target }).then(r => r.data)
export const deleteGenreMapping = (id: number) => api.delete(`/genres/mappings/${id}`).then(r => r.data)

// Genres — admin (export / import / snapshots / audit)
export const exportGenreMappings = () => {
  const token = localStorage.getItem('amtu_token')
  window.open(`/api/genres/export${token ? `?token=${token}` : ''}`, '_blank')
}
export const importGenreMappings = (data: { genres: Record<string,string>; labels: Record<string,string>; artists: Record<string,string> }) =>
  api.post<{ success: boolean; counts: Record<string,number>; snapshot_id: number }>('/genres/import', data).then(r => r.data)
export const getGenreSnapshots = () => api.get<GenreSnapshot[]>('/genres/snapshots').then(r => r.data)
export const rollbackGenreSnapshot = (id: number) => api.post(`/genres/snapshots/${id}/rollback`).then(r => r.data)
export const deleteGenreSnapshot = (id: number) => api.delete(`/genres/snapshots/${id}`).then(r => r.data)
export const getGenreAuditLog = () => api.get<GenreAuditEntry[]>('/genres/audit-log').then(r => r.data)

// Files
export const uploadFiles = (files: File[]) => {
  const formData = new FormData()
  files.forEach(f => formData.append('files', f))
  return api.post<{ files: string[]; count: number }>('/files/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}
export const scanFolder = (path = '') =>
  api.get<{ files: any[]; folders: any[]; path: string }>('/files/scan', { params: { path } }).then(r => r.data)

export const healthCheck = () => api.get('/health').then(r => r.data)
