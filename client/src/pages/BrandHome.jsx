import { useAuth } from '../hooks/useAuth'
import { sectionLabel, wrap } from '../ui'

// Placeholder until the brand dashboard is built; it proves the brand login and role guard work.
export default function BrandHome() {
  const { user } = useAuth()
  return (
    <div className={`${wrap} py-16`}>
      <p className={sectionLabel}>{user.role === 'BRAND_ADMIN' ? 'Brand owner' : 'Brand team'}</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Welcome, {user.name}.</h1>
      <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
        You are signed in to your brand account. Your dashboard for products, stock and orders is the next thing to
        be built, and it will appear here.
      </p>
    </div>
  )
}