import { motion, useScroll, useSpring } from 'framer-motion'

// A hairline of clay-to-gold across the top of the shop. It is purely a sense
// of place — the browser's own scroll position stays authoritative.
export default function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 26, restDelta: 0.001 })

  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX }}
      className="pointer-events-none fixed inset-x-0 top-0 z-[55] h-[2px] origin-left bg-gradient-to-r from-clay via-gold to-clay"
    />
  )
}
