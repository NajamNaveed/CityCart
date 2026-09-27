const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const env = require('./config/env');
const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');

const app = express();

// Core middleware
app.use(
  cors({
    origin: env.clientUrl,
    credentials: true,
  })
);
app.use(express.json());
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

app.use('/api/v1/auth', authRoutes);

module.exports = app;