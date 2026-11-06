jest.mock('../../src/services/email.service');

const mongoose = require('mongoose');
const request = require('supertest');

const { connect, disconnect, clearAll } = require('./db');
const City = require('../../src/models/city.model');
const Block = require('../../src/models/block.model');
const Brand = require('../../src/models/brand.model');
const User = require('../../src/models/user.model');
const ServiceCategory = require('../../src/models/serviceCategory.model');
const ServiceProvider = require('../../src/models/serviceProvider.model');
const ServiceOffering = require('../../src/models/serviceOffering.model');
const ServiceAvailability = require('../../src/models/serviceAvailability.model');
const ServiceBooking = require('../../src/models/serviceBooking.model');
const ServiceConversation = require('../../src/models/serviceConversation.model');
const ServiceMessage = require('../../src/models/serviceMessage.model');
const ServiceReview = require('../../src/models/serviceReview.model');
const Notification = require('../../src/models/notification.model');
const AdminAction = require('../../src/models/adminAction.model');
const Counter = require('../../src/models/counter.model');
const app = require('../../src/app');
const { expireProposals, autoConfirmCompleted } = require('../../src/services/serviceBooking.service');
const { hashPassword } = require('../../src/utils/password');
const { signToken } = require('../../src/utils/jwt');
const { AUTH_COOKIE_NAME } = require('../../src/config/cookie');
const { karachiParts, karachiDateKey, karachiMonthKey } = require('../../src/utils/karachiTime');

let n = 0;
let passwordHash;
let city;
let blockA;
let blockB;
let category;
let brand;
let admin;

const cookieFor = (user) =>
  `${AUTH_COOKIE_NAME}=${signToken({
    userId: user._id,
    role: user.role,
    passwordVersion: user.passwordVersion,
  })}`;

/** A future slot at a Karachi wall-clock minute, used with availability windows. */
function slot(offsetDays = 3, minute = 600) {
  const base = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  const parts = karachiParts(base);
  const start = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day) - 5 * 60 * 60 * 1000 + minute * 60 * 1000
  );
  return { start, weekday: parts.weekday, dateKey: karachiDateKey(start) };
}

const makeCustomer = async (name = 'Customer') => {
  n += 1;
  return User.create({
    name: `${name} ${n}`,
    email: `customer${n}@services.test`,
    passwordHash,
    role: 'CUSTOMER',
  });
};

const makeBrandAdmin = async () => {
  n += 1;
  return User.create({
    name: `Brand Admin ${n}`,
    email: `brandadmin${n}@services.test`,
    passwordHash,
    role: 'BRAND_ADMIN',
    brandId: brand._id,
  });
};

const makeProvider = async ({ block = blockA, status = 'ACTIVE', verification = 'VERIFIED' } = {}) => {
  n += 1;
  const owner = await User.create({
    name: `Owner ${n}`,
    email: `owner${n}@services.test`,
    passwordHash,
    role: 'SERVICE_PROVIDER',
  });
  const provider = await ServiceProvider.create({
    userId: owner._id,
    displayName: `Provider ${n}`,
    slug: `provider-${n}`,
    categoryId: category._id,
    cityId: city._id,
    blockId: block._id,
    location: { type: 'Point', coordinates: block.center.coordinates },
    addressLine: `House ${n}, Street 3`,
    phone: `+9230011${String(n).padStart(4, '0')}`,
    startingAtPrice: 100000,
    status,
    verification,
  });
  return { owner, provider };
};

const makeOffering = async (provider, over = {}) => {
  n += 1;
  return ServiceOffering.create({
    providerId: provider._id,
    categoryId: provider.categoryId,
    title: `Deep clean ${n}`,
    slug: `deep-clean-${n}`,
    startingAtPrice: 150000,
    durationMinutes: 60,
    ...over,
  });
};

const bookingBody = (provider, offering, start, over = {}) => ({
  providerId: String(provider._id),
  offeringId: String(offering._id),
  scheduledStart: start.toISOString(),
  address: {
    fullName: 'Ayesha Khan',
    phone: '+923001234567',
    addressLine: 'House 5, Street 2, Peoples Colony',
  },
  location: {
    lat: blockA.center.coordinates[1],
    lng: blockA.center.coordinates[0],
  },
  ...over,
});

const createBooking = (customer, provider, offering, start, over = {}) =>
  request(app)
    .post('/api/v1/services/bookings')
    .set('Cookie', cookieFor(customer))
    .send(bookingBody(provider, offering, start, over));

const acceptBooking = (owner, bookingId, pricePaisa = 200000) =>
  request(app)
    .post(`/api/v1/services/provider/bookings/${bookingId}/accept`)
    .set('Cookie', cookieFor(owner))
    .send({ pricePaisa });

