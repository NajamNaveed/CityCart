import { useLocation } from 'react-router-dom'

/**
 * Wraps a route's content so each page eases in on navigation.
 * Keying on the pathname remounts the wrapper per page — exactly what a
 * transition needs. Place around <Outlet /> inside a layout.
 *
 * The intro is a CSS animation (see `.page-enter` in index.css) rather than a
 * framer-motion target on purpose: once it finishes the filter computes back to
 * `none`. A filter left on this wrapper would make it the containing block for
 * position:fixed children, and the cart dock would scroll with the page.
 */
export default function PageTransition({ children }) {
  const location = useLocation()

  return (
    <div key={location.pathname} className="page-enter">
      {children}
    </div>
  )
}
