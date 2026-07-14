/**
 * security.js
 * 
 * Safe security middlewares for JSON API protection:
 * 1. securityHeaders: Sets frame, XSS, content-type and transport security headers.
 * 2. nosqlSanitizer: Sanitizes inputs from keys starting with '$' to prevent MongoDB Injection.
 * 3. authRateLimiter: In-memory IP rate limiter to protect login endpoints from brute-force attacks.
 */

// Memory storage for rate limiting
const rateLimitStore = {};
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes window
const MAX_LOGIN_ATTEMPTS = 50; // max 50 login attempts per IP per 15 minutes

const securityHeaders = (req, res, next) => {
  // Prevent clickjacking by restricting framing to SAMEORIGIN
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Enable XSS filtering built into modern browsers
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Enforce secure HTTPS connection
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  // Set Referrer Policy to prevent credential leaking in referrers
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  next();
};

const sanitizeNoSQL = (obj) => {
  if (obj instanceof Object) {
    for (const key in obj) {
      if (key.startsWith('$')) {
        delete obj[key];
      } else {
        sanitizeNoSQL(obj[key]);
      }
    }
  }
  return obj;
};

const nosqlSanitizer = (req, res, next) => {
  if (req.body) req.body = sanitizeNoSQL(req.body);
  if (req.query) req.query = sanitizeNoSQL(req.query);
  if (req.params) req.params = sanitizeNoSQL(req.params);
  next();
};

const authRateLimiter = (req, res, next) => {
  // Get remote IP address
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || 'unknown';
  const now = Date.now();

  if (!rateLimitStore[ip]) {
    rateLimitStore[ip] = {
      count: 1,
      resetTime: now + WINDOW_MS
    };
    return next();
  }

  const record = rateLimitStore[ip];

  if (now > record.resetTime) {
    // Window expired, reset counter
    record.count = 1;
    record.resetTime = now + WINDOW_MS;
    return next();
  }

  record.count += 1;
  if (record.count > MAX_LOGIN_ATTEMPTS) {
    return res.status(429).json({
      message: 'Too many login attempts from this IP. Please try again after 15 minutes.'
    });
  }

  next();
};

// Periodic cleanup of rate limiting memory (every 30 minutes)
setInterval(() => {
  const now = Date.now();
  for (const ip in rateLimitStore) {
    if (now > rateLimitStore[ip].resetTime) {
      delete rateLimitStore[ip];
    }
  }
}, 30 * 60 * 1000);

module.exports = {
  securityHeaders,
  nosqlSanitizer,
  authRateLimiter
};