/** Seeds a booking in a given state for review/dispute/cancel tests. */
const seedBooking = async (customer, provider, { status = 'CONFIRMED', over = {} } = {}) => {
  n += 1;
  const start = slot();
  return ServiceBooking.create({
    bookingNumber: `SB-TEST-${n}`,
    customerId: customer._id,
    providerId: provider._id,
    offering: {
      offeringId: new mongoose.Types.ObjectId(),
      title: 'Deep clean',
      slug: 'deep-clean',
      durationMinutes: 60,
      startingAtPrice: 150000,
    },
    status,
    requestedStart: start.start,
    scheduledStart: start.start,
    scheduledEnd: new Date(start.start.getTime() + 60 * 60 * 1000),
    address: {
      fullName: 'Ayesha Khan',
      phone: '+923001234567',
      addressLine: 'House 5, Street 2',
      city: city.name,
      blockId: blockA._id,
      blockName: blockA.name,
      location: { type: 'Point', coordinates: blockA.center.coordinates },
    },
    agreedPricePaisa: 200000,
    ...(status === 'COMPLETED' || status === 'CONFIRMED'
      ? { finalAmountPaisa: 200000, completedAt: new Date() }
      : {}),
    ...(status === 'CONFIRMED' ? { confirmedAt: new Date(), confirmedBy: 'CUSTOMER' } : {}),
    ...over,
  });
};

beforeAll(async () => {
  await connect();
  await Promise.all(
    [
      City,
      Block,
      Brand,
      User,
      ServiceCategory,
      ServiceProvider,
      ServiceOffering,
      ServiceAvailability,
      ServiceBooking,
      ServiceConversation,
      ServiceMessage,
      ServiceReview,
      Notification,
      AdminAction,
      Counter,
    ].map((model) => model.init())
  );
  passwordHash = await hashPassword('secret123');
});

afterAll(disconnect);

beforeEach(async () => {
  await clearAll();
  n += 1;
  city = await City.create({ name: `City${n}`, slug: `city${n}`, isActive: true });
  blockA = await Block.create({
    cityId: city._id,
    name: `Block A${n}`,
    slug: `block-a${n}`,
    center: { type: 'Point', coordinates: [73.08, 31.42] },
    isActive: true,
  });
  blockB = await Block.create({
    cityId: city._id,
    name: `Block B${n}`,
    slug: `block-b${n}`,
    center: { type: 'Point', coordinates: [73.19, 31.52] },
    isActive: true,
  });
  category = await ServiceCategory.create({ name: `Cleaning ${n}`, slug: `cleaning${n}` });
  brand = await Brand.create({ name: `Brand ${n}`, slug: `brand-${n}`, cityId: city._id, status: 'ACTIVE' });
  admin = await User.create({
    name: 'Super Admin',
    email: `admin${n}@services.test`,
    passwordHash,
    role: 'SUPER_ADMIN',
    emailVerifiedAt: new Date(),
  });
});

describe('availability (real MongoDB)', () => {
  it('saves weekly windows and blackout dates scoped to the signed-in provider', async () => {
    const { owner } = await makeProvider();
    const windows = [
      { weekday: 1, startMinute: 540, endMinute: 1080, slotMinutes: 60 },
      { weekday: 2, startMinute: 600, endMinute: 900, slotMinutes: 30 },
    ];

    const put = await request(app)
      .put('/api/v1/services/provider/availability')
      .set('Cookie', cookieFor(owner))
      .send({ windows, blackoutDates: ['2026-12-25'] });
    expect(put.status).toBe(200);
    expect(put.body.availability).toMatchObject({
      isPublished: true,
      blackoutDates: ['2026-12-25'],
    });
    expect(put.body.availability.windows[0]).toMatchObject({
      weekday: 1,
      weekdayName: 'Monday',
      start: '09:00',
      end: '18:00',
    });

    const get = await request(app)
      .get('/api/v1/services/provider/availability')
      .set('Cookie', cookieFor(owner));
    expect(get.status).toBe(200);
    expect(get.body.availability.windows).toHaveLength(2);
  });

  it('is closed to customers, brand admins and anonymous callers', async () => {
    const customer = await makeCustomer();
    const brandAdmin = await makeBrandAdmin();

    expect((await request(app).get('/api/v1/services/provider/availability')).status).toBe(401);
    expect(
      (await request(app).get('/api/v1/services/provider/availability').set('Cookie', cookieFor(customer))).status
    ).toBe(403);
    expect(
      (await request(app).get('/api/v1/services/provider/availability').set('Cookie', cookieFor(brandAdmin))).status
    ).toBe(403);
  });

  it('rejects overlapping windows and malformed windows', async () => {
    const { owner } = await makeProvider();

    const overlap = await request(app)
      .put('/api/v1/services/provider/availability')
      .set('Cookie', cookieFor(owner))
      .send({
        windows: [
          { weekday: 3, startMinute: 540, endMinute: 720, slotMinutes: 60 },
          { weekday: 3, startMinute: 700, endMinute: 900, slotMinutes: 60 },
        ],
      });
    expect(overlap.status).toBe(400);
    expect(overlap.body.code).toBe('OVERLAPPING_WINDOWS');

    const malformed = await request(app)
      .put('/api/v1/services/provider/availability')
      .set('Cookie', cookieFor(owner))
      .send({ windows: [{ weekday: 9, startMinute: 800, endMinute: 700, slotMinutes: 5 }] });
    expect(malformed.status).toBe(400);
    expect(malformed.body.message).toBe('Validation failed.');
  });
});

