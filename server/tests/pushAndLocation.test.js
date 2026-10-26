const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');
jest.mock('../src/models/delivery.model');
jest.mock('../src/models/deviceToken.model');
jest.mock('../src/models/riderLocation.model', () => {
  const model = { findOneAndUpdate: jest.fn(), findOne: jest.fn(), deleteOne: jest.fn() };
  model.KEEP_SECONDS = 7200;
  return model;
});

const User = require('../src/models/user.model');
const Employee = require('../src/models/employee.model');
const Delivery = require('../src/models/delivery.model');
const DeviceToken = require('../src/models/deviceToken.model');
const RiderLocation = require('../src/models/riderLocation.model');
const app = require('../src/app');
const env = require('../src/config/env');
const { ROLES } = require('../src/config/roles');
const { PERMISSIONS } = require('../src/config/permissions');
const { signToken } = require('../src/utils/jwt');
const { sendPushToUsers, PUSH_URL } = require('../src/services/push.service');
const { MAX_TOKENS_PER_USER } = require('../src/services/deviceToken.service');
const { isAllowedWhenRestricted } = require('../src/config/restrictedAccess');
const { getAuthCookie } = require('./helpers/testAuth');

const oid = () => new mongoose.Types.ObjectId();
const brandId = oid();
const TOKEN = 'ExponentPushToken[abcDEF123_-xyz]';

function signedIn(role, permissions) {
  const user = { _id: oid(), role, isActive: true, passwordVersion: 0, ...(role.includes('BRAND') || role === 'RIDER' ? { brandId } : {}) };
  User.findById.mockResolvedValue(user);
  if (role === ROLES.BRAND_EMPLOYEE) Employee.findOne.mockResolvedValue({ isActive: true, permissions: permissions || [] });
  return user;
}
const partner = (role, permissions) => {
  const user = signedIn(role, permissions);
  const token = signToken({ userId: user._id, role, brandId: user.brandId, passwordVersion: 0, client: 'partner' }, { expiresIn: '8h' });
  return { header: ['Authorization', `Bearer ${token}`], user };
};
const web = (role, permissions) => {
  const user = signedIn(role, permissions);
  return { header: ['Cookie', getAuthCookie(user)], user };
};

const savedPush = { ...env.push };
beforeEach(() => {
  jest.resetAllMocks();
  Object.assign(env.push, savedPush);
});
afterAll(() => {
  Object.assign(env.push, savedPush);
  delete global.fetch;
});

