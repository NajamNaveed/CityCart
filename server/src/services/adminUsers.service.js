const User = require('../models/user.model');
const { escapeRegex } = require('../utils/escapeRegex');

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

async function listAdminUsers({ search, role, isActive, page, limit } = {}) {
  const filter = {};
  if (role) filter.role = role;
  if (isActive !== undefined) filter.isActive = isActive;
  if (search) {
    const escaped = escapeRegex(search);
    filter.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { email: { $regex: escaped, $options: 'i' } },
    ];
  }

  const pageNumber = page || DEFAULT_PAGE;
  const limitNumber = limit || DEFAULT_LIMIT;
  const [users, total] = await Promise.all([
    User.aggregate([
      { $match: filter },
      { $sort: { createdAt: -1, _id: 1 } },
      { $skip: (pageNumber - 1) * limitNumber },
      { $limit: limitNumber },
      {
        $lookup: {
          from: 'orders',
          let: { customerId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$customerId', '$$customerId'] } } },
            { $count: 'count' },
          ],
          as: 'orderCounts',
        },
      },
      { $lookup: { from: 'employees', localField: '_id', foreignField: 'userId', as: 'employee' } },
      { $lookup: { from: 'brands', localField: 'brandId', foreignField: '_id', as: 'brand' } },
      {
        $project: {
          name: 1,
          email: 1,
          phone: 1,
          role: 1,
          isActive: 1,
          brandId: 1,
          createdAt: 1,
          orderCount: { $ifNull: [{ $arrayElemAt: ['$orderCounts.count', 0] }, 0] },
          jobTitle: { $ifNull: [{ $arrayElemAt: ['$employee.jobTitle', 0] }, null] },
          brandName: { $ifNull: [{ $arrayElemAt: ['$brand.name', 0] }, null] },
          _id: 1,
        },
      },
    ]),
    User.countDocuments(filter),
  ]);

  return {
    users: users.map((user) => ({
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      isActive: user.isActive !== false,
      brandId: user.brandId,
      brandName: user.brandName,
      jobTitle: user.jobTitle,
      orderCount: user.orderCount || 0,
      createdAt: user.createdAt,
    })),
    pagination: {
      page: pageNumber,
      limit: limitNumber,
      total,
      pages: Math.ceil(total / limitNumber),
    },
  };
}

module.exports = { listAdminUsers };