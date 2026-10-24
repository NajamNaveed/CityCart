import { can, hasNoAccess, visibleTabs } from '../src/utils/permissions'

const person = (...permissions) => ({ role: 'BRAND_EMPLOYEE', permissions })

describe('what a team member can see', () => {
  it('can() needs the exact permission, and nothing without a list', () => {
    expect(can(person('orders.view'), 'orders.view')).toBe(true)
    expect(can(person('orders.view'), 'orders.manage')).toBe(false)
    expect(can({ role: 'BRAND_EMPLOYEE' }, 'orders.view')).toBe(false)
    expect(can(null, 'orders.view')).toBe(false)
  })

  it('shows a tab only for the permission that opens it', () => {
    expect(visibleTabs(person('orders.view'))).toEqual({ overview: true, orders: true, shipments: false, money: false })
    expect(visibleTabs(person('delivery.view'))).toEqual({ overview: true, orders: false, shipments: true, money: false })
    expect(visibleTabs(person('payments.view'))).toEqual({ overview: true, orders: false, shipments: false, money: true })
    expect(visibleTabs(person('delivery.manage', 'riders.view'))).toEqual({ overview: false, orders: false, shipments: false, money: false })
  })

  it('knows when a person has been given nothing yet', () => {
    expect(hasNoAccess(person())).toBe(true)
    expect(hasNoAccess({ role: 'BRAND_EMPLOYEE' })).toBe(true)
    expect(hasNoAccess(person('payments.view'))).toBe(false)
  })
})
