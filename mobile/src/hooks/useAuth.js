import { useContext } from 'react'
import { AuthContext } from '../context/contexts'

// const { user, status, login, register, logout } = useAuth()
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
