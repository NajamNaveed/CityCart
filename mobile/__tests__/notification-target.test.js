import { notificationTarget } from '../src/utils/notificationTarget'

const CUSTOMER = { id: 'u1', role: 'CUSTOMER' }
const PROVIDER = { id: 'u2', role: 'SERVICE_PROVIDER' }

describe('notificationTarget', () => {
  it('sends order updates to the order', () => {
    expect(notificationTarget({ data: { orderId: 'o1' } }, CUSTOMER)).toBe('/orders/o1')
  })

  it('sends a booking update to the customer booking', () => {
    expect(notificationTarget({ data: { bookingId: 'b1' } }, CUSTOMER)).toBe('/bookings/b1')
  })

  it('sends provider-only news to services discovery', () => {
    expect(notificationTarget({ data: { providerId: 'p1' } }, CUSTOMER)).toBe('/services')
  })

  it('sends product news to the product page', () => {
    expect(notificationTarget({ data: { productId: 'pr1' } }, CUSTOMER)).toBe('/product/pr1')
  })

  it('prefers the order when a payload carries several ids', () => {
    expect(notificationTarget({ data: { orderId: 'o1', productId: 'pr1' } }, CUSTOMER)).toBe('/orders/o1')
  })

  it('has no shopper destination for providers or signed-out visitors', () => {
    expect(notificationTarget({ data: { bookingId: 'b1' } }, PROVIDER)).toBeNull()
    expect(notificationTarget({ data: { orderId: 'o1' } }, null)).toBeNull()
  })

  it('ignores notifications without a scoped destination', () => {
    expect(notificationTarget({ data: { brandId: 'br1' } }, CUSTOMER)).toBeNull()
    expect(notificationTarget({}, CUSTOMER)).toBeNull()
    expect(notificationTarget(null, CUSTOMER)).toBeNull()
  })
})
