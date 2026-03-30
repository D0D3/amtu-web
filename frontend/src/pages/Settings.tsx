import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, TestTube, Eye, EyeOff, CheckCircle2, XCircle, Mail, Send } from 'lucide-react'
import { getConfig, saveConfig, testApis, testSmtp } from '../lib/api'
import type { Config, ApiStatus } from '../lib/types'

function ServiceRow({
  name, label, description, enabled, onToggle
}: { name: string; label: string; description: string; enabled: boolean; onToggle: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between py-4 border-b border-gray-100 dark:border-gray-700 last:border-0">
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
  const [smtpTls, setSmtpTls] = useState<boolean | null>(null)

  const isSmtpEnabled = smtpEnabled ?? config?.smtp_enabled ?? false
  const isTls = smtpTls ?? config?.smtp_tls ?? true

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
      smtp_tls: isTls,
      max_genre_snapshots: maxSnapshots ? Math.max(3, Number(maxSnapshots)) : config?.max_genre_snapshots ?? 3,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config'] })
      qc.invalidateQueries({ queryKey: ['api-status'] })
      setSaved(true)
      setSpotifyId(''); setSpotifySecret(''); setDiscogsToken('')
      setSmtpPassword(''); setMaxSnapshots('')
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
    setServices(prev => ({ ...currentServices, [name]: v }))
  }

  const inputClass = 'w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amtu-500'

  return (
    <div className="max-w-2xl space-y-6">
      {/* Services */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-4">Sources de métadonnées</h2>
        <ServiceRow
          name="musicbrainz"
          label="MusicBrainz"
          description="Base de données musicale open-source — gratuit, aucune clé requise"
          enabled={currentServices.musicbrainz}
          onToggle={v => toggleService('musicbrainz', v)}
        />
        <ServiceRow
          name="spotify"
          label="Spotify"
          description="Nécessite un compte développeur Spotify"
          enabled={currentServices.spotify}
          onToggle={v => toggleService('spotify', v)}
        />
        <ServiceRow
          name="discogs"
          label="Discogs"
          description="Base de données vinyle/musique — token personnel requis"
          enabled={currentServices.discogs}
          onToggle={v => toggleService('discogs', v)}
        />
      </div>

      {/* Spotify credentials */}
      {currentServices.spotify && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Spotify API</h2>
          <div className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
            Créez une app sur <span className="font-mono">developer.spotify.com/dashboard</span> pour obtenir vos credentials.
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Client ID</label>
              <input
                value={spotifyId}
                onChange={e => setSpotifyId(e.target.value)}
                placeholder={config?.spotify_client_id || 'Votre Client ID Spotify'}
                className={inputClass}
              />
            </div>
            <SecretInput
              label="Client Secret"
              placeholder="Votre Client Secret"
              value={spotifySecret}
              onChange={setSpotifySecret}
              isSet={config?.spotify_client_secret_set}
            />
          </div>
        </div>
      )}

      {/* Discogs credentials */}
      {currentServices.discogs && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Discogs API</h2>
          <div className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
            Générez un token sur <span className="font-mono">discogs.com/settings/developers</span>
          </div>
          <SecretInput
            label="Token personnel"
            placeholder="Votre token Discogs"
            value={discogsToken}
            onChange={setDiscogsToken}
            isSet={config?.discogs_token_set}
          />
        </div>
      )}

      {/* Test results */}
      {testResults && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-3">
          <h3 className="font-medium text-gray-800 dark:text-gray-100 text-sm">Résultats du test</h3>
          {Object.entries(testResults).map(([name, status]) => (
            <div key={name} className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-300 capitalize">{name}</span>
              {statusIcon(status)}
            </div>
          ))}
        </div>
      )}

      {/* SMTP */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">Notifications Email</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Envoie un email + CSV à la fin de chaque traitement</p>
          </div>
          <button
            onClick={() => setSmtpEnabled(!isSmtpEnabled)}
            className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 focus:ring-amtu-500 ${isSmtpEnabled ? 'bg-amtu-500' : 'bg-gray-200 dark:bg-gray-600'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isSmtpEnabled ? 'translate-x-5' : ''}`} />
          </button>
        </div>

        {isSmtpEnabled && (
          <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-700">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Serveur SMTP</label>
                <input value={smtpHost} onChange={e => setSmtpHost(e.target.value)}
                  placeholder={config?.smtp_host || 'smtp.gmail.com'}
                  className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Port</label>
                <input value={smtpPort} onChange={e => setSmtpPort(e.target.value)}
                  placeholder={String(config?.smtp_port || 587)} type="number"
                  className={inputClass} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Utilisateur</label>
              <input value={smtpUser} onChange={e => setSmtpUser(e.target.value)}
                placeholder={config?.smtp_user || 'user@gmail.com'}
                className={inputClass} />
            </div>
            <SecretInput label="Mot de passe / App password" placeholder="Votre mot de passe SMTP"
              value={smtpPassword} onChange={setSmtpPassword} isSet={config?.smtp_password_set} />
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Expéditeur (From)</label>
              <input value={smtpFrom} onChange={e => setSmtpFrom(e.target.value)}
                placeholder={config?.smtp_from || 'AMTU <noreply@exemple.com>'}
                className={inputClass} />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
              <input type="checkbox" checked={isTls} onChange={e => setSmtpTls(e.target.checked)}
                className="rounded accent-amtu-500" />
              STARTTLS (recommandé pour le port 587)
            </label>
            <p className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 flex items-start gap-2">
              <Mail className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              Les utilisateurs dont les notifications sont activées (géré dans Utilisateurs) recevront un email à la fin de chaque traitement avec un CSV en pièce jointe.
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
                  {smtpTestResult.success
                    ? <CheckCircle2 className="w-4 h-4" />
                    : <XCircle className="w-4 h-4" />}
                  {smtpTestResult.message}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Snapshots genres */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-3">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Versioning des listes de genres</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Nombre de snapshots conservés avant chaque import ou rollback (minimum 3)</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={3}
            value={maxSnapshots}
            onChange={e => setMaxSnapshots(e.target.value)}
            placeholder={String(config?.max_genre_snapshots ?? 3)}
            className="w-24 px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amtu-500"
          />
          <span className="text-sm text-gray-500 dark:text-gray-400">versions (3 minimum)</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
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
    </div>
  )
}
