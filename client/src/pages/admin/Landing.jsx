import { Navigate } from 'react-router-dom'
import { ShieldOff } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { adminNavFor } from '../../utils/adminPermissions'
import { EmptyState } from '../../components/ui'
import Overview from './Overview'

/**
 * /admin — the super admin lands on the overview. A partner lands on the
 * first area they hold, because their menu may not include the overview
 * (it needs both the Brands and Orders areas).
 */
export default function AdminLanding() {
  const { user } = useAuth()
  const [first] = adminNavFor(user)

  if (!first) {
    return (
      <EmptyState
        icon={ShieldOff}
        title="No admin areas assigned yet."
        message="Ask the super admin to give your account access to at least one area."
        className="rounded-lg border border-dashed border-line bg-white"
      />
    )
  }
  if (first[0] === '/admin') return <Overview />
  return <Navigate to={first[0]} replace />
}