describe('registering a phone for push notifications', () => {
  const put = (header, body) => request(app).put('/api/v1/devices/push-token').set(...header).send(body);

  it('401 when signed out; only the Partner app roles may register', async () => {
    expect((await request(app).put('/api/v1/devices/push-token').send({ token: TOKEN })).status).toBe(401);
    for (const role of [ROLES.CUSTOMER, ROLES.BRAND_ADMIN, ROLES.SUPER_ADMIN]) {
      expect((await put(web(role).header, { token: TOKEN })).status).toBe(403);
    }
    expect(DeviceToken.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it.each([[ROLES.RIDER], [ROLES.BRAND_EMPLOYEE]])('a %s can register their phone, and the user comes from the session, never the body', async (role) => {
    const { header, user } = partner(role, []);
    DeviceToken.findOneAndUpdate.mockResolvedValue({});
    DeviceToken.find.mockReturnValue({ sort: () => ({ select: () => Promise.resolve([{ _id: oid() }]) }) });

    const res = await put(header, { token: TOKEN, platform: 'android', userId: oid() });

    expect(res.status).toBe(200);
    expect(DeviceToken.findOneAndUpdate).toHaveBeenCalledWith(
      { token: TOKEN },
      { $set: { userId: user._id, platform: 'android', lastSeenAt: expect.any(Date) } },
      { upsert: true }
    );
  });

  it('a token that was another person\'s moves to the new user (one filter by token, userId overwritten)', async () => {
    const { header, user } = partner(ROLES.RIDER);
    DeviceToken.findOneAndUpdate.mockResolvedValue({});
    DeviceToken.find.mockReturnValue({ sort: () => ({ select: () => Promise.resolve([]) }) });
    await put(header, { token: TOKEN });
    const [filter, update] = DeviceToken.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ token: TOKEN }); // not { userId, token }: the token is unique to a phone
    expect(update.$set.userId).toBe(user._id);
  });

  it('keeps only the newest few phones of a user', async () => {
    const { header, user } = partner(ROLES.RIDER);
    const docs = Array.from({ length: MAX_TOKENS_PER_USER + 2 }, () => ({ _id: oid() }));
    DeviceToken.findOneAndUpdate.mockResolvedValue({});
    DeviceToken.find.mockReturnValue({ sort: () => ({ select: () => Promise.resolve(docs) }) });
    DeviceToken.deleteMany.mockResolvedValue({});

    await put(header, { token: TOKEN });

    expect(DeviceToken.find).toHaveBeenCalledWith({ userId: user._id });
    expect(DeviceToken.deleteMany).toHaveBeenCalledWith({ _id: { $in: docs.slice(MAX_TOKENS_PER_USER).map((d) => d._id) } });
  });

  it.each([[{}], [{ token: 'nope' }], [{ token: 'ExponentPushToken[]' }], [{ token: TOKEN, platform: 'windows' }], [{ token: 123 }]])('400 for %j', async (body) => {
    const { header } = partner(ROLES.RIDER);
    expect((await put(header, body)).status).toBe(400);
    expect(DeviceToken.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('signing out removes only the caller\'s own token', async () => {
    const { header, user } = partner(ROLES.RIDER);
    DeviceToken.deleteOne.mockResolvedValue({});
    const res = await request(app).delete('/api/v1/devices/push-token').set(...header).send({ token: TOKEN });
    expect(res.status).toBe(200);
    expect(DeviceToken.deleteOne).toHaveBeenCalledWith({ userId: user._id, token: TOKEN });
  });
});

describe('sending a push notification', () => {
  const enable = () => Object.assign(env.push, { enabled: true, accessToken: '' });
  const devices = (...tokens) => DeviceToken.find.mockReturnValue({ select: () => Promise.resolve(tokens.map((t) => ({ token: t }))) });
  const okTickets = (n) => ({ ok: true, status: 200, json: async () => ({ data: Array.from({ length: n }, () => ({ status: 'ok' })) }) });

  it('does nothing at all while push is off (the default): no database read, no network', async () => {
    global.fetch = jest.fn();
    expect(await sendPushToUsers([oid()], { title: 't', body: 'b' })).toBe(0);
    expect(DeviceToken.find).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('sends the same title and text to every phone of the users, with the data to open the right screen', async () => {
    enable();
    const a = oid();
    devices(TOKEN, 'ExponentPushToken[second_phone_1]');
    global.fetch = jest.fn().mockResolvedValue(okTickets(2));

    const sent = await sendPushToUsers([a, a, null], { title: 'New delivery', body: 'Order CC-1', data: { deliveryId: 'd1', type: 'DELIVERY_ASSIGNED' } });

    expect(sent).toBe(2);
    expect(DeviceToken.find).toHaveBeenCalledWith({ userId: { $in: [String(a)] } }); // deduplicated
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe(PUSH_URL);
    const messages = JSON.parse(options.body);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ to: TOKEN, title: 'New delivery', body: 'Order CC-1', data: { deliveryId: 'd1', type: 'DELIVERY_ASSIGNED' }, channelId: 'default' });
    expect(options.headers.Authorization).toBeUndefined();
  });

  it('uses the Expo access token when one is configured', async () => {
    enable();
    env.push.accessToken = 'secret-expo-token';
    devices(TOKEN);
    global.fetch = jest.fn().mockResolvedValue(okTickets(1));
    await sendPushToUsers([oid()], { title: 't', body: 'b' });
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer secret-expo-token');
  });

  it('sends at most 100 messages per request', async () => {
    enable();
    devices(...Array.from({ length: 230 }, (_, i) => `ExponentPushToken[device_${String(i).padStart(4, '0')}]`));
    global.fetch = jest.fn().mockImplementation(async (url, options) => okTickets(JSON.parse(options.body).length));
    expect(await sendPushToUsers([oid()], { title: 't', body: 'b' })).toBe(230);
    expect(global.fetch.mock.calls.map(([, o]) => JSON.parse(o.body).length)).toEqual([100, 100, 30]);
  });

  it('forgets a phone the push service says is gone, and keeps the rest', async () => {
    enable();
    devices(TOKEN, 'ExponentPushToken[gone_phone_1]');
    DeviceToken.deleteMany.mockResolvedValue({});
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }] }),
    });
    expect(await sendPushToUsers([oid()], { title: 't', body: 'b' })).toBe(1);
    expect(DeviceToken.deleteMany).toHaveBeenCalledWith({ token: { $in: ['ExponentPushToken[gone_phone_1]'] } });
  });

  it('a different error does not delete the phone', async () => {
    enable();
    devices(TOKEN);
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ status: 'error', details: { error: 'MessageRateExceeded' } }] }) });
    await sendPushToUsers([oid()], { title: 't', body: 'b' });
    expect(DeviceToken.deleteMany).not.toHaveBeenCalled();
  });

  it('a user with no registered phone costs no network call', async () => {
    enable();
    devices();
    global.fetch = jest.fn();
    expect(await sendPushToUsers([oid()], { title: 't', body: 'b' })).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('is best effort: a network failure or a refusal is logged and never thrown', async () => {
    enable();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    devices(TOKEN);
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));
    await expect(sendPushToUsers([oid()], { title: 't', body: 'b' })).resolves.toBe(0);
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    await expect(sendPushToUsers([oid()], { title: 't', body: 'b' })).resolves.toBe(0);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});

