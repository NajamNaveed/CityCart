import { Link } from 'react-router-dom'
import { btn } from './tokens'

// One button for every surface. Pass `to` for an in-app link, `href` for an
// external link, or nothing for a real <button>.
export default function Button({ to, href, tone = 'primary', size = 'md', className = '', children, type, ...props }) {
  const classes = `${btn(tone, size)} ${className}`.trim()

  if (to) {
    return (
      <Link to={to} className={classes} {...props}>
        {children}
      </Link>
    )
  }
  if (href) {
    return (
      <a href={href} className={classes} {...props}>
        {children}
      </a>
    )
  }
  return (
    <button type={type ?? 'button'} className={classes} {...props}>
      {children}
    </button>
  )
}
