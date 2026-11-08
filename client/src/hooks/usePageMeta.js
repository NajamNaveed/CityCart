import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { DEFAULT_DESCRIPTION, DEFAULT_IMAGE, DEFAULT_TITLE, SITE_NAME, absoluteUrl } from '../utils/seo'

function setMeta(attribute, key, content) {
  const selector = `meta[${attribute}="${key}"]`
  const existing = document.head.querySelector(selector)
  if (!content) {
    existing?.remove()
    return
  }
  const tag = existing || document.createElement('meta')
  if (!existing) {
    tag.setAttribute(attribute, key)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

function setCanonical(href) {
  const existing = document.head.querySelector('link[rel="canonical"]')
  if (!href) {
    existing?.remove()
    return
  }
  const link = existing || document.createElement('link')
  if (!existing) {
    link.setAttribute('rel', 'canonical')
    document.head.appendChild(link)
  }
  link.setAttribute('href', href)
}

function writeJsonLd(items) {
  document.head.querySelectorAll('script[data-citycart-jsonld]').forEach((node) => node.remove())
  for (const item of items) {
    if (!item) continue
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.dataset.citycartJsonld = 'true'
    // Product and profile text comes from the database; escaping '<' keeps a
    // closing </script> inside a name from breaking out of the tag.
    script.textContent = JSON.stringify(item).replace(/</g, '\\u003c')
    document.head.appendChild(script)
  }
}

// The SPA has one index.html, so each route writes its own title, description,
// canonical and structured data as it renders. Pass `noindex` for private,
// guest-only and not-found screens.
export function usePageMeta({
  title,
  description = DEFAULT_DESCRIPTION,
  image = DEFAULT_IMAGE,
  type = 'website',
  noindex = false,
  jsonLd = null,
} = {}) {
  const { pathname } = useLocation()
  const fullTitle = title ? `${title} — ${SITE_NAME}` : DEFAULT_TITLE
  const canonical = noindex ? '' : absoluteUrl(pathname === '/' ? '/' : pathname.replace(/\/+$/, '') || '/')
  const imageUrl = absoluteUrl(image)
  const jsonLdList = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : []
  const jsonLdText = JSON.stringify(jsonLdList)

  useEffect(() => {
    document.title = fullTitle
    setMeta('name', 'description', description)
    setMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow')
    setMeta('property', 'og:title', fullTitle)
    setMeta('property', 'og:description', description)
    setMeta('property', 'og:type', type)
    setMeta('property', 'og:site_name', SITE_NAME)
    setMeta('property', 'og:url', canonical)
    setMeta('property', 'og:image', imageUrl)
    setMeta('name', 'twitter:card', imageUrl ? 'summary_large_image' : 'summary')
    setMeta('name', 'twitter:title', fullTitle)
    setMeta('name', 'twitter:description', description)
    setMeta('name', 'twitter:image', imageUrl)
    setCanonical(canonical)
    writeJsonLd(JSON.parse(jsonLdText))
  }, [fullTitle, description, canonical, imageUrl, type, noindex, jsonLdText])
}

export function NoIndexMeta() {
  usePageMeta({ noindex: true })
  return null
}
