const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');

const env = require('./config/env');
const { corsOptions } = require('./config/cors');
const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const cityRoutes = require('./routes/city.routes');
const brandRoutes = require('./routes/brand.routes');
const storeRoutes = require('./routes/store.routes');

const categoryRoutes = require('./routes/category.routes');
const productRoutes = require('./routes/product.routes');

const inventoryRoutes = require('./routes/inventory.routes');
const cartRoutes = require('./routes/cart.routes');
const orderRoutes = require('./routes/order.routes');
const brandOrderRoutes = require('./routes/brandOrder.routes');
const deliveryRoutes = require('./routes/delivery.routes');
const paymentRoutes = require('./routes/payment.routes');
const employeeRoutes = require('./routes/employee.routes');
const adminBrandRoutes = require('./routes/adminBrand.routes');
const adminOrderRoutes = require('./routes/adminOrder.routes');
const uploadRoutes = require('./routes/upload.routes');
const reviewRoutes = require('./routes/review.routes');
const adminReviewRoutes = require('./routes/adminReview.routes');
const notificationRoutes = require('./routes/notification.routes');
const adminSettingsRoutes = require('./routes/adminSettings.routes');

const requestLogger = require('./middleware/requestLogger');
const { apiLimiter } = require('./middleware/rateLimiters');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

// Behind Render/Vercel the real client IP is in X-Forwarded-For; without
// this every client shares the proxy's IP and rate limiting breaks.
if (env.nodeEnv === 'production') {
  app.set('trust proxy', 1);
}

// Core middleware
app.use(helmet());
app.use(requestLogger);
app.use(cors(corsOptions));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true }));
// Required to populate req.cookies for the HTTP-only auth cookie (see
// config/cookie.js and middleware/authenticate.js).
app.use(cookieParser());

// Foundation-level health check (see docs/18-development-roadmap.md, Phase 0/1)
app.use('/health', healthRoutes);

// Versioned API base. Matches only the exact base path so it does not
// shadow business routers mounted under /api/v1/* in later phases (see
// docs/18-development-roadmap.md and AGENTS.md, Scope).
app.get('/api/v1', (req, res) => {
  res.status(200).json({
    message: 'CityCart API v1',
  });
});

app.use('/api/v1', apiLimiter);

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/cities', cityRoutes);
app.use('/api/v1/brands', brandRoutes);
app.use('/api/v1/stores', storeRoutes);

app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/products', productRoutes);

app.use('/api/v1/inventory', inventoryRoutes);
app.use('/api/v1/cart', cartRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/brand/orders', brandOrderRoutes);
app.use('/api/v1/deliveries', deliveryRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/employees', employeeRoutes);
app.use('/api/v1/admin/brands', adminBrandRoutes);
app.use('/api/v1/admin/orders', adminOrderRoutes);
app.use('/api/v1/uploads', uploadRoutes);
app.use('/api/v1/reviews', reviewRoutes);
app.use('/api/v1/admin/reviews', adminReviewRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/admin', adminSettingsRoutes);

// Must stay LAST: unmatched routes -> 404, then the global error handler.
app.use(notFound);
app.use(errorHandler);

module.exports = app;