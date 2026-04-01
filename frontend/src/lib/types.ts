export interface User {
  id: number
  username: string
  first_name: string
  last_name: string
  email: string
  is_admin: boolean
  is_active?: boolean
  email_notifications: boolean
  created_at?: string
  is_online?: boolean
}

export interface Config {
  spotify_client_id: string
  spotify_client_secret_set: boolean
  discogs_token_set: boolean
  musicbrainz_enabled: boolean
  spotify_enabled: boolean
  discogs_enabled: boolean
  smtp_enabled: boolean
  smtp_host: string
  smtp_port: number
  smtp_user: string
  smtp_password_set: boolean
  smtp_from: string
  smtp_from_name: string
  smtp_tls: boolean
  max_genre_snapshots: number
  smtp_ssl: boolean
  cache_retention_months: number
  version: string
}

export interface ApiStatus {
  musicbrainz: { enabled: boolean; connected: boolean; error?: string }
  spotify: { enabled: boolean; connected: boolean; error?: string }
  discogs: { enabled: boolean; connected: boolean; error?: string }
}

export interface Job {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  total_files: number
  processed_files: number
  updated_files: number
  skipped_files: number
  error_files: number
  dry_run: boolean
  created_at: string
  completed_at?: string
}

export interface TrackTags {
  title?: string
  artist?: string
  album?: string
  label?: string
  catalog?: string
  genre?: string
  year?: string
}

export interface TrackResult {
  file_name: string
  status: 'updated' | 'skipped' | 'error'
  confidence: number
  source_api: string
  before: TrackTags
  after: TrackTags
  skip_reason?: string
  error_message?: string
  error_type?: 'api' | 'write'
  label?: string
}

export interface SSEEvent {
  type: 'started' | 'progress' | 'file_done' | 'completed' | 'error' | 'heartbeat'
  job_id?: string
  total?: number
  current?: number
  percent?: number
  file?: string
  status?: string
  confidence?: number
  source?: string
  label?: string
  skip_reason?: string
  error?: string
  error_type?: 'api' | 'write'
  before?: TrackTags
  after?: TrackTags
  updated?: number
  skipped?: number
  errors?: number
  message?: string
}

export interface HistoryItem {
  id: number
  job_id: string
  file_name: string
  status: string
  confidence: number
  source_api: string
  artist: string
  album: string
  label: string
  genre: string
  processed_at: string
  before: TrackTags
  after: TrackTags
  skip_reason?: string
  error_message?: string
  dry_run?: boolean
  created_by?: number
  username?: string
}

export interface GenreMapping {
  id: number
  source: string
  target: string
  is_mine: boolean
  is_global: boolean
}

export interface GenreMappings {
  genres: GenreMapping[]
  labels: GenreMapping[]
  artists: GenreMapping[]
}

export interface GenreSnapshot {
  id: number
  action: string
  username: string
  counts: { genres: number; labels: number; artists: number }
  created_at: string
}

export interface GenreAuditEntry {
  id: number
  action: string
  username: string
  details: string
  snapshot_id: number | null
  created_at: string
}

export interface EnrichResult {
  found: boolean
  label?: string
  catalog?: string
  genre?: string
  album_artist?: string
  album?: string
  year?: number
  confidence: number
  source: string
  is_single: boolean
  skip_reason?: string
}

export interface LocalTrackResult {
  file_name: string
  relative_path: string
  status: 'updated' | 'skipped' | 'error' | 'dry_run'
  confidence: number
  source: string
  label?: string
  catalog?: string
  genre_before?: string
  genre_after?: string
  album_artist_after?: string
  album_before?: string
  album_after?: string
  year_before?: number
  year_after?: number
  skip_reason?: string
  error_message?: string
  error_type?: 'write'  // toujours local côté navigateur
}

export interface Announcement {
  id: number
  message: string
  type: 'info' | 'warning' | 'error'
  target_user_id: number | null
  created_by: number | null
  created_at: string
  expires_at: string | null
}
