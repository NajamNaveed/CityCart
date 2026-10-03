import { Link } from 'react-router-dom'

export default function SectionHeader({ title, to, linkLabel }) {
  return (
    <div className="mb-6 flex items-end justify-between border-b border-line pb-3">
      <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
      {to && (
        <Link to={to} className="text-[13px] font-medium text-clay underline-offset-4 hover:underline">
          {linkLabel}
        </Link>
      )}
    </div>
  )
}