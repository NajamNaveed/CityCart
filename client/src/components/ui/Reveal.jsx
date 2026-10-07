import { motion, useReducedMotion } from 'framer-motion'

/**
 * Fades and lifts its children into view the first time they scroll in.
 * `delay` staggers siblings (e.g. grid cards: delay={i * 0.06}).
 * Honours prefers-reduced-motion by rendering immediately.
 */
export default function Reveal({ children, delay = 0, y = 18, once = true, className = '', as = 'div' }) {
  const reduced = useReducedMotion()
  const MotionTag = motion[as] || motion.div
  return (
    <MotionTag
      className={className}
      initial={reduced ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: '0px 0px -60px 0px' }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </MotionTag>
  )
}
