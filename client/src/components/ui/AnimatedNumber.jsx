import { useEffect, useRef } from 'react'
import { animate, useInView, useReducedMotion } from 'framer-motion'

const plainNumber = (value) => Math.round(value).toLocaleString()

/**
 * Counts up from zero the first time it scrolls into view. With reduced
 * motion it simply shows the final figure.
 */
export default function AnimatedNumber({ value = 0, duration = 1.6, className = '', format = plainNumber }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '0px 0px -40px 0px' })
  const reduced = useReducedMotion()
  const number = useRef(null)
  // Inline formatters are common at call sites; keep the latest one in a ref so
  // a parent re-render never restarts a count that is already running.
  const formatRef = useRef(format)
  useEffect(() => {
    formatRef.current = format
  }, [format])

  useEffect(() => {
    const node = number.current
    if (!node || !inView) return undefined
    if (reduced) {
      node.textContent = formatRef.current(value)
      return undefined
    }
    const controls = animate(0, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        node.textContent = formatRef.current(latest)
      },
    })
    return () => controls.stop()
  }, [inView, value, duration, reduced])

  return (
    <span ref={ref} className={className}>
      {/* The final figure is in the DOM from the first paint, so the value is
          never empty for a screen reader or a crawler. */}
      <span ref={number} aria-hidden="true">
        {format(reduced ? value : 0)}
      </span>
      <span className="sr-only">{format(value)}</span>
    </span>
  )
}
