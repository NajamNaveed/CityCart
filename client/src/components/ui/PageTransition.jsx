import { useLocation } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'

/**
 * Wraps a route's content so each page eases in on navigation.
 * Keying on the pathname remounts the wrapper per page — exactly what a
 * transition needs. Place around <Outlet /> inside a layout.
 */
export default function PageTransition({ children }) {
  const location = useLocation()
  const reduced = useReducedMotion()
  return (
    <motion.div
      key={location.pathname}
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}
