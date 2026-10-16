import { optimizedUrl } from '../src/utils/image'

describe('optimizedUrl', () => {
  const plain = 'https://res.cloudinary.com/demo/image/upload/v1700000000/shop/kurta.jpg'

  it('asks Cloudinary for a resized, auto-format copy', () => {
    expect(optimizedUrl(plain, 600)).toBe('https://res.cloudinary.com/demo/image/upload/c_limit,w_600,f_auto,q_auto/v1700000000/shop/kurta.jpg')
    expect(optimizedUrl(plain, 599.6)).toContain('w_600')
  })

  it('leaves every other address exactly as given', () => {
    for (const url of ['https://picsum.photos/seed/lawn-suit-1/800/1000', 'https://res.cloudinary.com/demo/image/upload/c_fill,w_100/v1/x.jpg', 'http://res.cloudinary.com/demo/image/upload/v1/x.jpg']) {
      expect(optimizedUrl(url, 600)).toBe(url)
    }
  })

  it('does not choke on a missing photo', () => {
    expect(optimizedUrl(undefined, 600)).toBeUndefined()
    expect(optimizedUrl(null, 600)).toBeNull()
  })
})