describe('every in-app notification also goes out as a push', () => {
  it('notify() passes the same title and text, the data and the type to the push sender', async () => {
    jest.resetModules();
    jest.doMock('../src/models/notification.model', () => ({ insertMany: jest.fn(async (rows) => rows.map((r, i) => ({ _id: `n${i}`, ...r }))) }));
    jest.doMock('../src/sockets', () => ({ emitToUser: jest.fn() }));
    jest.doMock('../src/services/push.service', () => ({ sendPushToUsers: jest.fn().mockResolvedValue(1) }));
    jest.doMock('../src/models/user.model', () => ({}));
    jest.doMock('../src/models/employee.model', () => ({}));
    jest.doMock('../src/models/product.model', () => ({}));
    jest.doMock('../src/models/brand.model', () => ({}));
    const push = require('../src/services/push.service');
    const { notifyRiderAssigned } = require('../src/services/notification.service');

    const rider = oid();
    await notifyRiderAssigned({ userId: rider, brandId, orderNumber: 'CC-1', deliveryId: 'd1' });

    expect(push.sendPushToUsers).toHaveBeenCalledWith([String(rider)], {
      title: 'New delivery',
      body: 'You have been assigned the delivery for order CC-1.',
      data: expect.objectContaining({ deliveryId: 'd1', type: 'DELIVERY_ASSIGNED' }),
    });
    jest.dontMock('../src/models/notification.model');
  });
});

