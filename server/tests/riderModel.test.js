// No model mocks here: these check the real schemas and helpers.
const User = require('../src/models/user.model');
const Delivery = require('../src/models/delivery.model');
const mongoose = require('mongoose');
const { ROLES, ALL_ROLES, BRAND_SCOPED_ROLES, STAFF_ROLES, PARTNER_ROLES } = require('../src/config/roles');
const { ALL_PERMISSIONS } = require('../src/config/permissions');
const { isAllowedWhenRestricted } = require('../src/config/restrictedAccess');
const { generateDeliveryCode, codesMatch, CODE_PATTERN, MAX_CODE_ATTEMPTS } = require('../src/utils/deliveryCode');
const { RIDER_SETTABLE_STATUSES, legalDeliverySourcesFor } = require('../src/config/deliveryTransitions');
const Notification = require('../src/models/notification.model');

describe('the RIDER role', () => {
  const base = { name: 'Bilal', email: 'bilal@example.com', passwordHash: 'x', role: 'RIDER' };

  it('is a brand-scoped staff role that can use the partner app', () => {
    expect(ALL_ROLES).toContain(ROLES.RIDER);
    expect(BRAND_SCOPED_ROLES).toContain(ROLES.RIDER);
    expect(STAFF_ROLES).toContain(ROLES.RIDER);
    expect(PARTNER_ROLES.slice().sort()).toEqual(['BRAND_EMPLOYEE', 'RIDER']);
    expect(PARTNER_ROLES).not.toContain(ROLES.BRAND_ADMIN);
    expect(PARTNER_ROLES).not.toContain(ROLES.SUPER_ADMIN);
  });

  it('must belong to a brand, and is a BRAND account', () => {
    const noBrand = new User(base).validateSync();
    expect(noBrand.errors.brandId).toBeDefined();
    const ok = new User({ ...base, brandId: new mongoose.Types.ObjectId() });
    expect(ok.validateSync()).toBeUndefined();
    expect(ok.accountType).toBe('BRAND');
  });

  it('gets its own permission group', () => {
    expect(ALL_PERMISSIONS).toEqual(expect.arrayContaining(['riders.view', 'riders.create', 'riders.update']));
  });
});

describe('the delivery code', () => {
  it('is six digits, random and zero-padded', () => {
    const codes = new Set(Array.from({ length: 200 }, generateDeliveryCode));
    codes.forEach((c) => expect(c).toMatch(CODE_PATTERN));
    expect(codes.size).toBeGreaterThan(150);
  });

  it('compares exactly', () => {
    expect(codesMatch('482913', '482913')).toBe(true);
    expect(codesMatch('482913', '482914')).toBe(false);
    expect(codesMatch('482913', '48291')).toBe(false);
    expect(codesMatch(undefined, '482913')).toBe(false);
    expect(codesMatch('', '')).toBe(false);
  });

  it('allows five wrong tries', () => {
    expect(MAX_CODE_ATTEMPTS).toBe(5);
  });

  it('is never returned by default and the delivery tracks wrong tries', () => {
    expect(Delivery.schema.path('deliveryCode').options.select).toBe(false);
    expect(Delivery.schema.path('codeAttempts').options.default).toBe(0);
  });
});

describe('rider rules', () => {
  it('a rider can never set DELIVERED, CANCELLED, RETURNED or READY_FOR_PICKUP directly', () => {
    expect(RIDER_SETTABLE_STATUSES).toEqual(['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'FAILED']);
    RIDER_SETTABLE_STATUSES.forEach((s) => expect(legalDeliverySourcesFor(s).length).toBeGreaterThan(0));
  });

  it('knows the assignment notification', () => {
    expect(Notification.schema.path('type').enumValues).toContain('DELIVERY_ASSIGNED');
  });

  it("riders of a terminated brand can still finish deliveries on the road, and nothing else", () => {
    const id = 'a'.repeat(24);
    expect(isAllowedWhenRestricted('PATCH', `/api/v1/rider/deliveries/${id}/status`)).toBe(true);
    expect(isAllowedWhenRestricted('POST', `/api/v1/rider/deliveries/${id}/complete`)).toBe(true);
    expect(isAllowedWhenRestricted('GET', '/api/v1/rider/deliveries')).toBe(true);
    expect(isAllowedWhenRestricted('PATCH', `/api/v1/riders/${id}`)).toBe(false);
    expect(isAllowedWhenRestricted('POST', '/api/v1/riders')).toBe(false);
    expect(isAllowedWhenRestricted('PATCH', `/api/v1/deliveries/${id}/rider`)).toBe(false);
  });
});
