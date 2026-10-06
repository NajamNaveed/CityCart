import { useContext } from 'react'
import { NotificationContext } from '../context/contexts'

export default function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider')
  }
  return context
}
