const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');
jest.mock('../src/models/brand.model');
jest.mock('../src/models/product.model', () => {
  const actual = jest.requireActual('../src/models/product.model');
  return { find: jest.fn(), findOne: jest.fn(), findById: jest.fn(), create: jest.fn(), countDocuments: jest.fn(), STATUSES: actual.STATUSES };
});
jest.mock('../src/models/conversation.model', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  updateOne: jest.fn(),
  countDocuments: jest.fn(),
  aggregate: jest.fn(),
  SIDES: ['CUSTOMER', 'BRAND'],
}));
jest.mock('../src/models/message.model', () => ({ create: jest.fn(), find: jest.fn(), MAX_BODY_LENGTH: 1000 }));
jest.mock('../src/sockets', () => ({
  initSockets: jest.fn(),
  emitToUser: jest.fn(),
  emitChat: jest.fn(),
  closeSockets: jest.fn(),
}));

const User = require('../src/models/user.model');
const Employee = require('../src/models/employee.model');
const Brand = require('../src/models/brand.model');
const Product = require('../src/models/product.model');
const Conversation = require('../src/models/conversation.model');
const Message = require('../src/models/message.model');
const { emitChat } = require('../src/sockets');
const app = require('../src/app');
const { ROLES } = require('../src/config/roles');
const { PERMISSIONS } = require('../src/config/permissions');
const { getAuthCookie } = require('./helpers/testAuth');

const oid = () => new mongoose.Types.ObjectId();
const brandId = oid();

function login(user) {
  User.findById.mockResolvedValue(user);
  return ['Cookie', getAuthCookie(user)];
}
const customer = (extra = {}) => ({ _id: oid(), name: 'Sana Iqbal', role: ROLES.CUSTOMER, isActive: true, ...extra });
const brandAdmin = (extra = {}) => ({ _id: oid(), name: 'Ayesha Rana', role: ROLES.BRAND_ADMIN, brandId, isActive: true, ...extra });
function employee(permissions, extra = {}) {
  const user = { _id: oid(), name: 'Usman Tariq', role: ROLES.BRAND_EMPLOYEE, brandId, isActive: true, ...extra };
  Employee.findOne.mockResolvedValue({ userId: user._id, brandId, isActive: true, permissions });
  return user;
}

const product = (extra = {}) => ({ _id: oid(), brandId, name: 'Lawn Suit', price: 4500, images: ['a.jpg'], isActive: true, status: 'ACTIVE', ...extra });
const conversation = (extra = {}) => ({
  _id: oid(), customerId: oid(), brandId, lastMessageAt: new Date(), lastMessagePreview: 'hi', lastSenderRole: 'CUSTOMER',
  customerUnread: 0, brandUnread: 1, ...extra,
});
const message = (conv, extra = {}) => ({
  _id: oid(), conversationId: conv._id, senderId: oid(), senderRole: 'CUSTOMER', body: 'Is this in stock?', createdAt: new Date(), ...extra,
});

// Message.find(...).sort().limit() resolves to the given list.
const messagesAre = (list) => Message.find.mockReturnValue({ sort: () => ({ limit: () => Promise.resolve(list) }) });
const productsAre = (list) => Product.find.mockResolvedValue(list);

beforeEach(() => {
  jest.resetAllMocks();
  Brand.findById.mockResolvedValue({ _id: brandId, status: 'ACTIVE' });
  Product.find.mockResolvedValue([]);
  User.find.mockResolvedValue([]);
  Employee.find.mockResolvedValue([]);
  Message.create.mockImplementation(async (data) => ({ _id: oid(), createdAt: new Date(), ...data }));
  Conversation.updateOne.mockResolvedValue({});
});

