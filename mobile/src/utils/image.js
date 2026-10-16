// Photos hosted on Cloudinary are served resized and in the best format for the
// phone. Only plain upload addresses (a version segment right after /upload/) are
// rewritten; any other address is used exactly as given. (Same rule as the web app.)
const CLOUDINARY_PLAIN = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(v\d+\/.+)$/

export function optimizedUrl(src, width) {
  const match = typeof src === 'string' ? CLOUDINARY_PLAIN.exec(src) : null
  return match ? `${match[1]}c_limit,w_${Math.max(1, Math.round(width))},f_auto,q_auto/${match[2]}` : src
}
