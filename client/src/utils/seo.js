export const SITE_NAME = 'CityCart'
export const DEFAULT_TITLE = 'CityCart — Local brands, one cart'
export const DEFAULT_DESCRIPTION =
  'Shop local stores and book trusted pros in your block. One cart across several brands, cash at the door, and delivery within 1.5 km.'
export const DEFAULT_IMAGE = '/images/hero-block.jpg'

// Canonicals and share images must be absolute. The deployment host is read at
// runtime so the same build works on a preview URL and the live domain;
// VITE_SITE_URL pins it when a canonical host is required.
export function siteOrigin() {
  const configured = (import.meta.env.VITE_SITE_URL || '').trim().replace(/\/+$/, '')
  if (configured) return configured
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

export function absoluteUrl(value) {
  if (!value) return ''
  if (/^(https?:)?\/\//i.test(value) || value.startsWith('data:')) return value
  return `${siteOrigin()}${value.startsWith('/') ? value : `/${value}`}`
}

export function organizationLd() {
  const origin = siteOrigin()
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: `${origin}/`,
    logo: absoluteUrl('/favicon.svg'),
    description: DEFAULT_DESCRIPTION,
  }
}

export function websiteLd() {
  const origin = siteOrigin()
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: `${origin}/`,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${origin}/nearby?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  }
}

export function breadcrumbLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  }
}

// Product prices are stored in whole rupees (service starting prices are paisa).
export function productLd({ product, brand, path }) {
  const images = (product.images || []).map(absoluteUrl).filter(Boolean)
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description || undefined,
    image: images.length ? images : undefined,
    sku: product.sku || undefined,
    brand: brand?.name ? { '@type': 'Brand', name: brand.name } : undefined,
    offers: {
      '@type': 'Offer',
      price: Number(product.price || 0).toFixed(2),
      priceCurrency: 'PKR',
      availability:
        product.availability === 'OUT_OF_STOCK'
          ? 'https://schema.org/OutOfStock'
          : 'https://schema.org/InStock',
      url: absoluteUrl(path),
    },
  }
}

export function storeLd({ name, description, image, address, phone, email, path }) {
  const street = [address?.addressLine, address?.city, address?.state].filter(Boolean)
  return {
    '@context': 'https://schema.org',
    '@type': 'Store',
    name,
    description: description || undefined,
    image: image ? absoluteUrl(image) : undefined,
    url: absoluteUrl(path),
    telephone: phone || undefined,
    email: email || undefined,
    address: street.length
      ? {
          '@type': 'PostalAddress',
          streetAddress: address.addressLine || undefined,
          addressLocality: address.city || undefined,
          addressRegion: address.state || undefined,
          addressCountry: 'PK',
        }
      : undefined,
  }
}

export function serviceLd({ provider, path }) {
  const image = provider.avatar || provider.coverImage
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: provider.category?.name
      ? `${provider.displayName} — ${provider.category.name}`
      : provider.displayName,
    description: provider.bio || undefined,
    serviceType: provider.category?.name || undefined,
    url: absoluteUrl(path),
    image: image ? absoluteUrl(image) : undefined,
    provider: {
      '@type': 'LocalBusiness',
      name: provider.displayName,
      image: image ? absoluteUrl(image) : undefined,
      areaServed: [provider.block?.name, provider.city?.name].filter(Boolean).join(', ') || undefined,
    },
    offers:
      provider.startingAtPrice > 0
        ? {
            '@type': 'Offer',
            price: (provider.startingAtPrice / 100).toFixed(2),
            priceCurrency: 'PKR',
            url: absoluteUrl(path),
          }
        : undefined,
  }
}
