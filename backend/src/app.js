const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const config = require('./config/env');
const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const salespersonRoutes = require('./routes/salespersonRoutes');
const whatsappRoutes = require('./routes/whatsappRoutes');
const customerRoutes = require('./routes/customerRoutes');
const conversationRoutes = require('./routes/conversationRoutes');
const mediaRoutes = require('./routes/mediaRoutes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

// Security HTTP headers with Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// Cross-Origin Resource Sharing (CORS) configuration
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);

      // If wildcard is configured, permit any origin (dynamically reflected for credentials support)
      if (config.corsOrigin === '*') {
        return callback(null, true);
      }

      const configuredOrigins = config.corsOrigin
        ? config.corsOrigin.split(',').map((o) => o.trim())
        : [];

      const allowedOrigins = [
        ...configuredOrigins,
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:3000',
      ];

      // Allow exact match or any Vercel deployment (*.vercel.app)
      if (
        allowedOrigins.includes(origin) ||
        origin.endsWith('.vercel.app')
      ) {
        return callback(null, true);
      }

      if (config.env === 'production') {
        console.warn(`[CORS Blocked] Origin not allowed: ${origin}`);
        return callback(new Error(`CORS policy: Origin ${origin} is not allowed by Access-Control-Allow-Origin`));
      }
      return callback(null, true); // Dev-friendly fallback for local testing
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// General API rate limiter for DoS protection (skips health check & live SSE streams)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => config.env === 'test' || req.path === '/api/health' || req.path.includes('/live-stream'),
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
  },
});
app.use('/api', generalLimiter);

// Request body parsers with payload size limits to mitigate DOS
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Request logging (skip during automated test runs)
if (config.env !== 'test') {
  app.use(morgan('dev'));
}

// API Routes
app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/salespersons', salespersonRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/media', mediaRoutes);

// Root route
app.get('/', (req, res) => {
  res.status(200).json({
    name: 'WhatsApp Monitor API',
    phase: 'Phase 8 - Production Readiness, Real WhatsApp Testing, and Security Audit',
    status: 'online',
    docs: '/api/health',
  });
});

// 404 handler
app.use(notFoundHandler);

// Central error handler
app.use(errorHandler);

module.exports = app;

