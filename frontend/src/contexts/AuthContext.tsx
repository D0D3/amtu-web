import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import type { User } from '../lib/types'

interface AuthContextType {
  user: User | null
  token: string | null
  setAuth: (token: string, user: User) => void
  updateUser: (user: User) => void
  logout: () => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null, token: null,
  setAuth: () => {}, updateUser: () => {}, logout: () => {},
  isLoading: true,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const storedToken = localStorage.getItem('amtu_token')
    const storedUser = localStorage.getItem('amtu_user')
    if (storedToken && storedUser) {
      try {
        setToken(storedToken)
        setUser(JSON.parse(storedUser))
      } catch {
        localStorage.removeItem('amtu_token')
        localStorage.removeItem('amtu_user')
      }
    }
    setIsLoading(false)
  }, [])

  const setAuth = (newToken: string, newUser: User) => {
    localStorage.setItem('amtu_token', newToken)
    localStorage.setItem('amtu_user', JSON.stringify(newUser))
    setToken(newToken)
    setUser(newUser)
  }

  const updateUser = (updatedUser: User) => {
    localStorage.setItem('amtu_user', JSON.stringify(updatedUser))
    setUser(updatedUser)
  }

  const logout = () => {
    localStorage.removeItem('amtu_token')
    localStorage.removeItem('amtu_user')
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, setAuth, updateUser, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