describe('a rider sharing their position', () => {
  const put = (header, body) => request(app).put('/api/v1/rider/deliveries/location').set(...header).send(body);
  const POINT = { latitude: 31.4181, longitude: 73.0776, accuracy: 12 };

  it('only a rider may share, and only their own position', async () => {
    expect((await request(app).put('/api/v1/rider/deliveries/location').send(POINT)).status).toBe(401);
    for (const role of [ROLES.CUSTOMER, ROLES.BRAND_ADMIN, ROLES.BRAND_EMPLOYEE, ROLES.SUPER_ADMIN]) {
      expect((await put(web(role, Object.values(PERMISSIONS)).header, POINT)).status).toBe(403);
    }
    expect(RiderLocation.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('stores the last point of this rider in this brand, once they have a delivery out', async () => {
    const { header, user } = partner(ROLES.RIDER);
    Delivery.exists.mockResolvedValue({ _id: oid() });
    RiderLocation.findOneAndUpdate.mockResolvedValue({});

    const res = await put(header, { ...POINT, riderId: oid(), brandId: oid() });

    expect(res.status).toBe(200);
    expect(Delivery.exists).toHaveBeenCalledWith({ brandId: brandId.toString(), riderId: user._id, status: 'OUT_FOR_DELIVERY' });
    expect(RiderLocation.findOneAndUpdate).toHaveBeenCalledWith(
      { riderId: user._id }, // from the session, never the body
      { $set: { brandId: brandId.toString(), latitude: 31.4181, longitude: 73.0776, accuracy: 12, recordedAt: expect.any(Date) } },
      { upsert: true }
    );
  });

  it('409 NO_ACTIVE_DELIVERY, and nothing is stored, when no delivery is out', async () => {
    const { header } = partner(ROLES.RIDER);
    Delivery.exists.mockResolvedValue(null);
    const res = await put(header, POINT);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NO_ACTIVE_DELIVERY');
    expect(RiderLocation.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it.each([[{}], [{ latitude: 91, longitude: 0 }], [{ latitude: 0, longitude: 181 }], [{ latitude: '31', longitude: 73 }], [{ latitude: 31, longitude: 73, accuracy: -1 }]])('400 for %j', async (body) => {
    const { header } = partner(ROLES.RIDER);
    expect((await put(header, body)).status).toBe(400);
    expect(Delivery.exists).not.toHaveBeenCalled();
  });

  it('stopping forgets the rider\'s position at once, and only theirs', async () => {
    const { header, user } = partner(ROLES.RIDER);
    RiderLocation.deleteOne.mockResolvedValue({});
    const res = await request(app).delete('/api/v1/rider/deliveries/location').set(...header);
    expect(res.status).toBe(200);
    expect(RiderLocation.deleteOne).toHaveBeenCalledWith({ riderId: user._id });
  });

  it('a terminated brand\'s rider may still share while finishing deliveries on the road', () => {
    expect(isAllowedWhenRestricted('PUT', '/api/v1/rider/deliveries/location')).toBe(true);
    expect(isAllowedWhenRestricted('DELETE', '/api/v1/rider/deliveries/location')).toBe(true);
    expect(isAllowedWhenRestricted('DELETE', '/api/v1/devices/push-token')).toBe(true);
    expect(isAllowedWhenRestricted('PUT', '/api/v1/devices/push-token')).toBe(false);
  });
});

describe('who can see where a rider is', () => {
  const get = (header, id) => request(app).get(`/api/v1/deliveries/${id}/rider-location`).set(...header);
  const riderId = oid();
  const out = (over = {}) => ({ _id: oid(), brandId, customerId: oid(), riderId, status: 'OUT_FOR_DELIVERY', ...over });
  const fresh = (over = {}) => ({ latitude: 31.4, longitude: 73.1, accuracy: 9, recordedAt: new Date(), ...over });

  it('401 signed out; riders and the super admin cannot follow riders here', async () => {
    expect((await request(app).get(`/api/v1/deliveries/${oid()}/rider-location`)).status).toBe(401);
    expect((await get(partner(ROLES.RIDER).header, oid())).status).toBe(403);
    expect((await get(web(ROLES.SUPER_ADMIN).header, oid())).status).toBe(403);
    expect(RiderLocation.findOne).not.toHaveBeenCalled();
  });

  it('a team member needs delivery.view', async () => {
    expect((await get(web(ROLES.BRAND_EMPLOYEE, [PERMISSIONS.ORDERS_VIEW]).header, oid())).status).toBe(403);
    const { header } = web(ROLES.BRAND_EMPLOYEE, [PERMISSIONS.DELIVERY_VIEW]);
    const d = out();
    Delivery.findOne.mockResolvedValue(d);
    RiderLocation.findOne.mockResolvedValue(fresh());
    const res = await get(header, d._id);
    expect(res.status).toBe(200);
    expect(res.body.location).toMatchObject({ latitude: 31.4, longitude: 73.1, accuracy: 9 });
  });

  it("a customer sees only their own order's rider (the delivery is looked up by customer)", async () => {
    const { header, user } = web(ROLES.CUSTOMER);
    const d = out({ customerId: user._id });
    Delivery.findOne.mockResolvedValue(d);
    RiderLocation.findOne.mockResolvedValue(fresh());

    const res = await get(header, d._id);

    expect(res.status).toBe(200);
    expect(Delivery.findOne).toHaveBeenCalledWith({ _id: d._id.toString(), customerId: user._id });
    expect(RiderLocation.findOne).toHaveBeenCalledWith({ riderId, brandId });
    expect(res.body.location.recordedAt).toBeDefined();
    expect(JSON.stringify(res.body)).not.toContain(String(riderId)); // the rider's account id is not exposed
  });

  it("a brand sees only its own brand's deliveries", async () => {
    const { header } = web(ROLES.BRAND_ADMIN);
    const d = out();
    Delivery.findOne.mockResolvedValue(d);
    RiderLocation.findOne.mockResolvedValue(fresh());
    await get(header, d._id);
    expect(Delivery.findOne).toHaveBeenCalledWith({ _id: d._id.toString(), brandId: brandId.toString() });
  });

  it("404 for someone else's delivery", async () => {
    Delivery.findOne.mockResolvedValue(null);
    expect((await get(web(ROLES.CUSTOMER).header, oid())).status).toBe(404);
    expect((await get(web(ROLES.CUSTOMER).header, 'nope')).status).toBe(400);
    expect(RiderLocation.findOne).not.toHaveBeenCalled();
  });

  it.each(['READY_FOR_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'FAILED'])('shows nothing while the delivery is %s, and never even reads the position', async (status) => {
    const { header, user } = web(ROLES.CUSTOMER);
    Delivery.findOne.mockResolvedValue(out({ customerId: user._id, status }));
    const res = await get(header, oid());
    expect(res.body.location).toBeNull();
    expect(RiderLocation.findOne).not.toHaveBeenCalled();
  });

  it('shows nothing when the rider is not sharing, or the last point is old', async () => {
    const { header, user } = web(ROLES.CUSTOMER);
    Delivery.findOne.mockResolvedValue(out({ customerId: user._id }));
    RiderLocation.findOne.mockResolvedValue(null);
    expect((await get(header, oid())).body.location).toBeNull();
    RiderLocation.findOne.mockResolvedValue(fresh({ recordedAt: new Date(Date.now() - 11 * 60 * 1000) }));
    expect((await get(header, oid())).body.location).toBeNull();
  });

  it('shows nothing for a delivery with no rider', async () => {
    const { header, user } = web(ROLES.CUSTOMER);
    Delivery.findOne.mockResolvedValue(out({ customerId: user._id, riderId: undefined }));
    expect((await get(header, oid())).body.location).toBeNull();
    expect(RiderLocation.findOne).not.toHaveBeenCalled();
  });
});