describe('who may use chat at all', () => {
  it('requires authentication on every route', async () => {
    const id = oid();
    const calls = [
      request(app).get('/api/v1/chats'),
      request(app).get('/api/v1/chats/unread-count'),
      request(app).get(`/api/v1/chats/product/${id}`),
      request(app).post('/api/v1/chats/start').send({}),
      request(app).get(`/api/v1/chats/${id}/messages`),
      request(app).post(`/api/v1/chats/${id}/messages`).send({}),
      request(app).post(`/api/v1/chats/${id}/read`),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(401);
  });

  it('keeps the platform super admin out of private conversations', async () => {
    const h = login({ _id: oid(), role: ROLES.SUPER_ADMIN, isActive: true });
    expect((await request(app).get('/api/v1/chats').set(...h)).status).toBe(403);
    expect(Conversation.find).not.toHaveBeenCalled();
  });

  it('lets a team member read only with messages.view, and reply only with messages.manage', async () => {
    const noPerm = employee([PERMISSIONS.ORDERS_VIEW]);
    expect((await request(app).get('/api/v1/chats/unread-count').set(...login(noPerm))).status).toBe(403);

    const viewer = employee([PERMISSIONS.MESSAGES_VIEW]);
    const conv = conversation();
    Conversation.aggregate.mockResolvedValue([{ total: 2 }]);
    expect((await request(app).get('/api/v1/chats/unread-count').set(...login(viewer))).body.unread).toBe(2);

    Conversation.findOne.mockResolvedValue(conv);
    const reply = await request(app).post(`/api/v1/chats/${conv._id}/messages`).set(...login(viewer)).send({ body: 'Hello' });
    expect(reply.status).toBe(403);
    expect(Message.create).not.toHaveBeenCalled();

    const manager = employee([PERMISSIONS.MESSAGES_MANAGE]);
    const ok = await request(app).post(`/api/v1/chats/${conv._id}/messages`).set(...login(manager)).send({ body: 'Hello' });
    expect(ok.status).toBe(201);
  });

  it('refuses an inactive team member', async () => {
    const user = employee([PERMISSIONS.MESSAGES_MANAGE]);
    Employee.findOne.mockResolvedValue({ userId: user._id, brandId, isActive: false, permissions: [PERMISSIONS.MESSAGES_MANAGE] });
    expect((await request(app).get('/api/v1/chats/unread-count').set(...login(user))).status).toBe(403);
  });

  it('only customers can start a chat or use the product context', async () => {
    const admin = brandAdmin();
    const h = login(admin);
    expect((await request(app).post('/api/v1/chats/start').set(...h).send({ productId: oid().toString(), body: 'Hi' })).status).toBe(403);
    expect((await request(app).get(`/api/v1/chats/product/${oid()}`).set(...h)).status).toBe(403);
    expect(Message.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/chats/start', () => {
  it('opens a thread with the product\'s own brand, saves the message and counts it unread for the brand', async () => {
    const me = customer();
    const p = product();
    Product.findOne.mockResolvedValue(p);
    Conversation.findOne.mockResolvedValue(null);
    Conversation.create.mockImplementation(async (data) => ({ _id: oid(), ...data }));
    productsAre([p]);

    const res = await request(app).post('/api/v1/chats/start').set(...login(me)).send({ productId: p._id.toString(), body: '  Is this in stock?  ' });

    expect(res.status).toBe(201);
    expect(Conversation.create).toHaveBeenCalledWith(expect.objectContaining({ customerId: me._id, brandId }));
    expect(Message.create).toHaveBeenCalledWith(
      expect.objectContaining({ senderId: me._id, senderRole: 'CUSTOMER', body: 'Is this in stock?', productId: p._id.toString() })
    );
    expect(Conversation.updateOne.mock.calls[0][1].$inc).toEqual({ brandUnread: 1 });
    expect(res.body.message).toMatchObject({ mine: true, body: 'Is this in stock?', product: { name: 'Lawn Suit' } });
    // the customer view never carries staff names
    expect(res.body.message.sentBy).toBeUndefined();
  });

  it('continues the existing thread instead of creating a second one', async () => {
    const me = customer();
    const p = product();
    const conv = conversation({ customerId: me._id });
    Product.findOne.mockResolvedValue(p);
    Conversation.findOne.mockResolvedValue(conv);

    const res = await request(app).post('/api/v1/chats/start').set(...login(me)).send({ productId: p._id.toString(), body: 'Another question' });

    expect(res.status).toBe(201);
    expect(Conversation.create).not.toHaveBeenCalled();
    expect(res.body.conversationId).toBe(String(conv._id));
  });

  it('survives two simultaneous first messages (duplicate key falls back to the winner)', async () => {
    const me = customer();
    const p = product();
    const winner = conversation({ customerId: me._id });
    Product.findOne.mockResolvedValue(p);
    Conversation.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
    Conversation.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));

    const res = await request(app).post('/api/v1/chats/start').set(...login(me)).send({ productId: p._id.toString(), body: 'Hi' });

    expect(res.status).toBe(201);
    expect(res.body.conversationId).toBe(String(winner._id));
  });

  it('pushes the message live to the customer and to the brand team who may read chats', async () => {
    const me = customer();
    const p = product();
    const owner = { _id: oid() };
    const teammate = { userId: oid() };
    Product.findOne.mockResolvedValue(p);
    Conversation.findOne.mockResolvedValue(conversation({ customerId: me._id }));
    productsAre([p]);
    User.find.mockResolvedValue([owner]);
    Employee.find.mockResolvedValue([teammate]);

    await request(app).post('/api/v1/chats/start').set(...login(me)).send({ productId: p._id.toString(), body: 'Hi' });

    const targets = emitChat.mock.calls.map(([userId]) => String(userId));
    expect(targets).toEqual(expect.arrayContaining([String(me._id), String(owner._id), String(teammate.userId)]));
    // team members are chosen by permission, fresh from the database
    expect(Employee.find.mock.calls[0][0]).toMatchObject({
      brandId, isActive: true, permissions: { $in: [PERMISSIONS.MESSAGES_VIEW, PERMISSIONS.MESSAGES_MANAGE] },
    });
    const brandPush = emitChat.mock.calls.find(([userId]) => String(userId) === String(owner._id))[1];
    expect(brandPush.message.mine).toBe(false);
  });

  it('does not fail the request when live delivery breaks', async () => {
    const me = customer();
    const p = product();
    Product.findOne.mockResolvedValue(p);
    Conversation.findOne.mockResolvedValue(conversation({ customerId: me._id }));
    emitChat.mockImplementation(() => {
      throw new Error('socket down');
    });

    const res = await request(app).post('/api/v1/chats/start').set(...login(me)).send({ productId: p._id.toString(), body: 'Hi' });

    expect(res.status).toBe(201);
  });

  it('404s for a missing or hidden product and 409s when the brand is not ACTIVE', async () => {
    const h = login(customer());
    Product.findOne.mockResolvedValue(null);
    expect((await request(app).post('/api/v1/chats/start').set(...h).send({ productId: oid().toString(), body: 'Hi' })).status).toBe(404);
    // the lookup only ever matches visible products
    expect(Product.findOne.mock.calls[0][0]).toMatchObject({ isActive: true, status: 'ACTIVE' });

    Product.findOne.mockResolvedValue(product());
    Brand.findById.mockResolvedValue({ _id: brandId, status: 'SUSPENDED' });
    const res = await request(app).post('/api/v1/chats/start').set(...h).send({ productId: oid().toString(), body: 'Hi' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/not taking messages/);
    expect(Message.create).not.toHaveBeenCalled();
  });

  it('rejects empty, oversized and malformed input, and any attempt to set fields the server owns', async () => {
    const h = login(customer());
    const send = (body) => request(app).post('/api/v1/chats/start').set(...h).send(body);
    const pid = oid().toString();

    expect((await send({ productId: pid, body: '   ' })).status).toBe(400);
    expect((await send({ productId: pid, body: 'x'.repeat(1001) })).status).toBe(400);
    expect((await send({ productId: 'nope', body: 'Hi' })).status).toBe(400);
    expect((await send({ body: 'Hi' })).status).toBe(400);
    expect((await send({ productId: pid, body: 'Hi', brandId: oid().toString() })).status).toBe(400);
    expect((await send({ productId: pid, body: 'Hi', senderId: oid().toString(), senderRole: 'BRAND' })).status).toBe(400);
    expect((await send({ productId: pid, body: { $gt: '' } })).status).toBe(400);
    expect(Message.create).not.toHaveBeenCalled();
    expect(Conversation.create).not.toHaveBeenCalled();
  });

  it('strips control and direction-override characters, and stores markup as plain text', async () => {
    const me = customer();
    const p = product();
    Product.findOne.mockResolvedValue(p);
    Conversation.findOne.mockResolvedValue(conversation({ customerId: me._id }));
    const h = login(me);

    await request(app).post('/api/v1/chats/start').set(...h).send({ productId: p._id.toString(), body: 'Hi\u0000 th\u202Eere\u0007\n\n\n\nbye' });
    expect(Message.create.mock.calls[0][0].body).toBe('Hi there\n\nbye');

    // Markup is not interpreted or removed: the client shows it as text.
    const markup = '<img src=x onerror=alert(1)>';
    await request(app).post('/api/v1/chats/start').set(...h).send({ productId: p._id.toString(), body: markup });
    expect(Message.create.mock.calls[1][0].body).toBe(markup);

    // Nothing left after cleaning is the same as an empty message.
    Message.create.mockClear();
    const res = await request(app).post('/api/v1/chats/start').set(...h).send({ productId: p._id.toString(), body: '\u0000\u0007' });
    expect(res.status).toBe(400);
    expect(Message.create).not.toHaveBeenCalled();
  });
});

describe('reading and sending inside a conversation', () => {
  it("a customer can only open their own conversations", async () => {
    const me = customer();
    Conversation.findOne.mockResolvedValue(null); // someone else's id matches nothing for this customer
    const id = oid();

    const res = await request(app).get(`/api/v1/chats/${id}/messages`).set(...login(me));

    expect(res.status).toBe(404);
    expect(Conversation.findOne).toHaveBeenCalledWith({ _id: id.toString(), customerId: me._id });
    expect(Message.find).not.toHaveBeenCalled();
  });

  it("brand staff can only open their own brand's conversations, whoever asks", async () => {
    const admin = brandAdmin();
    Conversation.findOne.mockResolvedValue(null);
    const id = oid();

    expect((await request(app).get(`/api/v1/chats/${id}/messages`).set(...login(admin))).status).toBe(404);
    expect(Conversation.findOne).toHaveBeenCalledWith({ _id: id.toString(), brandId });

    expect((await request(app).post(`/api/v1/chats/${id}/read`).set(...login(admin))).status).toBe(404);
    expect((await request(app).post(`/api/v1/chats/${id}/messages`).set(...login(admin)).send({ body: 'x' })).status).toBe(404);
    expect(Message.create).not.toHaveBeenCalled();
  });

  it('pages messages newest-first by cursor and returns them oldest-first', async () => {
    const me = customer();
    const conv = conversation({ customerId: me._id });
    Conversation.findOne.mockResolvedValue(conv);
    const found = [3, 2, 1].map((n) => message(conv, { body: `m${n}` })); // newest first from the DB
    messagesAre(found);
    const cursor = oid().toString();

    const res = await request(app).get(`/api/v1/chats/${conv._id}/messages?before=${cursor}&limit=2`).set(...login(me));

    expect(res.status).toBe(200);
    expect(res.body.messages.map((m) => m.body)).toEqual(['m2', 'm3']); // 3 found with limit 2 -> hasMore
    expect(res.body.hasMore).toBe(true);
    expect(Message.find).toHaveBeenCalledWith({ conversationId: conv._id, _id: { $lt: cursor } });
  });

  it('validates the paging query', async () => {
    const me = customer();
    const h = login(me);
    const id = oid();
    expect((await request(app).get(`/api/v1/chats/${id}/messages?limit=500`).set(...h)).status).toBe(400);
    expect((await request(app).get(`/api/v1/chats/${id}/messages?before=bad`).set(...h)).status).toBe(400);
    expect((await request(app).get('/api/v1/chats/not-an-id/messages').set(...h)).status).toBe(400);
  });

  it('shows team member names to the brand only, never to the customer', async () => {
    const conv = conversation();
    const staffId = oid();
    const staffMsg = message(conv, { senderRole: 'BRAND', senderId: staffId, body: 'Yes, in stock' });
    Conversation.findOne.mockResolvedValue(conv);
    messagesAre([staffMsg]);
    User.find.mockResolvedValue([{ _id: staffId, name: 'Usman Tariq' }]);

    const brandView = await request(app).get(`/api/v1/chats/${conv._id}/messages`).set(...login(brandAdmin()));
    expect(brandView.body.messages[0]).toMatchObject({ sentBy: 'Usman Tariq', mine: true });

    const customerView = await request(app).get(`/api/v1/chats/${conv._id}/messages`).set(...login(customer({ _id: conv.customerId })));
    expect(customerView.body.messages[0].sentBy).toBeUndefined();
    expect(customerView.body.messages[0].mine).toBe(false);
    expect(JSON.stringify(customerView.body)).not.toContain(String(staffId));
  });

  it('a reply raises the customer\'s unread count; a customer message raises the brand\'s', async () => {
    const conv = conversation();
    Conversation.findOne.mockResolvedValue(conv);

    await request(app).post(`/api/v1/chats/${conv._id}/messages`).set(...login(brandAdmin())).send({ body: 'We have it' });
    expect(Conversation.updateOne.mock.calls[0][1].$inc).toEqual({ customerUnread: 1 });
    expect(Message.create.mock.calls[0][0]).toMatchObject({ senderRole: 'BRAND' });

    await request(app).post(`/api/v1/chats/${conv._id}/messages`).set(...login(customer({ _id: conv.customerId }))).send({ body: 'Great' });
    expect(Conversation.updateOne.mock.calls[1][1].$inc).toEqual({ brandUnread: 1 });
    expect(Message.create.mock.calls[1][0]).toMatchObject({ senderRole: 'CUSTOMER' });
  });

  it('only attaches an active product of the same brand', async () => {
    const me = customer();
    const conv = conversation({ customerId: me._id });
    Conversation.findOne.mockResolvedValue(conv);
    Product.findOne.mockResolvedValue(null); // other brand's or hidden product matches nothing
    const pid = oid().toString();

    const res = await request(app).post(`/api/v1/chats/${conv._id}/messages`).set(...login(me)).send({ body: 'This one?', productId: pid });

    expect(res.status).toBe(400);
    expect(Product.findOne).toHaveBeenCalledWith({ _id: pid, brandId, isActive: true, status: 'ACTIVE' });
    expect(Message.create).not.toHaveBeenCalled();
  });

  it('stops messages once the brand is no longer ACTIVE, but history stays readable', async () => {
    const me = customer();
    const conv = conversation({ customerId: me._id });
    Conversation.findOne.mockResolvedValue(conv);
    Brand.findById.mockResolvedValue({ _id: brandId, status: 'TERMINATED' });

    expect((await request(app).post(`/api/v1/chats/${conv._id}/messages`).set(...login(me)).send({ body: 'Hello?' })).status).toBe(409);
    expect(Message.create).not.toHaveBeenCalled();

    messagesAre([message(conv)]);
    expect((await request(app).get(`/api/v1/chats/${conv._id}/messages`).set(...login(me))).status).toBe(200);
  });

  it('marks read only the caller\'s own side', async () => {
    const me = customer();
    const conv = conversation({ customerId: me._id });
    Conversation.findOne.mockResolvedValue(conv);

    await request(app).post(`/api/v1/chats/${conv._id}/read`).set(...login(me));
    expect(Conversation.updateOne).toHaveBeenLastCalledWith({ _id: conv._id }, { $set: { customerUnread: 0 } });

    await request(app).post(`/api/v1/chats/${conv._id}/read`).set(...login(brandAdmin()));
    expect(Conversation.updateOne).toHaveBeenLastCalledWith({ _id: conv._id }, { $set: { brandUnread: 0 } });
  });
});

describe('the inbox', () => {
  const listOf = (items) => Conversation.find.mockReturnValue({ sort: () => ({ skip: () => ({ limit: () => Promise.resolve(items) }) }) });

  it('lists a customer\'s own conversations with the brand name and no private brand data', async () => {
    const me = customer();
    const conv = conversation({ customerId: me._id, customerUnread: 2 });
    listOf([conv]);
    Conversation.countDocuments.mockResolvedValue(1);
    Brand.find.mockResolvedValue([{ _id: brandId, name: 'Loom & Co.', logo: 'l.png', status: 'ACTIVE', contact: { email: 'secret@x' } }]);

    const res = await request(app).get('/api/v1/chats').set(...login(me));

    expect(res.status).toBe(200);
    expect(Conversation.find.mock.calls[0][0]).toEqual({ customerId: me._id });
    expect(res.body.conversations[0]).toMatchObject({ with: { name: 'Loom & Co.' }, unread: 2, canSend: true });
    expect(JSON.stringify(res.body)).not.toContain('secret@x');
    expect(res.body.pagination).toMatchObject({ page: 1, total: 1 });
  });

  it("lists a brand's conversations with only the customer's name and avatar", async () => {
    const admin = brandAdmin();
    const conv = conversation({ brandUnread: 3 });
    listOf([conv]);
    Conversation.countDocuments.mockResolvedValue(1);
    User.find.mockResolvedValue([{ _id: conv.customerId, name: 'Sana Iqbal', avatar: 'a.png', email: 'sana@x.com', phone: '0300' }]);

    const res = await request(app).get('/api/v1/chats').set(...login(admin));

    expect(Conversation.find.mock.calls[0][0]).toEqual({ brandId });
    expect(res.body.conversations[0]).toMatchObject({ with: { name: 'Sana Iqbal', image: 'a.png' }, unread: 3 });
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('sana@x.com');
    expect(text).not.toContain('0300');
    // only name and avatar were requested from the user collection
    expect(User.find.mock.calls[0][1]).toBe('name avatar');
  });

  it('adds up unread messages for the badge and validates paging', async () => {
    const me = customer();
    Conversation.aggregate.mockResolvedValue([]);
    expect((await request(app).get('/api/v1/chats/unread-count').set(...login(me))).body.unread).toBe(0);
    const match = Conversation.aggregate.mock.calls[0][0][0].$match;
    expect(String(match.customerId)).toBe(String(me._id));

    expect((await request(app).get('/api/v1/chats?limit=99').set(...login(me))).status).toBe(400);
  });
});

describe('GET /api/v1/chats/product/:productId (the chat page from a product page)', () => {
  it('returns the product, the brand and any existing thread', async () => {
    const me = customer();
    const p = product();
    const conv = conversation({ customerId: me._id });
    Product.findOne.mockResolvedValue(p);
    Brand.findOne.mockResolvedValue({ _id: brandId, name: 'Loom & Co.', logo: 'l.png' });
    Conversation.findOne.mockResolvedValue(conv);

    const res = await request(app).get(`/api/v1/chats/product/${p._id}`).set(...login(me));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ product: { name: 'Lawn Suit', available: true }, brand: { name: 'Loom & Co.' }, conversationId: String(conv._id) });
    expect(Conversation.findOne.mock.calls[0][0]).toEqual({ customerId: me._id, brandId });
  });

  it('hides products and brands that are not public', async () => {
    const h = login(customer());
    Product.findOne.mockResolvedValue(null);
    expect((await request(app).get(`/api/v1/chats/product/${oid()}`).set(...h)).status).toBe(404);

    Product.findOne.mockResolvedValue(product());
    Brand.findOne.mockResolvedValue(null); // brand not ACTIVE
    expect((await request(app).get(`/api/v1/chats/product/${oid()}`).set(...h)).status).toBe(404);
    expect((await request(app).get('/api/v1/chats/product/bad-id').set(...h)).status).toBe(400);
  });

  it('returns no conversation id when the customer has not written yet', async () => {
    const me = customer();
    Product.findOne.mockResolvedValue(product());
    Brand.findOne.mockResolvedValue({ _id: brandId, name: 'Loom & Co.' });
    Conversation.findOne.mockResolvedValue(null);

    const res = await request(app).get(`/api/v1/chats/product/${oid()}`).set(...login(me));

    expect(res.body.conversationId).toBeNull();
  });
});
