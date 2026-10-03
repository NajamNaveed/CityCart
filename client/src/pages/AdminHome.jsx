import { useAuth } from '../hooks/useAuth'

// Placeholder until the admin console is built; it proves the admin login and role guard work.
export default function AdminHome() {
  const { user, logout } = useAuth()
  return (
    <div className="mx-auto max-w-2xl px-5 py-24">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">citycart. administration</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Signed in as {user.name}.</h1>
      <p className="mt-4 text-[15px] leading-relaxed text-muted">The admin console has not been built yet.</p>
      <button type="button" onClick={logout} className="mt-8 text-sm font-medium underline underline-offset-4 hover:text-clay">
        Sign out
      </button>
    </div>
  )
}