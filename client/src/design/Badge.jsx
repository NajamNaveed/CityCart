import { badge } from './tokens'

export default function Badge({ tone = 'soft', className = '', children }) {
  return <span className={`${badge(tone)} ${className}`.trim()}>{children}</span>
}
