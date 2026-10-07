import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { EmptyState } from '../components/ui'
import { btnDark } from '../ui'

export default function NotFound() {
  return (
    <EmptyState
      icon={Compass}
      title="That page doesn't exist."
      message="The link may be old, or the address was typed wrong. The shop is still right where you left it."
      className="py-28"
      action={
        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/" className={btnDark}>
            Back to home
          </Link>
          <Link
            to="/shop"
            className="inline-flex h-11 items-center justify-center rounded-md border border-line bg-white px-6 text-[13px] font-medium uppercase tracking-[0.08em] text-ink transition hover:border-ink"
          >
            Browse the shop
          </Link>
        </div>
      }
    />
  )
}
