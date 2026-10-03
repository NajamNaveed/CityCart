import { Link } from 'react-router-dom'
import { wrap } from '../ui'

export default function NotFound() {
  return (
    <div className={`${wrap} py-28 text-center`}>
      <p className="text-6xl font-light tracking-widest text-clay/50">404</p>
      <p className="mt-4 text-xl font-medium">That page doesn’t exist.</p>
      <Link to="/" className="mt-5 inline-block text-clay underline underline-offset-4">
        Back to home
      </Link>
    </div>
  )
}