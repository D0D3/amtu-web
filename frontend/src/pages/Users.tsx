import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UserPlus, Pencil, Trash2, X, Check, ShieldCheck, Mail, LogOut, MessageSquare, Megaphone } from 'lucide-react'
import { getUsers, createUser, updateUser, deleteUser, forceLogout, createAnnouncement } from '../lib/api'
import type { User } from '../lib/types'
import { useAuth } from '../contexts/AuthContext'

const emptyForm = {
  username: '', first_name: '', last_name: '', email: '',
  password: '', is_admin: false, email_notifications: true,
}

function UserModal({ user, onClose, onSave }: { user?: User | null; onClose: () => void; onSave: (data: any) => void }) {
  const isEdit = !!user
  const [form, setForm] = useState(isEdit ? { ...user, password: '', email_notifications: user.email_notifications } : { ...emptyForm })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const payload: any = { first_name: form.first_name, last_name: form.last_name, email: form.email, is_admin: form.is_admin, email_notifications: form.email_notifications }
      if (!isEdit) { payload.username = form.username; payload.password = form.password }
      else if (form.password) { payload.password = form.password }
      onSave(payload)
    } catch (err: any) {
      setError(err.message || 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  const inputClass = 'w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amtu-500'
  const field = (label: string, key: string, type = 'text', placeholder = '') => (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">{label}</label>
      <input type={type} value={(form as any)[key] || ''} onChange={e => set(key, e.target.value)} placeholder={placeholder} required={key !== 'password' || !isEdit} className={inputClass} />
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">{isEdit ? `Modifier ${user?.username}` : 'Nouvel utilisateur'}</h3>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-3">
          {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            {field('Prénom', 'first_name', 'text', 'Jean')}
            {field('Nom', 'last_name', 'text', 'Dupont')}
          </div>
          {!isEdit && field('Identifiant', 'username', 'text', 'jdupont')}
          {field('Email', 'email', 'email', 'jean@exemple.com')}
          {field(isEdit ? 'Nouveau mot de passe (laisser vide)' : 'Mot de passe', 'password', 'password', '••••••••')}
          <div className="flex gap-4 pt-1">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
              <input type="checkbox" checked={!!form.is_admin} onChange={e => set('is_admin', e.target.checked)} className="rounded accent-amtu-500" /> Administrateur
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
              <input type="checkbox" checked={!!form.email_notifications} onChange={e => set('email_notifications', e.target.checked)} className="rounded accent-amtu-500" /> Notifications email
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">Annuler</button>
            <button type="submit" disabled={loading} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-amtu-500 text-white rounded-lg hover:bg-amtu-600 disabled:opacity-50">
              <Check className="w-4 h-4" />{loading ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AnnouncementModal({ targetUser, onClose, onSent }: {
  targetUser: User | null  // null = global
  onClose: () => void
  onSent: () => void
}) {
  const [message, setMessage] = useState('')
  const [type, setType] = useState<'info' | 'warning' | 'error'>('info')
  const [expiresIn, setExpiresIn] = useState<string>('24')
  const [loading, setLoading] = useState(false)

  const handleSend = async () => {
    if (!message.trim()) return
    setLoading(true)
    try {
      await createAnnouncement({
        message: message.trim(),
        type,
        target_user_id: targetUser?.id ?? null,
        expires_in_hours: expiresIn ? Number(expiresIn) : null,
      })
      onSent()
      onClose()
    } finally {
      setLoading(false)
    }
  }

  const typeColors = {
    info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200',
    warning: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200',
    error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200',
  }

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-amtu-500" />
            {targetUser ? `Message à ${targetUser.username}` : 'Annonce globale'}
          </h3>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Message</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={3}
              placeholder="Entrez votre message..."
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amtu-500 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Type</label>
              <select value={type} onChange={e => setType(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amtu-500">
                <option value="info">ℹ️ Information</option>
                <option value="warning">⚠️ Avertissement</option>
                <option value="error">🔴 Erreur / Urgence</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Expiration</label>
              <select value={expiresIn} onChange={e => setExpiresIn(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amtu-500">
                <option value="1">1 heure</option>
                <option value="24">24 heures</option>
                <option value="168">7 jours</option>
                <option value="">Permanent</option>
              </select>
            </div>
          </div>
          {message && (
            <div className={`text-sm px-4 py-3 rounded-xl border ${typeColors[type]}`}>
              {message}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">Annuler</button>
            <button onClick={handleSend} disabled={loading || !message.trim()}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-amtu-500 text-white rounded-lg hover:bg-amtu-600 disabled:opacity-50">
              <Megaphone className="w-4 h-4" />{loading ? 'Envoi...' : 'Envoyer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function Users() {
  const { user: me } = useAuth()
  const qc = useQueryClient()
  const { data: users = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: getUsers, refetchInterval: 30000 })
  const [modal, setModal] = useState<'create' | User | null>(null)
  const [announcementTarget, setAnnouncementTarget] = useState<User | null | 'global' | false>(false)

  const refresh = () => qc.invalidateQueries({ queryKey: ['users'] })

  const createMutation = useMutation({ mutationFn: (d: any) => createUser(d), onSuccess: () => { refresh(); setModal(null) } })
  const updateMutation = useMutation({ mutationFn: ({ id, data }: { id: number; data: any }) => updateUser(id, data), onSuccess: () => { refresh(); setModal(null) } })
  const deleteMutation = useMutation({ mutationFn: deleteUser, onSuccess: refresh })
  const forceLogoutMutation = useMutation({ mutationFn: forceLogout, onSuccess: refresh })

  const handleSave = (data: any) => {
    if (modal === 'create') createMutation.mutate(data)
    else if (modal && typeof modal === 'object') updateMutation.mutate({ id: modal.id, data })
  }

  const handleDelete = (u: User) => {
    if (confirm(`Supprimer l'utilisateur "${u.username}" ?`)) deleteMutation.mutate(u.id)
  }

  const handleForceLogout = (u: User) => {
    if (confirm(`Déconnecter "${u.username}" de toutes ses sessions ?`)) forceLogoutMutation.mutate(u.id)
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Utilisateurs</h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">{users.length} compte{users.length > 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAnnouncementTarget('global')}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <Megaphone className="w-4 h-4" />
            Annonce globale
          </button>
          <button
            onClick={() => setModal('create')}
            className="flex items-center gap-2 px-4 py-2 bg-amtu-500 text-white text-sm font-semibold rounded-lg hover:bg-amtu-600 shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            Ajouter
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-400 dark:text-gray-500">Chargement...</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400 dark:text-gray-500">Aucun utilisateur</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Nom</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Identifiant</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">Email</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Rôle</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Notifs</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Statut</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-gray-50 dark:border-gray-700 last:border-0 hover:bg-gray-50/50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${u.is_online ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} title={u.is_online ? 'En ligne' : 'Hors ligne'} />
                      <span className="font-medium text-gray-800 dark:text-gray-100">{u.first_name} {u.last_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 font-mono text-xs">{u.username}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden md:table-cell">{u.email}</td>
                  <td className="px-4 py-3 text-center">
                    {u.is_admin
                      ? <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-2 py-0.5 rounded-full"><ShieldCheck className="w-3 h-3" /> Admin</span>
                      : <span className="text-xs text-gray-400 dark:text-gray-500">Utilisateur</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {u.email_notifications
                      ? <Mail className="w-4 h-4 text-amtu-500 mx-auto" />
                      : <Mail className="w-4 h-4 text-gray-200 dark:text-gray-600 mx-auto" />}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${u.is_active !== false ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'}`}>
                      {u.is_active !== false ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setAnnouncementTarget(u)} title="Envoyer un message"
                        className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-amtu-600 dark:hover:text-amtu-400 hover:bg-amtu-50 dark:hover:bg-amtu-900/20 rounded-lg transition-colors">
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>
                      {u.id !== me?.id && u.is_online && (
                        <button onClick={() => handleForceLogout(u)} title="Déconnecter"
                          className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors">
                          <LogOut className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button onClick={() => setModal(u)}
                        className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(u)}
                        className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <UserModal user={modal === 'create' ? null : modal} onClose={() => setModal(null)} onSave={handleSave} />
      )}
      {announcementTarget !== false && (
        <AnnouncementModal
          targetUser={announcementTarget === 'global' ? null : announcementTarget}
          onClose={() => setAnnouncementTarget(false)}
          onSent={() => {}}
        />
      )}
    </div>
  )
}
