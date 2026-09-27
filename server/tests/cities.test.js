const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/city.model');

const User = require('../src/models/user.model');
const City = require('../src/models/city.model');
const app = require('../src/app');
const { ROLES } = require('../src/config/roles');
const { getAuthCookie } = require('./helpers/testAuth');

function makeFakeUser(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    role: ROLES.CUSTOMER,
    brandId: undefined,
    isActive: true,
    ...overrides,
  };
}

function asUser(user) {
  User.findById.mockResolvedValue(user);
  return [`Cookie`, getAuthCookie(user)];
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/v1/cities (public)', () => {
  it('lists cities with no authentication required', async () => {
    const sort = jest.fn().mockResolvedValue([{ name: 'Lahore' }, { name: 'Karachi' }]);
    City.find.mockReturnValue({ sort });

    const res = await request(app).get('/api/v1/cities');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.cities).toHaveLength(2);
  });

  it('filters by isActive=true', async () => {
    const sort = jest.fn().mockResolvedValue([]);
    City.find.mockReturnValue({ sort });

    const res = await request(app).get('/api/v1/cities?isActive=true');
    expect(res.status).toBe(200);
    expect(City.find).toHaveBeenCalledWith({ isActive: true });
  });
});

describe('GET /api/v1/cities/:id (public)', () => {
  it('returns a city with no authentication required', async () => {
    const id = new mongoose.Types.ObjectId().toString();
    City.findById.mockResolvedValue({ _id: id, name: 'Lahore' });

    const res = await request(app).get(`/api/v1/cities/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.city.name).toBe('Lahore');
  });

  it('rejects an invalid ObjectId with 400', async () => {
    const res = await request(app).get('/api/v1/cities/not-a-valid-id');
    expect(res.status).toBe(400);
    expect(City.findById).not.toHaveBeenCalled();
  });

  it('returns 404 when the city does not exist', async () => {
    const id = new mongoose.Types.ObjectId().toString();
    City.findById.mockResolvedValue(null);

    const res = await request(app).get(`/api/v1/cities/${id}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/cities (Super Admin only)', () => {
  it('creates a city as SUPER_ADMIN', async () => {
    const superAdmin = makeFakeUser({ role: ROLES.SUPER_ADMIN });
    City.findOne.mockResolvedValue(null);
    City.create.mockResolvedValue({ name: 'Lahore', slug: 'lahore' });

    const res = await request(app)
      .post('/api/v1/cities')
      .set(...asUser(superAdmin))
      .send({ name: 'Lahore', state: 'Punjab', country: 'Pakistan' });

    expect(res.status).toBe(201);
    expect(res.body.city.slug).toBe('lahore');
  });

  it('denies a non-Super-Admin (BRAND_ADMIN) with 403', async () => {
    const brandAdmin = makeFakeUser({
      role: ROLES.BRAND_ADMIN,
      brandId: new mongoose.Types.ObjectId(),
    });

    const res = await request(app)
      .post('/api/v1/cities')
      .set(...asUser(brandAdmin))
      .send({ name: 'Lahore' });

    expect(res.status).toBe(403);
    expect(City.create).not.toHaveBeenCalled();
  });

  it('denies CUSTOMER with 403', async () => {
    const customer = makeFakeUser({ role: ROLES.CUSTOMER });

    const res = await request(app)
      .post('/api/v1/cities')
      .set(...asUser(customer))
      .send({ name: 'Lahore' });

    expect(res.status).toBe(403);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).post('/api/v1/cities').send({ name: 'Lahore' });
    expect(res.status).toBe(401);
  });

  it('rejects invalid input (missing name) with 400', async () => {
    const superAdmin = makeFakeUser({ role: ROLES.SUPER_ADMIN });

    const res = await request(app)
      .post('/api/v1/cities')
      .set(...asUser(superAdmin))
      .send({ state: 'Punjab' });

    expect(res.status).toBe(400);
    expect(City.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate city slug with 409', async () => {
    const superAdmin = makeFakeUser({ role: ROLES.SUPER_ADMIN });
    City.findOne.mockResolvedValue({ slug: 'lahore' });

    const res = await request(app)
      .post('/api/v1/cities')
      .set(...asUser(superAdmin))
      .send({ name: 'Lahore' });

    expect(res.status).toBe(409);
    expect(City.create).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/cities/:id (Super Admin only)', () => {
  it('updates a city as SUPER_ADMIN', async () => {
    const superAdmin = makeFakeUser({ role: ROLES.SUPER_ADMIN });
    const id = new mongoose.Types.ObjectId().toString();
    const save = jest.fn().mockResolvedValue(true);
    City.findById.mockResolvedValue({ _id: id, name: 'Old Name', save });

    const res = await request(app)
      .patch(`/api/v1/cities/${id}`)
      .set(...asUser(superAdmin))
      .send({ name: 'New Name' });

    expect(res.status).toBe(200);
    expect(save).toHaveBeenCalled();
  });

  it('denies a non-Super-Admin with 403', async () => {
    const employee = makeFakeUser({
      role: ROLES.BRAND_EMPLOYEE,
      brandId: new mongoose.Types.ObjectId(),
    });
    const id = new mongoose.Types.ObjectId().toString();

    const res = await request(app)
      .patch(`/api/v1/cities/${id}`)
      .set(...asUser(employee))
      .send({ name: 'New Name' });

    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/v1/cities/:id (deactivation, not destructive delete)', () => {
  it('sets isActive to false rather than removing the document', async () => {
    const superAdmin = makeFakeUser({ role: ROLES.SUPER_ADMIN });
    const id = new mongoose.Types.ObjectId().toString();
    const save = jest.fn().mockResolvedValue(true);
    const city = { _id: id, name: 'Lahore', isActive: true, save };
    City.findById.mockResolvedValue(city);

    const res = await request(app).delete(`/api/v1/cities/${id}`).set(...asUser(superAdmin));

    expect(res.status).toBe(200);
    expect(city.isActive).toBe(false);
    expect(save).toHaveBeenCalled();
    // Confirms no destructive Mongoose delete method was ever used.
    expect(City.deleteOne).not.toHaveBeenCalled();
    expect(City.findByIdAndDelete).not.toHaveBeenCalled();
  });

  it('denies a non-Super-Admin with 403', async () => {
    const customer = makeFakeUser({ role: ROLES.CUSTOMER });
    const id = new mongoose.Types.ObjectId().toString();

    const res = await request(app).delete(`/api/v1/cities/${id}`).set(...asUser(customer));
    expect(res.status).toBe(403);
  });
});