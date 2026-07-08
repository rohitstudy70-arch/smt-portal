const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const connectDB = require('./config/db');

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB().then(() => {
  const syncDevices = require('./utils/syncDevices');
  syncDevices();
});

// Ensure upload folders exist
const uploadDir = path.join(__dirname, 'uploads');
const screenshotDir = path.join(uploadDir, 'screenshots');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir);
}

const app = express();

// CORS - allow frontend origins
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'https://smt-portal-i5pm.vercel.app',
  'https://smt-portal-teal.vercel.app',
  'https://cdbportal.cloud',
  'http://cdbportal.cloud',
  'https://www.cdbportal.cloud',
  'http://www.cdbportal.cloud',
  process.env.FRONTEND_URL
].filter(Boolean);

// Remove duplicates
const uniqueOrigins = [...new Set(allowedOrigins)];

app.use(
  cors({
    origin: uniqueOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Explicitly handle preflight OPTIONS requests for all routes
app.options('*', cors({
  origin: uniqueOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Mount routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/activation-requests', require('./routes/activationRequests'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/users', require('./routes/subUsers'));
app.use('/api/devices', require('./routes/devices'));
app.use('/api/products', require('./routes/products'));
app.use('/api/portal', require('./routes/portal'));
app.use('/api/due-dashboard', require('./routes/dueDashboard'));
app.use('/api/payment-verification-requests', require('./routes/paymentVerificationRequests'));
app.use('/api/certificates', require('./routes/certificates'));

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);
  res.status(500).json({ message: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
