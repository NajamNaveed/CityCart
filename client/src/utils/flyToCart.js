// The motion that makes a shelf feel like a shop: the photo detaches from its
// tile, lifts, falls into the tray and settles into the slot it owns. Removing
// the last unit plays the same path backwards, out of the tray and home.
//
// Position:fixed keeps the ghost out of the page flow, and the Web Animations
// API needs no library. Reduced-motion visitors get none of it.

// A 200px tile photo would feel heavy in flight; the token shrinks as it goes.
const GHOST_SIZE = 92

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

// The tray's own slot for this product, so the photo lands on the thumbnail it
// is about to become. Only a tray that never heard of the product falls back to
// its middle, which still reads as "into the bag". A page without a tray (the
// product page) lands on the navbar's bag instead.
function slotFor(productId) {
  const key = String(productId)
  const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(key) : key
  const line = document.querySelector(`[data-cart-line="${escaped}"]`)
  if (line) return line
  const dock = document.querySelector('[data-cart-dock]')
  if (dock) return dock
  return (
    [...document.querySelectorAll('[data-cart-target]')].find(
      (el) => el.getBoundingClientRect().width > 0,
    ) || null
  )
}

function canSettle(el) {
  return Boolean(el.hasAttribute?.('data-cart-line') || el.hasAttribute?.('data-cart-target'))
}

function center(box) {
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
}

function buildGhost(src, name, box) {
  const ghost = src ? document.createElement('img') : document.createElement('div')
  ghost.setAttribute('aria-hidden', 'true')
  ghost.style.cssText = [
    'position:fixed',
    'z-index:70',
    'pointer-events:none',
    `width:${box.width}px`,
    `height:${box.height || box.width}px`,
    `left:${box.left}px`,
    `top:${box.top}px`,
    'border-radius:10px',
    'object-fit:cover',
    'box-shadow:0 16px 34px rgba(21,20,15,0.3)',
  ].join(';')

  if (src) {
    ghost.src = src
    ghost.alt = ''
  } else {
    ghost.style.display = 'flex'
    ghost.style.alignItems = 'center'
    ghost.style.justifyContent = 'center'
    ghost.style.background = '#b6472a'
    ghost.style.color = '#fdf5ed'
    ghost.style.fontWeight = '600'
    ghost.style.fontSize = '20px'
    ghost.textContent = name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() || '')
      .join('')
  }
  return ghost
}

// The slot the ghost lands in is painted from the same cached photo, so the
// handover from ghost to thumbnail is invisible. A scale pop is what says
// "that one just arrived" without a second element doing the talking.
function settle(slotEl) {
  if (typeof slotEl.animate !== 'function') return
  slotEl.animate(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(1.16)' },
      { transform: 'scale(0.97)' },
      { transform: 'scale(1)' },
    ],
    { duration: 300, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)' },
  )
}

function fly(el, keyframes, duration) {
  return el.animate(keyframes, { duration })
}

/**
 * Shelf tile -> tray slot. `src` must be the URL the tile already painted, so
 * the ghost is drawn on its very first frame.
 */
export function flyToCart({ from, productId, src = '', name = '' }) {
  if (!from || !productId || prefersReducedMotion()) return

  // One frame later React has rendered the reserved slot, so the destination is
  // the real thumbnail box rather than a guess at where it will end up.
  requestAnimationFrame(() => {
    const source = from.getBoundingClientRect()
    const slot = slotFor(productId)
    if (!source.width || !slot) return
    const target = slot.getBoundingClientRect()
    if (!target.width) return

    const size = Math.min(GHOST_SIZE, source.width)
    const origin = {
      width: size,
      height: size,
      left: source.left + source.width / 2 - size / 2,
      top: source.top + source.height / 2 - size / 2,
    }
    const ghost = buildGhost(src, name, origin)
    document.body.appendChild(ghost)

    const start = center(origin)
    const end = center(target)
    const dx = end.x - start.x
    const dy = end.y - start.y
    const arrive = Math.max(0.25, target.width / size)

    const animation = fly(
      ghost,
      [
        // It hesitates on the shelf, then breaks away upward.
        { offset: 0, transform: 'translate3d(0, 0, 0) scale(1) rotate(0deg)', opacity: 1, easing: 'cubic-bezier(0.34, 0.02, 0.66, 0.4)' },
        {
          offset: 0.2,
          transform: `translate3d(${dx * 0.16}px, -52px, 0) scale(0.86) rotate(-8deg)`,
          opacity: 1,
          easing: 'cubic-bezier(0.48, 0, 0.74, 0.5)',
        },
        // Gravity does the rest: the drop covers most of the distance.
        {
          offset: 0.78,
          transform: `translate3d(${dx}px, ${dy}px, 0) scale(${arrive}) rotate(0deg)`,
          opacity: 1,
          easing: 'cubic-bezier(0.2, 0.75, 0.3, 1)',
        },
        // Overshoot into the slot, then straighten up.
        {
          offset: 0.88,
          transform: `translate3d(${dx}px, ${dy + 7}px, 0) scale(${arrive * 1.05})`,
          opacity: 1,
          easing: 'cubic-bezier(0.3, 0, 0.2, 1)',
        },
        { offset: 1, transform: `translate3d(${dx}px, ${dy}px, 0) scale(${arrive})`, opacity: 1 },
      ],
      680,
    )

    const landing = canSettle(slot) ? slot : null
    animation.onfinish = () => {
      ghost.remove()
      if (landing) settle(landing)
    }
    animation.oncancel = () => ghost.remove()
  })
}

/**
 * Tray slot -> shelf tile, for the unit that leaves the cart for good.
 */
export function flyFromCart({ to, productId, src = '', name = '' }) {
  if (!to || !productId || prefersReducedMotion()) return

  const slot = slotFor(productId)
  if (!slot) return
  const from = slot.getBoundingClientRect()
  if (!from.width) return

  const size = Math.min(GHOST_SIZE, from.width)
  const origin = {
    width: size,
    height: size,
    left: from.left + from.width / 2 - size / 2,
    top: from.top + from.height / 2 - size / 2,
  }
  const ghost = buildGhost(src, name, origin)
  document.body.appendChild(ghost)

  const destination = to.getBoundingClientRect()
  const start = center(origin)
  const end = center(destination)
  const dx = end.x - start.x
  const dy = end.y - start.y
  const grow = Math.max(1, destination.width / size)

  const animation = fly(
    ghost,
    [
      { offset: 0, transform: 'translate3d(0, 0, 0) scale(1) rotate(0deg)', opacity: 1, easing: 'cubic-bezier(0.3, 0, 0.5, 0.5)' },
      {
        offset: 0.24,
        transform: `translate3d(${dx * 0.2}px, ${Math.min(-30, dy * 0.2 - 34)}px, 0) scale(${grow * 0.66}) rotate(6deg)`,
        opacity: 1,
        easing: 'cubic-bezier(0.4, 0, 0.7, 0.45)',
      },
      {
        offset: 0.84,
        transform: `translate3d(${dx}px, ${dy}px, 0) scale(${grow}) rotate(0deg)`,
        opacity: 1,
        easing: 'cubic-bezier(0.2, 0.75, 0.3, 1)',
      },
      // It lands back on the shelf and dissolves into the real photo.
      { offset: 1, transform: `translate3d(${dx}px, ${dy}px, 0) scale(${grow})`, opacity: 0 },
    ],
    620,
  )

  animation.onfinish = () => ghost.remove()
  animation.oncancel = () => ghost.remove()
}
