import { card } from './tokens'

// Warm paper surface. `lift` adds the hover raise used by shopper cards.
export default function Card({ lift = false, as: Tag = 'div', padded = true, className = '', children, ...props }) {
  const classes = [card, padded ? 'p-5' : '', lift ? 'transition duration-300 hover:-translate-y-1 hover:shadow-[0_22px_45px_rgba(21,20,15,0.09)]' : '', className]
    .filter(Boolean)
    .join(' ')

  return (
    <Tag className={classes} {...props}>
      {children}
    </Tag>
  )
}
