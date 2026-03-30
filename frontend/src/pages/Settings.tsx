import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, TestTube, Eye, EyeOff, CheckCircle2, XCircle, Mail, Send, Database, Trash2, RefreshCw, Tag, ChevronDown } from 'lucide-react'
import { getConfig, saveConfig, testApis, testSmtp, getCacheStats, purgeCache } from '../lib/api'
import type { Config, ApiStatus } from '../lib/types'

// ─── Composant section repliable ────────────────────────────────────────────

function CollapsibleSection({ title, description, badge, defaultOpen = true, children }: {
  title: string
  description?: string
  badge?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <span className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{title}</span>
            {description && !open && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{description}</p>
            )}
          </div>
          {badge && <span className="shrink-0">{badge}</span>}
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && (
        <div className="px-6 pb-6 space-y-4 border-t border-gray-100 dark:border-gray-700 pt-4">
          {description && <p className="text-xs text-gray-400 dark:text-gray-500">{description}</p>}
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Sous-composants ─────────────────────────────────────────────────────────

function ServiceRow({
  name, label, description, enabled, onToggle
}: { name: string; label: string; description: string; enabled: boolean; onToggle: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between py-3.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <div>
        <p className="font-medium text-gray-800 dark:text-gray-100 text-sm">{label}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => onToggle(!enabled)}
        className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 focus:ring-amtu-500 ${enabled ? 'bg-amtu-500' : 'bg-gray-200 dark:bg-gray-600'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  )
}

function SecretInput({ label, placeholder, value, onChange, isSet }: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void; isSet?: boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
        {label}
        {isSet && !value && <span className="ml-2 text-xs text-green-600 dark:text-green-400 font-normal">● Configuré</span>}
      </label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={isSet && !value ? '••••••••••••••••' : placeholder}
          className="w-full pr-10 pl-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amtu-500 focus:border-transparent"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}

const statusIcon = (s: { enabled: boolean; connected: boolean; error?: string }) => {
  if (!s.enabled) return <span className="text-xs text-gray-400 dark:text-gray-500">Désactivé</span>
  if (s.connected) return <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400"><CheckCircle2 className="w-4 h-4" /> Connecté</span>
  return <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400"><XCircle className="w-4 h-4" /> {s.error || 'Erreur'}</span>
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function Settings() {
  const qc = useQueryClient()
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: getConfig })

  const [spotifyId, setSpotifyId] = useState('')
  const [spotifySecret, setSpotifySecret] = useState('')
  const [discogsToken, setDiscogsToken] = useState('')
  const [services, setServices] = useState<{ musicbrainz: boolean; spotify: boolean; discogs: boolean } | null>(null)
  const [saved, setSaved] = useState(false)
  const [testResults, setTestResults] = useState<ApiStatus | null>(null)

  // SMTP state
  const [maxSnapshots, setMaxSnapshots] = useState('')
  const [smtpEnabled, setSmtpEnabled] = useState<boolean | null>(null)
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState('')
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPassword, setSmtpPassword] = useState('')
  const [smtpFrom, setSmtpFrom] = useState('')
  const [smtpFromName, setSmtpFromName] = useState('')
  const [smtpTls, setSmtpTls] = useState<boolean | null>(null)
  const [smtpSsl, setSmtpSsl] = useState<boolean | null>(null)

  const [cacheRetention, setCacheRetention] = useState('')
  const [purgeResult, setPurgeResult] = useState<{ deleted: number; scope: string } | null>(null)

  const isSmtpEnabled = smtpEnabled ?? config?.smtp_enabled ?? false
  const isTls = smtpTls ?? config?.smtp_tls ?? true
  const isSsl = smtpSsl ?? config?.smtp_ssl ?? false

  const currentServices = services || {
    musicbrainz: config?.musicbrainz_enabled ?? true,
    spotify: config?.spotify_enabled ?? false,
    discogs: config?.discogs_enabled ?? false,
  }

  const saveMutation = useMutation({
    mutationFn: () => saveConfig({
      spotify_client_id: spotifyId || undefined,
      spotify_client_secret: spotifySecret || undefined,
      discogs_token: discogsToken || undefined,
      musicbrainz_enabled: currentServices.musicbrainz,
      spotify_enabled: currentServices.spotify,
      discogs_enabled: currentServices.discogs,
      smtp_enabled: isSmtpEnabled,
      smtp_host: smtpHost || undefined,
      smtp_port: smtpPort ? Number(smtpPort) : config?.smtp_port ?? 587,
      smtp_user: smtpUser || undefined,
      smtp_password: smtpPassword || undefined,
      smtp_from: smtpFrom || undefined,
      smtp_from_name: smtpFromName !== '' ? smtpFromName : config?.smtp_from_name ?? '',
      smtp_tls: isTls,
      max_genre_snapshots: maxSnapshots ? Math.max(3, Number(maxSnapshots)) : config?.max_genre_snapshots ?? 3,
      smtp_ssl: isSsl,
      cache_retention_months: cacheRetention ? Math.max(6, Math.min(24, Number(cacheRetention))) : config?.cache_retention_months ?? 6,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config'] })
      qc.invalidateQueries({ queryKey: ['api-status'] })
      setSaved(true)
      setSpotifyId(''); setSpotifySecret(''); setDiscogsToken('')
      setSmtpPassword(''); setSmtpFromName(''); setMaxSnapshots(''); setCacheRetention('')
      setTimeout(() => setSaved(false), 3000)
    }
  })

  const testMutation = useMutation({
    mutationFn: testApis,
    onSuccess: (data) => setTestResults(data)
  })

  const [smtpTestResult, setSmtpTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const smtpTestMutation = useMutation({
    mutationFn: testSmtp,
    onSuccess: (data) => {
      setSmtpTestResult({ success: true, message: data.message })
      setTimeout(() => setSmtpTestResult(null), 6000)
    },
    onError: (err: any) => {
      setSmtpTestResult({ success: false, message: err.response?.data?.detail || 'Erreur lors du test SMTP' })
      setTimeout(() => setSmtpTestResult(null), 6000)
    }
  })

  const toggleService = (name: string, v: boolean) => {
    setServices(() => ({ ...currentServices, [name]: v }))
  }

  const inputClass = 'w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amtu-500'

  // Badge statut email pour le header replié
  const smtpBadge = isSmtpEnabled
    ? <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium">Activé</span>
    : <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">Désactivé</span>

  return (
    <div className="max-w-2xl space-y-3">

      {/* Sources de métadonnées */}
      <CollapsibleSection
        title="Sources de métadonnées"
        description="MusicBrainz, Spotify, Discogs"
        defaultOpen={true}
      >
        <div className="-mt-2">
          <ServiceRow
            name="musicbrainz" label="MusicBrainz"
            description="Base de données musicale open-source — gratuit, aucune clé requise"
            enabled={currentServices.musicbrainz}
            onToggle={v => toggleService('musicbrainz', v)}
          />
          <ServiceRow
            name="spotify" label="Spotify"
            description="Nécessite un compte développeur Spotify"
            enabled={currentServices.spotify}
            onToggle={v => toggleService('spotify', v)}
          />
          <ServiceRow
            name="discogs" label="Discogs"
            description="Base de données vinyle/musique — token personnel requis"
            enabled={currentServices.discogs}
            onToggle={v => toggleService('discogs', v)}
          />
        </div>

        {/* Credentials Spotify */}
        {currentServices.spotify && (
          <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-700">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Spotify API</p>
            <div className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
              Créez une app sur <span className="font-mono">developer.spotify.com/dashboard</span> pour obtenir vos credentials.
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Client ID</label>
              <input value={spotifyId} onChange={e => setSpotifyId(e.target.value)}
                placeholder={config?.spotify_client_id || 'Votre Client ID Spotify'} className={inputClass} />
            </div>
            <SecretInput label="Client Secret" placeholder="Votre Client Secret"
              value={spotifySecret} onChange={setSpotifySecret} isSet={config?.spotify_client_secret_set} />
          </div>
        )}

        {/* Credentials Discogs */}
        {currentServices.discogs && (
          <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-700">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Discogs API</p>
            <div className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
              Générez un token sur <span className="font-mono">discogs.com/settings/developers</span>
            </div>
            <SecretInput label="Token personnel" placeholder="Votre token Discogs"
              value={discogsToken} onChange={setDiscogsToken} isSet={config?.discogs_token_set} />
          </div>
        )}

        {/* Résultats test API */}
        {testResults && (
          <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-700">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Résultats du test</p>
            {Object.entries(testResults).map(([name, status]) => (
              <div key={name} className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-300 capitalize">{name}</span>
                {statusIcon(status)}
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* Notifications Email */}
      <CollapsibleSection
        title="Notifications Email"
        description="Email + CSV à la fin de chaque traitement"
        badge={smtpBadge}
        defaultOpen={true}
      >
        <div className="flex items-center justify-between -mt-1">
          <p className="text-sm text-gray-600 dark:text-gray-300">Activer les notifications</p>
          <button
            onClick={() => setSmtpEnabled(!isSmtpEnabled)}
            className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 focus:ring-amtu-500 ${isSmtpEnabled ? 'bg-amtu-500' : 'bg-gray-200 dark:bg-gray-600'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isSmtpEnabled ? 'translate-x-5' : ''}`} />
          </button>
        </div>

        {isSmtpEnabled && (
          <div className="space-y-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Serveur SMTP</label>
                <input value={smtpHost} onChange={e => setSmtpHost(e.target.value)}
                  placeholder={config?.smtp_host || 'smtp.gmail.com'} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Port</label>
                <input value={smtpPort} onChange={e => setSmtpPort(e.target.value)}
                  placeholder={String(config?.smtp_port || 587)} type="number" className={inputClass} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Utilisateur</label>
              <input value={smtpUser} onChange={e => setSmtpUser(e.target.value)}
                placeholder={config?.smtp_user || 'user@gmail.com'} className={inputClass} />
            </div>
            <SecretInput label="Mot de passe / App password" placeholder="Votre mot de passe SMTP"
              value={smtpPassword} onChange={setSmtpPassword} isSet={config?.smtp_password_set} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Nom de l'expéditeur</label>
                <input value={smtpFromName} onChange={e => setSmtpFromName(e.target.value)}
                  placeholder={config?.smtp_from_name || 'AMTU Notification'} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Adresse expéditeur</label>
                <input value={smtpFrom} onChange={e => setSmtpFrom(e.target.value)}
                  placeholder={config?.smtp_from || 'noreply@exemple.com'} className={inputClass} />
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
                <input type="checkbox" checked={isTls} onChange={e => setSmtpTls(e.target.checked)} className="rounded accent-amtu-500" />
                STARTTLS (port 587)
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
                <input type="checkbox" checked={isSsl} onChange={e => setSmtpSsl(e.target.checked)} className="rounded accent-amtu-500" />
                SSL direct (port 465)
              </label>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 flex items-start gap-2">
              <Mail className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              Les utilisateurs avec notifications activées reçoivent un email + CSV à la fin de chaque traitement.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => smtpTestMutation.mutate()}
                disabled={smtpTestMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {smtpTestMutation.isPending ? 'Envoi...' : 'Envoyer un email de test'}
              </button>
              {smtpTestResult && (
                <span className={`flex items-center gap-1.5 text-sm ${smtpTestResult.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {smtpTestResult.success ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  {smtpTestResult.message}
                </span>
              )}
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* Versioning genres */}
      <CollapsibleSection
        title="Versioning des genres"
        description="Snapshots avant chaque import ou rollback"
        defaultOpen={false}
      >
        <div className="flex items-center gap-3">
          <input
            type="number" min={3}
            value={maxSnapshots}
            onChange={e => setMaxSnapshots(e.target.value)}
            placeholder={String(config?.max_genre_snapshots ?? 3)}
            className="w-24 px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amtu-500"
          />
          <span className="text-sm text-gray-500 dark:text-gray-400">versions conservées (3 minimum)</span>
        </div>
      </CollapsibleSection>

      {/* Cache API */}
      <CacheSection
        retention={cacheRetention}
        onRetentionChange={setCacheRetention}
        currentRetention={config?.cache_retention_months ?? 6}
        purgeResult={purgeResult}
        onPurge={(expiredOnly) => {
          purgeCache(expiredOnly).then(r => {
            setPurgeResult(r)
            setTimeout(() => setPurgeResult(null), 5000)
          })
        }}
      />

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          onClick={() => testMutation.mutate()}
          disabled={testMutation.isPending}
          className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          <TestTube className="w-4 h-4" />
          {testMutation.isPending ? 'Test...' : 'Tester les APIs'}
        </button>
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="flex items-center gap-2 px-5 py-2.5 bg-amtu-500 hover:bg-amtu-600 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 shadow-sm"
        >
          {saved
            ? <><CheckCircle2 className="w-4 h-4" /> Sauvegardé</>
            : <><Save className="w-4 h-4" /> Sauvegarder</>
          }
        </button>
      </div>

      {/* Version */}
      <div className="text-center text-xs text-gray-400 dark:text-gray-600 pb-2">
        <span className="flex items-center justify-center gap-1.5">
          <Tag className="w-3 h-3" />
          AMTU Web {config?.version || '—'}
        </span>
      </div>
    </div>
  )
}

// ─── Section Cache (requête propre) ──────────────────────────────────────────

function CacheSection({ retention, onRetentionChange, currentRetention, purgeResult, onPurge }: {
  retention: string
  onRetentionChange: (v: string) => void
  currentRetention: number
  purgeResult: { deleted: number; scope: string } | null
  onPurge: (expiredOnly: boolean) => void
}) {
  const { data: stats, refetch } = useQuery({ queryKey: ['cache-stats'], queryFn: getCacheStats })

  const cacheBadge = stats
    ? <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">{stats.active} actifs</span>
    : null

  return (
    <CollapsibleSection
      title="Cache de traitement"
      description="Résultats API mis en cache pour accélérer le retraitement"
      badge={cacheBadge}
      defaultOpen={false}
    >
      <div className="flex items-center justify-between -mt-1">
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Les titres/artistes déjà interrogés sont réutilisés sans appel API
        </p>
        <button onClick={() => refetch()} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0 ml-2">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
            <div className="text-xl font-bold text-gray-800 dark:text-gray-100">{stats.active}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Actifs</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
            <div className="text-xl font-bold text-gray-800 dark:text-gray-100">{stats.expired}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Expirés</div>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 text-center">
            <div className="text-xl font-bold text-amber-700 dark:text-amber-400">{stats.total_hits}</div>
            <div className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">Hits total</div>
          </div>
        </div>
      )}

      <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200 shrink-0">Rétention</label>
          <select
            value={retention || String(currentRetention)}
            onChange={e => onRetentionChange(e.target.value)}
            className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amtu-500"
          >
            <option value="6">6 mois</option>
            <option value="12">12 mois</option>
            <option value="18">18 mois</option>
            <option value="24">24 mois</option>
          </select>
          <span className="text-xs text-gray-400 dark:text-gray-500">(sauvegardez pour appliquer)</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onPurge(true)}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Purger expirés
          </button>
          <button
            onClick={() => onPurge(false)}
            className="flex items-center gap-1.5 px-3 py-2 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Vider tout le cache
          </button>
          {purgeResult && (
            <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 className="w-4 h-4" />
              {purgeResult.deleted} entrée(s) supprimée(s) ({purgeResult.scope === 'expired' ? 'expirées' : 'tout le cache'})
            </span>
          )}
        </div>
      </div>
    </CollapsibleSection>
  )
}
