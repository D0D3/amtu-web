import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { UserCircle, Save, KeyRound, CheckCircle2, Mail } from 'lucide-react'
import { updateMe } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

export function Profile() {
  const { user, updateUser } = useAuth()

  const [username, setUsername] = useState(user?.username || '')
  const [firstName, setFirstName] = useState(user?.first_name || '')
  const [lastName, setLastName] = useState(user?.last_name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [emailNotif, setEmailNotif] = useState(user?.email_notifications ?? false)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => updateMe({
      username: username || undefined,
      first_name: firstName || undefined,
      last_name: lastName || undefined,
      email: email || undefined,
      email_notifications: emailNotif,
      password: newPassword || undefined,
    }),
    onSuccess: (data) => {
      updateUser(data)
      setSaved(true)
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setSaved(false), 3000)
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || err.message || 'Erreur lors de la sauvegarde')
      setTimeout(() => setError(''), 4000)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword && newPassword !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas')
      return
    }
    setError('')
    mutation.mutate()
  }

  const inputClass = 'w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amtu-500 focus:border-transparent'

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Mon profil</h1>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">Modifiez vos informations personnelles</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Informations */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <UserCircle className="w-4 h-4" /> Informations
          </h2>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm px-4 py-3 rounded-lg border border-red-100 dark:border-red-800">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Prénom</label>
              <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} required className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Nom</label>
              <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} required className={inputClass} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Identifiant</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} required className={inputClass} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Adresse email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2.5">
              <Mail className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Notifications email</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">Recevoir un rapport à la fin de chaque traitement</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setEmailNotif(!emailNotif)}
              className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 focus:ring-amtu-500 ${emailNotif ? 'bg-amtu-500' : 'bg-gray-200 dark:bg-gray-600'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${emailNotif ? 'translate-x-5' : ''}`} />
            </button>
          </div>
        </div>

        {/* Mot de passe */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <KeyRound className="w-4 h-4" /> Changer le mot de passe
          </h2>
          <p className="text-xs text-gray-400 dark:text-gray-500">Laisser vide pour conserver le mot de passe actuel</p>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Nouveau mot de passe</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="••••••••" className={inputClass} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Confirmer</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••" className={inputClass} />
          </div>
        </div>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="flex items-center gap-2 px-5 py-2.5 bg-amtu-500 hover:bg-amtu-600 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 shadow-sm"
        >
          {saved
            ? <><CheckCircle2 className="w-4 h-4" /> Sauvegardé</>
            : <><Save className="w-4 h-4" /> {mutation.isPending ? 'Enregistrement...' : 'Enregistrer'}</>
          }
        </button>
      </form>
    </div>
  )
}
