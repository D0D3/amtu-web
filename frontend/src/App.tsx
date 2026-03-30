import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery, useMutation } from '@tanstack/react-query'
import { getAnnouncements, deleteAnnouncement } from './lib/api'
import type { Announcement } from './lib/types'
import { LayoutDashboard, History, Settings, Tag, Users, LogOut, UserCircle, Sun, Moon, X } from 'lucide-react'
import { Dashboard } from './pages/Dashboard'
import { History as HistoryPage } from './pages/History'
import { Settings as SettingsPage } from './pages/Settings'
import { Genres } from './pages/Genres'
import { Login } from './pages/Login'
import { Users as UsersPage } from './pages/Users'
import { Profile } from './pages/Profile'
import { APIStatus } from './components/APIStatus'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ThemeProvider, useTheme } from './contexts/ThemeContext'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30000 } }
})

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return null
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return null
  if (!user) return <Navigate to="/login" replace />
  if (!user.is_admin) return <Navigate to="/" replace />
  return <>{children}</>
}

function AnnouncementBanner() {
  const { user } = useAuth()
  const { data: announcements = [] } = useQuery({
    queryKey: ['announcements'],
    queryFn: getAnnouncements,
    enabled: !!user,
    refetchInterval: 60000,
  })
  const deleteMutation = useMutation({ mutationFn: deleteAnnouncement })

  const dismissed = JSON.parse(localStorage.getItem('amtu_dismissed_ann') || '[]') as number[]

  const visible = announcements.filter(a => !dismissed.includes(a.id))
  if (!visible.length) return null

  const dismiss = (id: number) => {
    const next = [...dismissed, id]
    localStorage.setItem('amtu_dismissed_ann', JSON.stringify(next))
    // force re-render
    window.dispatchEvent(new Event('storage'))
  }

  const typeStyles: Record<string, string> = {
    info: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-800 dark:text-blue-200',
    warning: 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-200',
    error: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700 text-red-800 dark:text-red-200',
  }
  const typeIcons: Record<string, string> = { info: 'ℹ️', warning: '⚠️', error: '🔴' }

  return (
    <div className="space-y-1">
      {visible.map(ann => (
        <div key={ann.id} className={`flex items-start justify-between gap-3 px-4 sm:px-6 py-2.5 border-b text-sm ${typeStyles[ann.type] || typeStyles.info}`}>
          <span className="flex items-center gap-2">
            <span>{typeIcons[ann.type] || 'ℹ️'}</span>
            <span>{ann.message}</span>
          </span>
          <button onClick={() => dismiss(ann.id)} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()

  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/history', label: 'Historique', icon: History, end: false },
    { to: '/genres', label: 'Genres', icon: Tag, end: false },
    ...(user?.is_admin ? [
      { to: '/settings', label: 'Réglages', icon: Settings, end: false },
      { to: '/users', label: 'Utilisateurs', icon: Users, end: false },
    ] : []),
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <img src="/AMTU_K7.png" alt="AMTU" className="h-8 w-auto" />
            <span className="text-xs text-gray-400 dark:text-gray-500 hidden lg:block whitespace-nowrap">Apple Music Tag Updater</span>
          </div>

          <nav className="flex items-center gap-1">
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-amtu-50 dark:bg-amtu-900/30 text-amtu-600 dark:text-amtu-400'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:block">{label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-1">
            <APIStatus />

            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
              className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <div className="border-l border-gray-100 dark:border-gray-700 pl-1 flex items-center gap-1">
              <NavLink
                to="/profile"
                title="Mon profil"
                className={({ isActive }) =>
                  `hidden sm:flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-amtu-50 dark:bg-amtu-900/30 text-amtu-600 dark:text-amtu-400'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`
                }
              >
                <UserCircle className="w-4 h-4" />
                <span>{user?.first_name} {user?.last_name}</span>
              </NavLink>
              <button
                onClick={logout}
                title="Se déconnecter"
                className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <AnnouncementBanner />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>
    </div>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/*" element={
        <ProtectedRoute>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/genres" element={<Genres />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />
              <Route path="/users" element={<AdminRoute><UsersPage /></AdminRoute>} />
            </Routes>
          </Layout>
        </ProtectedRoute>
      } />
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
