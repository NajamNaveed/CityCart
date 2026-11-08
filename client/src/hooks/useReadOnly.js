import { useAuth } from './useAuth'
import { isReadOnlyAdmin } from '../utils/adminPermissions'

/** True when the signed-in admin partner may view but not change admin data. */
export default function useReadOnly() {
  const { user } = useAuth()
  return isReadOnlyAdmin(user)
}
