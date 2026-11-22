import { useCallback, useRef } from 'react'

/**
 * Writes the pointer position into --mx/--my so the .spotlight wash follows
 * the cursor. Renders one plain element: no motion values, no re-renders.
 */
export default function Spotlight({ as: Tag = 'div', dark = false, className = '', children, ...props }) {
  const ref = useRef(null)

  const track = useCallback((event) => {
    const node = ref.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    node.style.setProperty('--mx', `${event.clientX - rect.left}px`)
    node.style.setProperty('--my', `${event.clientY - rect.top}px`)
  }, [])

  return (
    <Tag
      ref={ref}
      onPointerMove={track}
      className={`spotlight ${dark ? 'spotlight-dark' : ''} ${className}`.trim()}
      {...props}
    >
      {children}
    </Tag>
  )
}