describe('booking creation and slot rules (real MongoDB)', () => {
  it('creates a REQUESTED booking for an approved provider without trusting client prices', async () => {
    const { provider, owner } = await makeProvider();
    const offering = await makeOffering(provider);
    const customer = await makeCustomer();
    const start = slot();

    const res = await createBooking(customer, provider, offering, start.start, {
      // Strict schema: an attempt to name the price or the customer is refused.
      pricePaisa: 1,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed.');

    const created = await createBooking(customer, provider, offering, start.start, { note: 'Third floor' });
    expect(created.status).toBe(201);
    expect(created.body.booking).toMatchObject({
      status: 'REQUESTED',
      note: 'Third floor',
      canChat: false,
      provider: { _id: String(provider._id) },
    });
    expect(created.body.booking.agreedPricePaisa).toBeUndefined();
    expect(created.body.booking.bookingNumber).toMatch(/^SB-\d{4}-\d{6}$/);
    expect(created.body.booking.address).toMatchObject({
      fullName: 'Ayesha Khan',
      blockName: blockA.name,
    });
    // The provider's phone is private until the job is accepted.
    expect(created.body.booking.provider.phone).toBeUndefined();

    const stored = await ServiceBooking.findById(created.body.booking._id);
    expect(String(stored.customerId)).toBe(String(customer._id));
    expect(String(stored.providerId)).toBe(String(provider._id));
    expect(await Notification.countDocuments({ userId: owner._id, type: 'SERVICE_BOOKING_REQUESTED' })).toBe(1);
  });

  it('refuses past, too-far, out-of-block and foreign-offering requests', async () => {
    const { provider } = await makeProvider();
    const { provider: other } = await makeProvider({ block: blockB });
    const offering = await makeOffering(provider);
    const foreignOffering = await makeOffering(other);
    const customer = await makeCustomer();

    const past = await createBooking(customer, provider, offering, new Date(Date.now() - 60 * 60 * 1000));
    expect(past.status).toBe(400);
    expect(past.body.code).toBe('SLOT_IN_PAST');

    const far = await createBooking(customer, provider, offering, new Date(Date.now() + 61 * 24 * 60 * 60 * 1000));
    expect(far.status).toBe(400);
    expect(far.body.code).toBe('SLOT_TOO_FAR');

    const outside = await createBooking(customer, provider, offering, slot().start, {
      location: { lat: 24.86, lng: 67.0 },
    });
    expect(outside.status).toBe(400);
    expect(outside.body.code).toBe('OUTSIDE_SERVICE_BLOCK');

    const foreign = await createBooking(customer, provider, foreignOffering, slot().start);
    expect(foreign.status).toBe(404);

    expect(await ServiceBooking.countDocuments()).toBe(0);
  });

  it('refuses providers that are not approved and anonymous or brand callers', async () => {
    const { provider: pending } = await makeProvider({ status: 'PENDING', verification: 'UNVERIFIED' });
    const offering = await makeOffering(pending);
    const customer = await makeCustomer();
    const brandAdmin = await makeBrandAdmin();
    const start = slot().start;

    expect((await createBooking(customer, pending, offering, start)).status).toBe(404);

    expect(
      (
        await request(app)
          .post('/api/v1/services/bookings')
          .send(bookingBody(pending, offering, start))
      ).status
    ).toBe(401);

    expect(
      (
        await request(app)
          .post('/api/v1/services/bookings')
          .set('Cookie', cookieFor(brandAdmin))
          .send(bookingBody(pending, offering, start))
      ).status
    ).toBe(403);
  });

  it('honours published windows, blackout dates and already-booked slots', async () => {
    const { provider, owner } = await makeProvider();
    const offering = await makeOffering(provider);
    const customer = await makeCustomer();
    const customerB = await makeCustomer();
    const start = slot();

    await request(app)
      .put('/api/v1/services/provider/availability')
      .set('Cookie', cookieFor(owner))
      .send({
        windows: [{ weekday: start.weekday, startMinute: 540, endMinute: 1080, slotMinutes: 60 }],
        blackoutDates: [],
      });

    const outside = await createBooking(customer, provider, offering, slot(3, 1200).start);
    expect(outside.status).toBe(400);
    expect(outside.body.code).toBe('OUTSIDE_AVAILABILITY');

    const beforeBlackout = await request(app)
      .put('/api/v1/services/provider/availability')
      .set('Cookie', cookieFor(owner))
      .send({
        windows: [{ weekday: start.weekday, startMinute: 540, endMinute: 1080, slotMinutes: 60 }],
        blackoutDates: [start.dateKey],
      });
    expect(beforeBlackout.status).toBe(200);

    const blackout = await createBooking(customer, provider, offering, start.start);
    expect(blackout.status).toBe(400);
    expect(blackout.body.code).toBe('BLACKOUT_DATE');

    await request(app)
      .put('/api/v1/services/provider/availability')
      .set('Cookie', cookieFor(owner))
      .send({
        windows: [{ weekday: start.weekday, startMinute: 540, endMinute: 1080, slotMinutes: 60 }],
        blackoutDates: [],
      });

    const first = await createBooking(customer, provider, offering, start.start);
    expect(first.status).toBe(201);
    expect((await acceptBooking(owner, first.body.booking._id)).status).toBe(200);

    const taken = await createBooking(customerB, provider, offering, start.start);
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe('SLOT_TAKEN');
  });
});

describe('provider acceptance and proposals (real MongoDB)', () => {
  it('binds an accepted price at or above the published floor and opens the chat', async () => {
    const { provider, owner } = await makeProvider();
    const offering = await makeOffering(provider, { startingAtPrice: 150000 });
    const customer = await makeCustomer();
    const start = slot();

    const created = await createBooking(customer, provider, offering, start.start);
    const id = created.body.booking._id;

    const low = await acceptBooking(owner, id, 149999);
    expect(low.status).toBe(400);
    expect(low.body.code).toBe('PRICE_BELOW_STARTING');

    const accepted = await acceptBooking(owner, id, 200000);
    expect(accepted.status).toBe(200);
    expect(accepted.body.booking).toMatchObject({
      status: 'ACCEPTED',
      agreedPricePaisa: 200000,
      canChat: true,
      provider: { _id: String(provider._id) },
    });
    expect(accepted.body.booking.scheduledEnd).toBeTruthy();
    expect(accepted.body.booking.conversationId).toBeTruthy();

    const again = await acceptBooking(owner, id, 200000);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('INVALID_STATUS');

    // The customer now sees the provider's phone; the provider never does.
    const asCustomer = await request(app)
      .get(`/api/v1/services/bookings/${id}`)
      .set('Cookie', cookieFor(customer));
    expect(asCustomer.status).toBe(200);
    expect(asCustomer.body.booking.provider.phone).toBe(provider.phone);

    expect(await ServiceConversation.countDocuments({ bookingId: id })).toBe(1);
    expect(await Notification.countDocuments({ userId: customer._id, type: 'SERVICE_BOOKING_ACCEPTED' })).toBe(1);
  });

  it('lets the provider propose, supersede and the customer accept', async () => {
    const { provider, owner } = await makeProvider();
    const offering = await makeOffering(provider);
    const customer = await makeCustomer();
    const start = slot();
    const created = await createBooking(customer, provider, offering, start.start);
    const id = created.body.booking._id;

    const first = await request(app)
      .post(`/api/v1/services/provider/bookings/${id}/propose`)
      .set('Cookie', cookieFor(owner))
      .send({
        pricePaisa: 180000,
        scope: 'Two rooms and kitchen',
        scheduledStart: start.start.toISOString(),
        expiresInHours: 12,
      });
    expect(first.status).toBe(200);
    expect(first.body.booking).toMatchObject({ status: 'PROPOSED' });
    expect(first.body.booking.activeProposal).toMatchObject({ pricePaisa: 180000, status: 'ACTIVE' });

    const later = slot(4);
    const second = await request(app)
      .post(`/api/v1/services/provider/bookings/${id}/propose`)
      .set('Cookie', cookieFor(owner))
      .send({
        pricePaisa: 210000,
        scope: 'Whole house',
        scheduledStart: later.start.toISOString(),
      });
    expect(second.status).toBe(200);
    const proposals = second.body.booking.proposals;
    expect(proposals).toHaveLength(2);
    expect(proposals[0].status).toBe('SUPERSEDED');
    expect(proposals[1]).toMatchObject({ pricePaisa: 210000, status: 'ACTIVE' });

    const accepted = await request(app)
      .post(`/api/v1/services/bookings/${id}/proposals/accept`)
      .set('Cookie', cookieFor(customer));
    expect(accepted.status).toBe(200);
    expect(accepted.body.booking).toMatchObject({ status: 'ACCEPTED', agreedPricePaisa: 210000 });
    expect(accepted.body.booking.proposals[1].status).toBe('ACCEPTED');

    const stored = await ServiceBooking.findById(id);
    expect(stored.status).toBe('ACCEPTED');
    expect(stored.proposals[0].status).toBe('SUPERSEDED');
    expect(stored.proposals[1].status).toBe('ACCEPTED');
  });

  it('declines a proposal and refuses expired ones without rolling back the expiry', async () => {
    const { provider, owner } = await makeProvider();
    const offering = await makeOffering(provider);
    const customer = await makeCustomer();

    const first = await createBooking(customer, provider, offering, slot().start);
    const firstId = first.body.booking._id;
    const propose = await request(app)
      .post(`/api/v1/services/provider/bookings/${firstId}/propose`)
      .set('Cookie', cookieFor(owner))
      .send({ pricePaisa: 180000, scope: 'Two rooms', scheduledStart: slot().start.toISOString() });
    expect(propose.status).toBe(200);

    const declined = await request(app)
      .post(`/api/v1/services/bookings/${firstId}/proposals/decline`)
      .set('Cookie', cookieFor(customer));
    expect(declined.status).toBe(200);
    expect(declined.body.booking.status).toBe('DECLINED');

    const second = await createBooking(customer, provider, offering, slot(5).start);
    const secondId = second.body.booking._id;
    const proposed = await request(app)
      .post(`/api/v1/services/provider/bookings/${secondId}/propose`)
      .set('Cookie', cookieFor(owner))
      .send({ pricePaisa: 180000, scope: 'Two rooms', scheduledStart: slot(5).start.toISOString() });

    await ServiceBooking.updateOne(
      { _id: secondId },
      { $set: { 'proposals.0.expiresAt': new Date(Date.now() - 1000) } }
    );

    const expired = await request(app)
      .post(`/api/v1/services/bookings/${secondId}/proposals/accept`)
      .set('Cookie', cookieFor(customer));
    expect(expired.status).toBe(409);
    expect(expired.body.code).toBe('PROPOSAL_EXPIRED');

    // The expiry persisted (the rejection happened after the transaction).
    const stored = await ServiceBooking.findById(secondId);
    expect(stored.status).toBe('REQUESTED');
    expect(stored.proposals[0].status).toBe('EXPIRED');
  });

  it('keeps another provider out of the booking and refuses below-floor proposals', async () => {
    const { provider, owner } = await makeProvider();
    const { owner: otherOwner } = await makeProvider({ block: blockB });
    const offering = await makeOffering(provider);
    const customer = await makeCustomer();
    const created = await createBooking(customer, provider, offering, slot().start);
    const id = created.body.booking._id;

    const foreign = await acceptBooking(otherOwner, id);
    expect(foreign.status).toBe(404);

    const low = await request(app)
      .post(`/api/v1/services/provider/bookings/${id}/propose`)
      .set('Cookie', cookieFor(owner))
      .send({ pricePaisa: 100000, scope: 'Basic', scheduledStart: slot().start.toISOString() });
    expect(low.status).toBe(400);
    expect(low.body.code).toBe('PRICE_BELOW_STARTING');

    const customerCannotAccept = await request(app)
      .post(`/api/v1/services/provider/bookings/${id}/accept`)
      .set('Cookie', cookieFor(customer))
      .send({ pricePaisa: 200000 });
    expect(customerCannotAccept.status).toBe(403);
  });
});

describe('job lifecycle, cancellation and dispute (real MongoDB)', () => {
  it('runs accept -> start -> complete -> confirm and counts the completed job', async () => {
    const { provider, owner } = await makeProvider();
    const offering = await makeOffering(provider);
    const customer = await makeCustomer();
    const created = await createBooking(customer, provider, offering, slot().start);
    const id = created.body.booking._id;

    expect((await acceptBooking(owner, id)).status).toBe(200);

    const started = await request(app)
      .post(`/api/v1/services/provider/bookings/${id}/start`)
      .set('Cookie', cookieFor(owner));
    expect(started.status).toBe(200);
    expect(started.body.booking.status).toBe('IN_PROGRESS');

    const completed = await request(app)
      .post(`/api/v1/services/provider/bookings/${id}/complete`)
      .set('Cookie', cookieFor(owner))
      .send({ finalAmountPaisa: 225000, completionNote: 'Extra room cleaned' });
    expect(completed.status).toBe(200);
    expect(completed.body.booking).toMatchObject({
      status: 'COMPLETED',
      finalAmountPaisa: 225000,
      completionNote: 'Extra room cleaned',
    });
    const autoConfirmAt = new Date(completed.body.booking.autoConfirmAt);
    const days = (autoConfirmAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(2.9);
    expect(days).toBeLessThan(3.1);

    const confirmed = await request(app)
      .post(`/api/v1/services/bookings/${id}/confirm`)
      .set('Cookie', cookieFor(customer));
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.booking.status).toBe('CONFIRMED');

    const again = await request(app)
      .post(`/api/v1/services/bookings/${id}/confirm`)
      .set('Cookie', cookieFor(customer));
    expect(again.status).toBe(409);

    expect((await ServiceProvider.findById(provider._id)).completedBookings).toBe(1);
    expect(await Notification.countDocuments({ userId: owner._id, type: 'SERVICE_BOOKING_CONFIRMED' })).toBe(1);
  });

  it('marks a customer cancellation after acceptance as late and counts it monthly', async () => {
    const { provider, owner } = await makeProvider();
    const offering = await makeOffering(provider);
    const customer = await makeCustomer();

    const requested = await createBooking(customer, provider, offering, slot().start);
    const early = await request(app)
      .post(`/api/v1/services/bookings/${requested.body.booking._id}/cancel`)
      .set('Cookie', cookieFor(customer))
      .send({ reason: 'Changed my mind' });
    expect(early.status).toBe(200);
    expect(early.body.booking.cancellation).toMatchObject({ by: 'CUSTOMER', late: false });

    const second = await createBooking(customer, provider, offering, slot(4).start);
    const secondId = second.body.booking._id;
    expect((await acceptBooking(owner, secondId)).status).toBe(200);

    const late = await request(app)
      .post(`/api/v1/services/bookings/${secondId}/cancel`)
      .set('Cookie', cookieFor(customer))
      .send({ reason: 'Something came up' });
    expect(late.status).toBe(200);
    expect(late.body.booking.cancellation).toMatchObject({ by: 'CUSTOMER', late: true });

    const storedProvider = await ServiceProvider.findById(provider._id);
    expect(storedProvider.customerLateCancelCount).toBe(1);
    expect(storedProvider.customerLateCancelMonth).toBe(karachiMonthKey(new Date()));

    const third = await createBooking(customer, provider, offering, slot(5).start);
    const providerCancel = await request(app)
      .post(`/api/v1/services/provider/bookings/${third.body.booking._id}/cancel`)
      .set('Cookie', cookieFor(owner))
      .send({ reason: 'Emergency' });
    expect(providerCancel.status).toBe(200);
    expect(providerCancel.body.booking.cancellation).toMatchObject({ by: 'PROVIDER', late: false });

    const reasonRequired = await request(app)
      .post(`/api/v1/services/bookings/${late.body.booking._id}/cancel`)
      .set('Cookie', cookieFor(customer))
      .send({});
    expect(reasonRequired.status).toBe(400);
  });

  it('refuses cancellation once a job is confirmed', async () => {
    const { provider } = await makeProvider();
    const customer = await makeCustomer();
    const booking = await seedBooking(customer, provider, { status: 'CONFIRMED' });

    const res = await request(app)
      .post(`/api/v1/services/bookings/${booking._id}/cancel`)
      .set('Cookie', cookieFor(customer))
      .send({ reason: 'Too late' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVALID_STATUS');
  });

  it('routes disputes through the super admin and records the audit', async () => {
    const { provider } = await makeProvider();
    const customer = await makeCustomer();
    const booking = await seedBooking(customer, provider, { status: 'COMPLETED' });

    const dispute = await request(app)
      .post(`/api/v1/services/bookings/${booking._id}/dispute`)
      .set('Cookie', cookieFor(customer))
      .send({ reason: 'The job was left unfinished' });
    expect(dispute.status).toBe(200);
    expect(dispute.body.booking.status).toBe('DISPUTED');

    const queue = await request(app)
      .get('/api/v1/admin/service-bookings')
      .query({ disputed: 'true' })
      .set('Cookie', cookieFor(admin));
    expect(queue.status).toBe(200);
    expect(queue.body.bookings).toHaveLength(1);

    const resolved = await request(app)
      .patch(`/api/v1/admin/service-bookings/${booking._id}/dispute`)
      .set('Cookie', cookieFor(admin))
      .send({ resolution: 'CONFIRMED', note: 'Job was completed' });
    expect(resolved.status).toBe(200);
    expect(resolved.body.booking).toMatchObject({ status: 'CONFIRMED', confirmedBy: 'ADMIN' });
    expect(resolved.body.booking.dispute).toMatchObject({ resolution: 'CONFIRMED' });

    expect(await AdminAction.countDocuments({ action: 'serviceBooking.resolveDispute' })).toBe(1);
    expect((await ServiceProvider.findById(provider._id)).completedBookings).toBe(1);

    const brandAdmin = await makeBrandAdmin();
    expect(
      (
        await request(app)
          .get('/api/v1/admin/service-bookings')
          .set('Cookie', cookieFor(brandAdmin))
      ).status
    ).toBe(403);
    expect((await request(app).get('/api/v1/admin/service-bookings')).status).toBe(401);

    const stored = await ServiceBooking.findById(booking._id);
    expect(stored.status).toBe('CONFIRMED');
  });

  it('resolves a dispute in the customer favour as an admin cancellation', async () => {
    const { provider } = await makeProvider();
    const customer = await makeCustomer();
    const booking = await seedBooking(customer, provider, { status: 'COMPLETED' });

    await request(app)
      .post(`/api/v1/services/bookings/${booking._id}/dispute`)
      .set('Cookie', cookieFor(customer))
      .send({ reason: 'No show' });

    const resolved = await request(app)
      .patch(`/api/v1/admin/service-bookings/${booking._id}/dispute`)
      .set('Cookie', cookieFor(admin))
      .send({ resolution: 'CANCELLED' });
    expect(resolved.status).toBe(200);
    expect(resolved.body.booking.status).toBe('CANCELLED');
    expect(resolved.body.booking.cancellation).toMatchObject({ by: 'ADMIN', late: false });

    expect((await ServiceProvider.findById(provider._id)).completedBookings).toBe(0);
  });
});

describe('booking chat (real MongoDB)', () => {
  it('opens on acceptance, tracks unread counts and keeps strangers out', async () => {
    const { provider, owner } = await makeProvider();
    const { provider: otherProvider, owner: otherOwner } = await makeProvider({ block: blockB });
    const offering = await makeOffering(provider);
    const customer = await makeCustomer();
    const stranger = await makeCustomer();
    const created = await createBooking(customer, provider, offering, slot().start);
    const id = created.body.booking._id;

    const beforeAccept = await request(app)
      .post(`/api/v1/services/chats/${id}/messages`)
      .set('Cookie', cookieFor(customer))
      .send({ body: 'Hello?' });
    expect(beforeAccept.status).toBe(409);
    expect(beforeAccept.body.code).toBe('CHAT_NOT_OPEN');

    expect((await acceptBooking(owner, id)).status).toBe(200);

    const sent = await request(app)
      .post(`/api/v1/services/chats/${id}/messages`)
      .set('Cookie', cookieFor(customer))
      .send({ body: 'Please bring your own supplies.' });
    expect(sent.status).toBe(201);
    expect(sent.body.message).toMatchObject({ body: 'Please bring your own supplies.', mine: true });

    const providerUnread = await request(app)
      .get('/api/v1/services/chats/unread')
      .set('Cookie', cookieFor(owner));
    expect(providerUnread.body.unread).toBe(1);

    const providerMessages = await request(app)
      .get(`/api/v1/services/chats/${id}/messages`)
      .set('Cookie', cookieFor(owner));
    expect(providerMessages.status).toBe(200);
    expect(providerMessages.body.messages.map((m) => m.senderRole)).toEqual(['SYSTEM', 'CUSTOMER']);

    expect(
      (
        await request(app)
          .post(`/api/v1/services/chats/${id}/read`)
          .set('Cookie', cookieFor(owner))
      ).status
    ).toBe(200);
    expect(
      (
        await request(app)
          .get('/api/v1/services/chats/unread')
          .set('Cookie', cookieFor(owner))
      ).body.unread
    ).toBe(0);

    const list = await request(app)
      .get('/api/v1/services/chats')
      .set('Cookie', cookieFor(customer));
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ bookingId: id, unread: 0 });

    for (const actor of [stranger, otherOwner]) {
      const res = await request(app)
        .get(`/api/v1/services/chats/${id}/messages`)
        .set('Cookie', cookieFor(actor));
      expect(res.status).toBe(404);
    }

    expect(otherProvider._id).toBeTruthy();
    expect(await ServiceMessage.countDocuments({})).toBe(2);
  });
});

describe('service reviews and ranking (real MongoDB)', () => {
  it('allows one review per confirmed booking, one provider reply and admin moderation', async () => {
    const { provider, owner } = await makeProvider();
    const other = await makeProvider({ block: blockB });
    const customer = await makeCustomer();
    const booking = await seedBooking(customer, provider, { status: 'CONFIRMED' });

    const earlyBooking = await seedBooking(customer, provider, { status: 'COMPLETED' });
    const early = await request(app)
      .post(`/api/v1/services/bookings/${earlyBooking._id}/review`)
      .set('Cookie', cookieFor(customer))
      .send({ rating: 5, comment: 'Great' });
    expect(early.status).toBe(409);
    expect(early.body.code).toBe('BOOKING_NOT_CONFIRMED');

    const badRating = await request(app)
      .post(`/api/v1/services/bookings/${booking._id}/review`)
      .set('Cookie', cookieFor(customer))
      .send({ rating: 6 });
    expect(badRating.status).toBe(400);

    const created = await request(app)
      .post(`/api/v1/services/bookings/${booking._id}/review`)
      .set('Cookie', cookieFor(customer))
      .send({ rating: 5, comment: 'Spotless work.' });
    expect(created.status).toBe(201);
    expect(created.body.review).toMatchObject({ rating: 5, comment: 'Spotless work.' });
    const reviewId = created.body.review._id;

    const duplicate = await request(app)
      .post(`/api/v1/services/bookings/${booking._id}/review`)
      .set('Cookie', cookieFor(customer))
      .send({ rating: 4 });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('ALREADY_REVIEWED');

    expect(await Notification.countDocuments({ userId: owner._id, type: 'NEW_REVIEW' })).toBe(1);

    const foreignReply = await request(app)
      .post(`/api/v1/services/provider/reviews/${reviewId}/reply`)
      .set('Cookie', cookieFor(other.owner))
      .send({ body: 'Thanks!' });
    expect(foreignReply.status).toBe(404);

    const reply = await request(app)
      .post(`/api/v1/services/provider/reviews/${reviewId}/reply`)
      .set('Cookie', cookieFor(owner))
      .send({ body: 'Thank you for the kind words.' });
    expect(reply.status).toBe(200);
    expect(reply.body.review.providerReply).toMatchObject({ body: 'Thank you for the kind words.' });

    const secondReply = await request(app)
      .post(`/api/v1/services/provider/reviews/${reviewId}/reply`)
      .set('Cookie', cookieFor(owner))
      .send({ body: 'Again' });
    expect(secondReply.status).toBe(409);
    expect(secondReply.body.code).toBe('ALREADY_REPLIED');

    const publicPage = await request(app).get(`/api/v1/services/providers/${provider.slug}`);
    expect(publicPage.status).toBe(200);
    expect(publicPage.body.provider.reviews).toHaveLength(1);
    expect(publicPage.body.provider.reviews[0]).toMatchObject({ rating: 5, serviceTitle: booking.offering.title });
    expect(JSON.stringify(publicPage.body)).not.toContain('+923001234567');

    const hidden = await request(app)
      .patch(`/api/v1/admin/service-reviews/${reviewId}`)
      .set('Cookie', cookieFor(admin))
      .send({ isApproved: false });
    expect(hidden.status).toBe(200);
    expect(hidden.body.review.isApproved).toBe(false);

    const afterHide = await request(app).get(`/api/v1/services/providers/${provider.slug}`);
    expect(afterHide.body.provider.reviews).toHaveLength(0);

    const providerList = await request(app)
      .get('/api/v1/services/provider/reviews')
      .set('Cookie', cookieFor(owner));
    expect(providerList.body.reviews).toHaveLength(0);
    expect(providerList.body.summary.count).toBe(0);

    const brandAdmin = await makeBrandAdmin();
    expect(
      (
        await request(app)
          .get('/api/v1/admin/service-reviews')
          .set('Cookie', cookieFor(brandAdmin))
      ).status
    ).toBe(403);
  });

  it('updates the provider rating and ranking inputs from approved reviews', async () => {
    const { provider } = await makeProvider();
    const customer = await makeCustomer();
    const first = await seedBooking(customer, provider, { status: 'CONFIRMED' });
    const second = await seedBooking(customer, provider, { status: 'CONFIRMED' });

    await request(app)
      .post(`/api/v1/services/bookings/${first._id}/review`)
      .set('Cookie', cookieFor(customer))
      .send({ rating: 4 });
    await request(app)
      .post(`/api/v1/services/bookings/${second._id}/review`)
      .set('Cookie', cookieFor(customer))
      .send({ rating: 2 });

    const stored = await ServiceProvider.findById(provider._id);
    expect(stored.ratingCount).toBe(2);
    expect(stored.ratingAvg).toBe(3);
    expect(stored.rankingUpdatedAt).toBeTruthy();
    expect(typeof stored.rankScore).toBe('number');
  });
});

describe('tenant scoping and housekeeping (real MongoDB)', () => {
  it('never lets one customer or provider read another tenant booking', async () => {
    const { provider, owner } = await makeProvider();
    const { owner: otherOwner, provider: otherProvider } = await makeProvider({ block: blockB });
    const offering = await makeOffering(provider);
    const customer = await makeCustomer();
    const otherCustomer = await makeCustomer();
    const created = await createBooking(customer, provider, offering, slot().start);
    const id = created.body.booking._id;
    await createBooking(otherCustomer, otherProvider, offering, slot(4).start);

    expect(
      (
        await request(app)
          .get(`/api/v1/services/bookings/${id}`)
          .set('Cookie', cookieFor(otherCustomer))
      ).status
    ).toBe(404);

    expect(
      (
        await request(app)
          .get(`/api/v1/services/provider/bookings/${id}`)
          .set('Cookie', cookieFor(otherOwner))
      ).status
    ).toBe(404);

    const mine = await request(app)
      .get('/api/v1/services/bookings')
      .set('Cookie', cookieFor(customer));
    expect(mine.status).toBe(200);
    expect(mine.body.bookings).toHaveLength(1);
    expect(mine.body.bookings[0]._id).toBe(id);

    const providerInbox = await request(app)
      .get('/api/v1/services/provider/bookings')
      .set('Cookie', cookieFor(owner));
    expect(providerInbox.body.bookings).toHaveLength(1);
    expect(providerInbox.body.bookings[0]._id).toBe(id);
  });

  it('expires stale proposals and auto-confirms completed jobs', async () => {
    const { provider } = await makeProvider();
    const customer = await makeCustomer();
    const now = new Date();
    const proposed = await seedBooking(customer, provider, {
      status: 'PROPOSED',
      over: {
        proposals: [
          {
            pricePaisa: 180000,
            scope: 'Two rooms',
            scheduledStart: slot().start,
            scheduledEnd: new Date(slot().start.getTime() + 60 * 60 * 1000),
            expiresAt: new Date(now.getTime() - 60 * 1000),
            status: 'ACTIVE',
          },
        ],
      },
    });

    expect(await expireProposals({ now })).toBe(1);
    const afterExpiry = await ServiceBooking.findById(proposed._id);
    expect(afterExpiry.status).toBe('REQUESTED');
    expect(afterExpiry.proposals[0].status).toBe('EXPIRED');

    const completed = await seedBooking(customer, provider, {
      status: 'COMPLETED',
      over: { autoConfirmAt: new Date(now.getTime() - 60 * 1000) },
    });

    expect(await autoConfirmCompleted({ now })).toBe(1);
    const afterConfirm = await ServiceBooking.findById(completed._id);
    expect(afterConfirm.status).toBe('CONFIRMED');
    expect(afterConfirm.confirmedBy).toBe('AUTO');
    expect((await ServiceProvider.findById(provider._id)).completedBookings).toBe(1);
  });

  it('refuses customer booking fields from a provider session and vice versa', async () => {
    const { provider, owner } = await makeProvider();
    const customer = await makeCustomer();
    const offering = await makeOffering(provider);
    const booking = await seedBooking(customer, provider, { status: 'COMPLETED' });

    expect(
      (
        await request(app)
          .post(`/api/v1/services/bookings/${booking._id}/confirm`)
          .set('Cookie', cookieFor(owner))
      ).status
    ).toBe(403);

    expect(
      (
        await request(app)
          .get('/api/v1/services/provider/bookings')
          .set('Cookie', cookieFor(customer))
      ).status
    ).toBe(403);

    expect(offering._id).toBeTruthy();
  });
});
