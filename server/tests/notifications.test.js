const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/notification.model');
jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');
jest.mock('../src/sockets', () => ({
  initSockets: jest.fn(),
  emitToUser: jest.fn(),
  closeSockets: jest.fn(() => Promise.resolve()),
}));

const User = require('../src/models/user.model');
const Employee = require('../src/models/employee.model');
const Notification = require('../src/models/notification.model');
const { emitToUser } = require('../src/sockets');
const app = require('../src/app');
const { ROLES } = require('../src/config/roles');
const { getAuthCookie } = require('./helpers/testAuth');
const { notify, brandStaffIds } = require('../src/services/notification.service');

const oid = () => new mongoose.Types.ObjectId();

function asRole(role = ROLES.CUSTOMER) {
  const user = { _id: oid(), role, isActive: true, ...(role.includes('BRAND') && { brandId: oid() }) };
  User.findById.mockResolvedValue(user);
  return { cookie: ['Cookie', getAuthCookie(user)], user };
}

// Notification.find(...).sort().skip().limit() chain
function mockFind(items) {
  const limit = jest.fn().mockResolvedValue(items);
  Notification.find.mockReturnValue({ sort: () => ({ skip: () => ({ limit }) }) });
  return limit;
}

beforeEach(() => jest.resetAllMocks());

describe('notification access control', () => {
  it('401 when unauthenticated, on every endpoint', async () => {
    const id = oid();
    expect((await request(app).get('/api/v1/notifications')).status).toBe(401);
    expect((await request(app).patch('/api/v1/notifications/read-all')).status).toBe(401);
    expect((await request(app).patch(`/api/v1/notifications/${id}/read`)).status).toBe(401);
    expect((await request(app).delete(`/api/v1/notifications/${id}`)).status).toBe(401);
  });
});

describe('GET /api/v1/notifications', () => {
  it('lists only the caller’s notifications, with pagination and an unread count', async () => {
    const { cookie, user } = asRole();
    const items = [{ _id: oid().toString(), type: 'ORDER_CREATED', title: 'New order', message: 'm', isRead: false }];
    mockFind(items);
    Notification.countDocuments.mockImplementation((filter) =>
      Promise.resolve(filter.isRead === false ? 3 : 12)
    );

    const res = await request(app).get('/api/v1/notifications?page=2&limit=10').set(...cookie);

    expect(res.status).toBe(200);
    expect(Notification.find).toHaveBeenCalledWith({ userId: user._id });
    expect(res.body.notifications).toEqual(items);
    expect(res.body.pagination).toEqual({ page: 2, limit: 10, total: 12, pages: 2 });
    expect(res.body.unreadCount).toBe(3);
    // The unread count is scoped to the caller as well.
    expect(Notification.countDocuments).toHaveBeenCalledWith({ userId: user._id, isRead: false });
  });

  it.each([ROLES.CUSTOMER, ROLES.BRAND_ADMIN, ROLES.BRAND_EMPLOYEE, ROLES.SUPER_ADMIN])(
    'answers 200 for %s — the inbox is personal, not permission-gated',
    async (role) => {
      const { cookie } = asRole(role);
      mockFind([]);
      Notification.countDocuments.mockResolvedValue(0);
      expect((await request(app).get('/api/v1/notifications').set(...cookie)).status).toBe(200);
    }
  );

  it.each([
    ['limit above the maximum', '?limit=51'],
    ['a zero page', '?page=0'],
    ['a non-numeric page', '?page=abc'],
    ['a zero limit', '?limit=0'],
  ])('400 for %s', async (_n, query) => {
    const { cookie } = asRole();
    expect((await request(app).get(`/api/v1/notifications${query}`).set(...cookie)).status).toBe(400);
  });
});

describe('PATCH /api/v1/notifications/:id/read', () => {
  it('marks the caller’s own notification read (isRead + readAt)', async () => {
    const { cookie, user } = asRole();
    const id = oid();
    Notification.findOneAndUpdate.mockResolvedValue({ _id: id, isRead: true, readAt: new Date() });

    const res = await request(app).patch(`/api/v1/notifications/${id}/read`).set(...cookie);

    expect(res.status).toBe(200);
    expect(res.body.notification.isRead).toBe(true);
    // Ownership lives in the filter itself (docs/12 §26).
    expect(Notification.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: id.toString(), userId: user._id },
      { $set: { isRead: true, readAt: expect.any(Date) } },
      { new: true }
    );
  });

  it('404 for another user’s notification — no leak, no update', async () => {
    const { cookie } = asRole();
    Notification.findOneAndUpdate.mockResolvedValue(null);
    const res = await request(app).patch(`/api/v1/notifications/${oid()}/read`).set(...cookie);
    expect(res.status).toBe(404);
  });

  it('400 for a malformed id', async () => {
    const { cookie } = asRole();
    expect((await request(app).patch('/api/v1/notifications/nope/read').set(...cookie)).status).toBe(400);
  });
});

