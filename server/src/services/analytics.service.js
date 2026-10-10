const mongoose = require('mongoose');

const Brand = require('../models/brand.model');
const Delivery = require('../models/delivery.model');
const Inventory = require('../models/inventory.model');
const Order = require('../models/order.model');
const PlatformSettings = require('../models/platformSettings.model');
const Product = require('../models/product.model');
const User = require('../models/user.model');

const DELIVERED = 'DELIVERED';
const CANCELLED = ['CANCELLED', 'REJECTED'];

function orderMatch(range, brandId) {
  return {
    createdAt: { $gte: range.from, $lt: range.to },
    ...(brandId && { brandId: new mongoose.Types.ObjectId(String(brandId)) }),
  };
}

function emptyBrandSummary() {
  return {
    orders: 0,
    deliveredOrders: 0,
    cancelledOrders: 0,
    pendingOrders: 0,
    revenue: 0,
    averageOrderValue: 0,
    customers: 0,
    repeatCustomers: 0,
    productsSold: 0,
    lowStockProducts: 0,
    outOfStockProducts: 0,
  };
}

async function getBrandAnalytics({ brandId, range }) {
  const [orderResult, inventoryResult, deliveryStatuses] = await Promise.all([
    Order.aggregate([
      { $match: orderMatch(range, brandId) },
      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,
                orders: { $sum: 1 },
                deliveredOrders: { $sum: { $cond: [{ $eq: ['$orderStatus', DELIVERED] }, 1, 0] } },
                cancelledOrders: { $sum: { $cond: [{ $in: ['$orderStatus', CANCELLED] }, 1, 0] } },
                pendingOrders: { $sum: { $cond: [{ $eq: ['$orderStatus', 'PENDING'] }, 1, 0] } },
                revenue: { $sum: { $cond: [{ $eq: ['$orderStatus', DELIVERED] }, '$total', 0] } },
              },
            },
            { $project: { _id: 0 } },
          ],
          statuses: [{ $group: { _id: '$orderStatus', count: { $sum: 1 } } }, { $sort: { count: -1 } }],
          salesTrend: [
            { $match: { orderStatus: DELIVERED } },
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
                orders: { $sum: 1 },
                revenue: { $sum: '$total' },
              },
            },
            { $sort: { _id: 1 } },
            { $project: { _id: 0, date: '$_id', orders: 1, revenue: 1 } },
          ],
          topProducts: [
            { $match: { orderStatus: DELIVERED } },
            { $unwind: '$items' },
            {
              $group: {
                _id: '$items.productId',
                productName: { $first: '$items.productName' },
                unitsSold: { $sum: '$items.quantity' },
                revenue: { $sum: '$items.totalPrice' },
              },
            },
            { $sort: { unitsSold: -1, revenue: -1 } },
            { $limit: 5 },
            { $project: { _id: 0, productId: '$_id', productName: 1, unitsSold: 1, revenue: 1 } },
          ],
          productsSold: [
            { $match: { orderStatus: DELIVERED } },
            { $unwind: '$items' },
            { $group: { _id: null, units: { $sum: '$items.quantity' } } },
          ],
          customers: [
            { $group: { _id: '$customerId', orders: { $sum: 1 } } },
            {
              $group: {
                _id: null,
                customers: { $sum: 1 },
                repeatCustomers: { $sum: { $cond: [{ $gt: ['$orders', 1] }, 1, 0] } },
              },
            },
            { $project: { _id: 0 } },
          ],
        },
      },
    ]),
    Inventory.aggregate([
      { $match: { brandId: new mongoose.Types.ObjectId(String(brandId)), trackInventory: true } },
      {
        $addFields: {
          availableQuantity: { $subtract: ['$quantity', '$reservedQuantity'] },
        },
      },
      {
        $addFields: {
          stockStatus: {
            $cond: [
              { $lte: ['$availableQuantity', 0] },
              'OUT_OF_STOCK',
              { $cond: [{ $lte: ['$availableQuantity', '$lowStockThreshold'] }, 'LOW_STOCK', 'IN_STOCK'] },
            ],
          },
        },
      },
      {
        $facet: {
          counts: [{ $group: { _id: '$stockStatus', count: { $sum: 1 } } }],
          alerts: [
            { $match: { stockStatus: { $in: ['LOW_STOCK', 'OUT_OF_STOCK'] } } },
            { $sort: { availableQuantity: 1 } },
            { $limit: 10 },
            {
              $lookup: {
                from: 'products',
                let: { inventoryProductId: '$productId', inventoryBrandId: '$brandId' },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ['$_id', '$$inventoryProductId'] },
                          { $eq: ['$brandId', '$$inventoryBrandId'] },
                        ],
                      },
                    },
                  },
                  { $project: { name: 1 } },
                ],
                as: 'product',
              },
            },
            { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
            {
              $project: {
                _id: 0,
                productId: 1,
                productName: '$product.name',
                quantity: 1,
                reservedQuantity: 1,
                availableQuantity: 1,
                lowStockThreshold: 1,
                status: '$stockStatus',
              },
            },
          ],
        },
      },
    ]),
    Delivery.aggregate([
      { $match: { brandId: new mongoose.Types.ObjectId(String(brandId)), createdAt: { $gte: range.from, $lt: range.to } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
  ]);

  const orderData = orderResult[0] || {};
  const summary = {
    ...emptyBrandSummary(),
    ...(orderData.summary?.[0] || {}),
    ...(orderData.customers?.[0] || {}),
    productsSold: orderData.productsSold?.[0]?.units || 0,
  };
  summary.averageOrderValue = summary.deliveredOrders ? summary.revenue / summary.deliveredOrders : 0;

  const inventory = inventoryResult[0] || {};
  for (const count of inventory.counts || []) {
    if (count._id === 'LOW_STOCK') summary.lowStockProducts = count.count;
    if (count._id === 'OUT_OF_STOCK') summary.outOfStockProducts = count.count;
  }

  return {
    range: range.labels,
    summary,
    salesTrend: orderData.salesTrend || [],
    orderStatuses: (orderData.statuses || []).map(({ _id, count }) => ({ status: _id, count })),
    topProducts: orderData.topProducts || [],
    inventoryAlerts: inventory.alerts || [],
    deliveryStatuses: deliveryStatuses.map(({ _id, count }) => ({ status: _id, count })),
  };
}

async function getPlatformAnalytics({ range }) {
  const [brandCount, activeBrandCount, customerCount, productCount, settings, orderResult, brandGrowth, customerGrowth] =
    await Promise.all([
      Brand.countDocuments({}),
      Brand.countDocuments({ status: 'ACTIVE' }),
      User.countDocuments({ role: 'CUSTOMER' }),
      Product.countDocuments({}),
      PlatformSettings.findOne({ key: 'platform' }),
      Order.aggregate([
        { $match: orderMatch(range) },
        {
          $facet: {
            summary: [
              {
                $group: {
                  _id: null,
                  orders: { $sum: 1 },
                  deliveredOrders: { $sum: { $cond: [{ $eq: ['$orderStatus', DELIVERED] }, 1, 0] } },
                  cancelledOrders: { $sum: { $cond: [{ $in: ['$orderStatus', CANCELLED] }, 1, 0] } },
                  gmv: { $sum: { $cond: [{ $eq: ['$orderStatus', DELIVERED] }, '$total', 0] } },
                },
              },
              { $project: { _id: 0 } },
            ],
            statuses: [{ $group: { _id: '$orderStatus', count: { $sum: 1 } } }, { $sort: { count: -1 } }],
            growthTrend: [
              {
                $group: {
                  _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
                  orders: { $sum: 1 },
                  gmv: { $sum: { $cond: [{ $eq: ['$orderStatus', DELIVERED] }, '$total', 0] } },
                },
              },
              { $sort: { _id: 1 } },
              { $project: { _id: 0, date: '$_id', orders: 1, gmv: 1 } },
            ],
            ordersByCity: [
              { $lookup: { from: 'brands', localField: 'brandId', foreignField: '_id', as: 'brand' } },
              { $unwind: '$brand' },
              { $lookup: { from: 'cities', localField: 'brand.cityId', foreignField: '_id', as: 'city' } },
              { $unwind: { path: '$city', preserveNullAndEmptyArrays: true } },
              {
                $group: {
                  _id: '$brand.cityId',
                  city: { $first: '$city.name' },
                  orders: { $sum: 1 },
                  gmv: { $sum: { $cond: [{ $eq: ['$orderStatus', DELIVERED] }, '$total', 0] } },
                },
              },
              { $sort: { orders: -1 } },
              { $limit: 10 },
              { $project: { _id: 0, cityId: '$_id', city: { $ifNull: ['$city', 'Unknown'] }, orders: 1, gmv: 1 } },
            ],
            topBrands: [
              {
                $group: {
                  _id: '$brandId',
                  orders: { $sum: 1 },
                  gmv: { $sum: { $cond: [{ $eq: ['$orderStatus', DELIVERED] }, '$total', 0] } },
                },
              },
              { $sort: { gmv: -1, orders: -1 } },
              { $limit: 10 },
              { $lookup: { from: 'brands', localField: '_id', foreignField: '_id', as: 'brand' } },
              { $unwind: { path: '$brand', preserveNullAndEmptyArrays: true } },
              { $project: { _id: 0, brandId: '$_id', brandName: '$brand.name', orders: 1, gmv: 1 } },
            ],
          },
        },
      ]),
      Brand.aggregate([
        { $match: { createdAt: { $gte: range.from, $lt: range.to } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } }, count: { $sum: 1 } } },
      ]),
      User.aggregate([
        { $match: { role: 'CUSTOMER', createdAt: { $gte: range.from, $lt: range.to } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } }, count: { $sum: 1 } } },
      ]),
    ]);

  const orderData = orderResult[0] || {};
  const summary = {
    brands: brandCount,
    activeBrands: activeBrandCount,
    customers: customerCount,
    products: productCount,
    orders: orderData.summary?.[0]?.orders || 0,
    deliveredOrders: orderData.summary?.[0]?.deliveredOrders || 0,
    cancelledOrders: orderData.summary?.[0]?.cancelledOrders || 0,
    gmv: orderData.summary?.[0]?.gmv || 0,
    commissionRate: settings?.commissionRate ?? null,
    estimatedCommission:
      settings?.commissionRate == null
        ? null
        : ((orderData.summary?.[0]?.gmv || 0) * settings.commissionRate) / 100,
  };

  const dailyValues = new Map();
  for (const item of brandGrowth) {
    dailyValues.set(item._id, { ...(dailyValues.get(item._id) || {}), newBrands: item.count });
  }
  for (const item of customerGrowth) {
    dailyValues.set(item._id, { ...(dailyValues.get(item._id) || {}), newCustomers: item.count });
  }
  const growthDates = new Set([
    ...(orderData.growthTrend || []).map((item) => item.date),
    ...dailyValues.keys(),
  ]);
  const growthTrend = [...growthDates].sort().map((date) => ({
    date,
    orders: 0,
    gmv: 0,
    newBrands: 0,
    newCustomers: 0,
    ...(orderData.growthTrend || []).find((item) => item.date === date),
    ...(dailyValues.get(date) || {}),
  }));

  return {
    range: range.labels,
    summary,
    growthTrend,
    orderStatuses: (orderData.statuses || []).map(({ _id, count }) => ({ status: _id, count })),
    ordersByCity: orderData.ordersByCity || [],
    topBrands: orderData.topBrands || [],
  };
}

module.exports = { getBrandAnalytics, getPlatformAnalytics, orderMatch };