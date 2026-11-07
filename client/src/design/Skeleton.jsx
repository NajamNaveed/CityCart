import { skeleton } from './tokens'

export default function Skeleton({ className = '' }) {
  return <div aria-hidden="true" className={`${skeleton} ${className}`.trim()} />
}