describe('PATCH /api/v1/notifications/read-all', () => {
  it('marks only the caller’s unread notifications read', async () => {
    const { cookie, user } = asRole();
    Notification.updateMany.mockResolvedValue({ modifiedCount: 4 });

    const res = await request(app).patch('/api/v1/notifications/read-all').set(...cookie);

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(4);
    expect(Notification.updateMany).toHaveBeenCalledWith(
      { userId: user._id, isRead: false },
      { $set: { isRead: true, readAt: expect.any(Date) } }
    );
  });
});

describe('DELETE /api/v1/notifications/:id', () => {
  it('deletes the caller’s own notification', async () => {
    const { cookie, user } = asRole();
    const id = oid();
    Notification.findOneAndDelete.mockResolvedValue({ _id: id });

    const res = await request(app).delete(`/api/v1/notifications/${id}`).set(...cookie);

    expect(res.status).toBe(200);
    expect(Notification.findOneAndDelete).toHaveBeenCalledWith({ _id: id.toString(), userId: user._id });
  });

  it('404 for another user’s notification', async () => {
    const { cookie } = asRole();
    Notification.findOneAndDelete.mockResolvedValue(null);
    expect((await request(app).delete(`/api/v1/notifications/${oid()}`).set(...cookie)).status).toBe(404);
  });
});

describe('notify() — persistence and push (docs/12 §2)', () => {
  it('writes one record per recipient (deduplicated) and pushes each user their own payload', async () => {
    const a = oid();
    const b = oid();
    Notification.insertMany.mockImplementation(async (docs) =>
      docs.map((d) => ({ ...d, _id: oid(), isRead: false, createdAt: new Date() }))
    );

    const docs = await notify({ userIds: [a, a, b], type: 'ORDER_CREATED', title: 'T', message: 'M', data: { orderId: 'o1' } });

    expect(docs).toHaveLength(2);
    expect(Notification.insertMany).toHaveBeenCalledTimes(1);
    const written = Notification.insertMany.mock.calls[0][0];
    expect(written.map((d) => String(d.userId)).sort()).toEqual([String(a), String(b)].sort());
    expect(written[0]).toMatchObject({ type: 'ORDER_CREATED', title: 'T', message: 'M', data: { orderId: 'o1' } });

    // One private push per recipient, shaped like the persisted record.
    expect(emitToUser).toHaveBeenCalledTimes(2);
    const payloads = emitToUser.mock.calls.map(([, payload]) => payload);
    for (const payload of payloads) {
      expect(payload).toMatchObject({ type: 'ORDER_CREATED', title: 'T', message: 'M', isRead: false });
    }
  });

  it('is best-effort: a storage failure never throws into the business operation', async () => {
    Notification.insertMany.mockRejectedValue(new Error('storage down'));
    // The catch deliberately logs; silence it so the suite stays free of console noise.
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(notify({ userIds: [oid()], type: 'LOW_STOCK', title: 'T', message: 'M' })).resolves.toEqual([]);
    errorLog.mockRestore();
    expect(emitToUser).not.toHaveBeenCalled();
  });

  it('sends nothing when there is no audience', async () => {
    const docs = await notify({ userIds: [], type: 'LOW_STOCK', title: 'T', message: 'M' });
    expect(docs).toEqual([]);
    expect(Notification.insertMany).not.toHaveBeenCalled();
  });
});

describe('brandStaffIds() — permission-aware brand audiences (docs/12 §7, §23)', () => {
  it('returns active brand admins plus only the employees holding a required permission', async () => {
    const brandId = oid();
    const admin = oid();
    User.find.mockReturnValue({ select: jest.fn().mockResolvedValue([{ _id: admin }]) });
    Employee.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([
        { userId: oid(), permissions: ['orders.view'] },
        { userId: oid(), permissions: ['products.view'] },
        { userId: oid(), permissions: [] },
      ]),
    });

    const ids = await brandStaffIds(brandId, { anyOf: ['orders.view'] });

    expect(User.find).toHaveBeenCalledWith({ brandId, role: ROLES.BRAND_ADMIN, isActive: true });
    expect(Employee.find).toHaveBeenCalledWith({ brandId, isActive: true });
    expect(ids).toHaveLength(2); // the admin + the single orders.view employee
  });

  it('with no permission requirement, every active staff member qualifies', async () => {
    const brandId = oid();
    const admin = oid();
    User.find.mockReturnValue({ select: jest.fn().mockResolvedValue([{ _id: admin }]) });
    Employee.find.mockReturnValue({ select: jest.fn().mockResolvedValue([{ userId: oid(), permissions: [] }]) });

    const ids = await brandStaffIds(brandId);

    expect(ids).toHaveLength(2);
  });
});
