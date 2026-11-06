const mongoose = require('mongoose');

const { connect, disconnect, clearAll } = require('./db');
const Brand = require('../../src/models/brand.model');
const User = require('../../src/models/user.model');
const Employee = require('../../src/models/employee.model');
const RiderLocation = require('../../src/models/riderLocation.model');
const {
  releaseTerminatedBrandIdentities,
  releaseDueTerminatedBrandIdentities,
} = require('../../src/services/brandTermination.service');
const { ROLES } = require('../../src/config/roles');

const oid = () => new mongoose.Types.ObjectId();
let n = 0;

const makeBrand = (over = {}) => {
  n += 1;
  return Brand.create({ name: `B${n}`, slug: `b${n}`, cityId: oid(), status: 'ACTIVE', ...over });
};

const makeUser = (role, brandId, over = {}) => {
  n += 1;
  return User.create({
    name: `User ${n}`,
    email: `user${n}@x.com`,
    passwordHash: 'x',
    role,
    brandId,
    ...over,
  });
};

const ended = () => new Date(Date.now() - 60 * 1000);
const later = () => new Date(Date.now() + 60 * 60 * 1000);

beforeAll(async () => {
  await connect();
  await Promise.all([Brand, User, Employee, RiderLocation].map((m) => m.init()));
});
afterAll(disconnect);
beforeEach(clearAll);

describe('terminated-brand identity release (real MongoDB)', () => {
  it('does nothing until the access window has ended', async () => {
    const brand = await makeBrand({ status: 'TERMINATED', accessEndsAt: later() });
    const admin = await makeUser(ROLES.BRAND_ADMIN, brand._id);

    expect(await releaseTerminatedBrandIdentities(brand._id)).toEqual({ anonymized: 0, membershipsRemoved: 0 });
    expect((await User.findById(admin._id)).deletedAt).toBeNull();
  });

  it('ignores brands that are not terminated', async () => {
    const brand = await makeBrand({ status: 'SUSPENDED', accessEndsAt: ended() });
    const admin = await makeUser(ROLES.BRAND_ADMIN, brand._id);

    expect(await releaseTerminatedBrandIdentities(brand._id)).toEqual({ anonymized: 0, membershipsRemoved: 0 });
    expect((await User.findById(admin._id)).email).not.toMatch(/deleted\+/);
  });

  it('anonymizes single-brand staff, clears the rider position, and frees their emails', async () => {
    const brand = await makeBrand({ status: 'TERMINATED', accessEndsAt: ended() });
    const admin = await makeUser(ROLES.BRAND_ADMIN, brand._id);
    const picker = await makeUser(ROLES.PICKER, brand._id);
    const rider = await makeUser(ROLES.RIDER, brand._id);
    await Employee.create({ userId: picker._id, brandId: brand._id, role: ROLES.PICKER });
    await RiderLocation.create({ riderId: rider._id, brandId: brand._id, latitude: 31.42, longitude: 73.08 });

    const result = await releaseTerminatedBrandIdentities(brand._id);

    expect(result).toEqual({ anonymized: 3, membershipsRemoved: 1 });
    for (const user of [admin, picker, rider]) {
      const stored = await User.findById(user._id);
      expect(stored.email).toBe(`deleted+${user._id}@deleted.invalid`);
      expect(stored.name).toBe('Deleted user');
      expect(stored.isActive).toBe(false);
      expect(stored.deletedAt).toBeInstanceOf(Date);
    }
    expect(await RiderLocation.countDocuments({ riderId: rider._id })).toBe(0);
    expect(await Employee.findOne({ userId: picker._id })).toMatchObject({
      isActive: false,
      removalReason: 'Brand terminated',
    });
  });

  it('removes the membership but keeps the account of someone still working elsewhere', async () => {
    const dead = await makeBrand({ status: 'TERMINATED', accessEndsAt: ended() });
    const alive = await makeBrand();
    const employee = await makeUser(ROLES.BRAND_EMPLOYEE, dead._id, {
      accessRestricted: true,
      accessExpiresAt: new Date(Date.now() - 1000),
    });
    await Employee.create({ userId: employee._id, brandId: dead._id, role: ROLES.BRAND_EMPLOYEE });
    await Employee.create({ userId: employee._id, brandId: alive._id, role: ROLES.BRAND_EMPLOYEE });

    const result = await releaseTerminatedBrandIdentities(dead._id);

    expect(result).toEqual({ anonymized: 0, membershipsRemoved: 1 });
    expect((await Employee.findOne({ userId: employee._id, brandId: dead._id })).isActive).toBe(false);
    expect((await Employee.findOne({ userId: employee._id, brandId: alive._id })).isActive).toBe(true);
    const stored = await User.findById(employee._id);
    expect(stored.email).toBe(employee.email);
    expect(stored.deletedAt).toBeNull();
    // the read-only window of the dead brand must not follow them
    expect(stored.accessRestricted).toBe(false);
    expect(stored.accessExpiresAt).toBeUndefined();
  });

  it('is safe to run twice', async () => {
    const brand = await makeBrand({ status: 'TERMINATED', accessEndsAt: ended() });
    await makeUser(ROLES.BRAND_ADMIN, brand._id);

    expect((await releaseTerminatedBrandIdentities(brand._id)).anonymized).toBe(1);
    expect(await releaseTerminatedBrandIdentities(brand._id)).toEqual({ anonymized: 0, membershipsRemoved: 0 });
  });

  it('processes only brands whose access has ended', async () => {
    const done = await makeBrand({ status: 'TERMINATED', accessEndsAt: ended() });
    await makeUser(ROLES.BRAND_ADMIN, done._id);
    const waiting = await makeBrand({ status: 'TERMINATED', accessEndsAt: later() });
    const waitingAdmin = await makeUser(ROLES.BRAND_ADMIN, waiting._id);

    const result = await releaseDueTerminatedBrandIdentities();

    expect(result.anonymized).toBe(1);
    expect((await User.findById(waitingAdmin._id)).deletedAt).toBeNull();
  });
});
