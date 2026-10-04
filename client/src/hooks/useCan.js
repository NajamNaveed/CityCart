import { useCallback } from 'react'
import { useAuth } from './useAuth'
import { can } from '../utils/permissions'

// const can = useCan();  can('orders.manage')
export function useCan() {
  const { user } = useAuth()
  return useCallback((permission) => can(user, permission), [user])
}