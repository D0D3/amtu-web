import { useState } from 'react'
import { Pencil, Trash2, Plus, Check, X, Search, Globe, User } from 'lucide-react'
import type { GenreMapping } from '../lib/types'

interface Props {
  mappings: GenreMapping[]
  onAdd: (source: string, target: string) => void
  onUpdate: (id: number, source: string, target: string) => void
  onDelete: (id: number) => void
  sourceLabel: string
  targetLabel: string
  isAdmin: boolean
}

export function GenreTable({ mappings, onAdd, onUpdate, onDelete, sourceLabel, targetLabel, isAdmin }: Props) {
  const [editId, setEditId] = useState<number | null>(null)
  const [editSource, setEditSource] = useState('')
  const [editTarget, setEditTarget] = useState('')
  const [newSource, setNewSource] = useState('')
  const [newTarget, setNewTarget] = useState('')
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')

  const startEdit = (m: GenreMapping) => {
    setEditId(m.id)
    setEditSource(m.source)
    setEditTarget(m.target)
  }

  const confirmEdit = () => {
    if (editId && editSource && editTarget) {
      onUpdate(editId, editSource, editTarget)
      setEditId(null)
    }
  }

  const confirmAdd = () => {
    if (newSource && newTarget) {
      onAdd(newSource, newTarget)
      setNewSource('')
      setNewTarget('')
      setAdding(false)
    }
  }

  const filtered = search.trim()
    ? mappings.filter(m =>
        m.source.toLowerCase().includes(search.toLowerCase()) ||
        m.target.toLowerCase().includes(search.toLowerCase())
      )
    : mappings

  const editInputClass = 'border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-sm w-full bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-amtu-500'

  return (
    <div className="space-y-3">
      {/* Barre de recherche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-500 pointer-events-none" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={`Rechercher dans ${sourceLabel.toLowerCase()}s / genres...`}
          className="w-full pl-8 pr-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amtu-500"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{sourceLabel}</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{targetLabel}</th>
              <th className="w-24 px-3 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 text-right">
                {filtered.length !== mappings.length && (
                  <span className="text-amtu-500">{filtered.length}/{mappings.length}</span>
                )}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">
                  {search ? 'Aucun résultat pour cette recherche' : 'Aucune règle'}
                </td>
              </tr>
            )}
            {filtered.map(m => {
              const canEdit = m.is_mine
              const isGlobal = m.is_global && !isAdmin  // badge shown to non-admins

              return (
                <tr key={m.id} className={`group ${canEdit ? 'hover:bg-gray-50 dark:hover:bg-gray-700/40' : 'opacity-70'}`}>
                  <td className="px-4 py-2.5">
                    {editId === m.id
                      ? <input value={editSource} onChange={e => setEditSource(e.target.value)} className={editInputClass} />
                      : <span className="text-gray-700 dark:text-gray-200">{m.source}</span>
                    }
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {editId === m.id
                        ? <input value={editTarget} onChange={e => setEditTarget(e.target.value)} className={editInputClass} />
                        : <span className="font-medium text-amtu-600 dark:text-amtu-400">{m.target}</span>
                      }
                      {isGlobal && editId !== m.id && (
                        <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 shrink-0">
                          <Globe className="w-3 h-3" /> Global
                        </span>
                      )}
                      {!isGlobal && !isAdmin && editId !== m.id && (
                        <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-amtu-50 dark:bg-amtu-900/20 text-amtu-600 dark:text-amtu-400 shrink-0">
                          <User className="w-3 h-3" /> Perso
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {canEdit && (
                        editId === m.id ? (
                          <>
                            <button onClick={confirmEdit} className="p-1 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"><Check className="w-4 h-4" /></button>
                            <button onClick={() => setEditId(null)} className="p-1 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><X className="w-4 h-4" /></button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(m)} className="p-1 text-gray-400 dark:text-gray-500 hover:text-amtu-500 hover:bg-amtu-50 dark:hover:bg-amtu-900/20 rounded"><Pencil className="w-4 h-4" /></button>
                            <button onClick={() => onDelete(m.id)} className="p-1 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"><Trash2 className="w-4 h-4" /></button>
                          </>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {adding && (
              <tr className="bg-amtu-50 dark:bg-amtu-900/20">
                <td className="px-4 py-2.5">
                  <input value={newSource} onChange={e => setNewSource(e.target.value)} placeholder={sourceLabel} className={editInputClass} autoFocus />
                </td>
                <td className="px-4 py-2.5">
                  <input value={newTarget} onChange={e => setNewTarget(e.target.value)} placeholder={targetLabel} onKeyDown={e => e.key === 'Enter' && confirmAdd()} className={editInputClass} />
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1">
                    <button onClick={confirmAdd} className="p-1 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"><Check className="w-4 h-4" /></button>
                    <button onClick={() => setAdding(false)} className="p-1 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><X className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        {!adding && (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 text-sm text-amtu-600 dark:text-amtu-400 hover:text-amtu-700 dark:hover:text-amtu-300 font-medium">
            <Plus className="w-4 h-4" />
            {isAdmin ? 'Ajouter une règle globale' : 'Ajouter ma règle'}
          </button>
        )}
        {!isAdmin && (
          <p className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
            Vos règles <span className="text-amtu-500">Perso</span> sont prioritaires sur les règles <span className="text-gray-400">Global</span>
          </p>
        )}
      </div>
    </div>
  )
}
