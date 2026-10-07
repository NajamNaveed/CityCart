// Photos hosted on Cloudinary are served resized and in the best format for
// the browser. Only plain upload addresses (version segment right after
// /upload/) are rewritten; any other address is used exactly as given.
const CLOUDINARY_PLAIN = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(v\d+\/.+)$/

export function optimizedUrl(src, width) {
  const match = CLOUDINARY_PLAIN.exec(src)
  return match ? `${match[1]}c_limit,w_${width},f_auto,q_auto/${match[2]}` : src
}
