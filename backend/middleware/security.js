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
  // Hide server fingerprint
  res.removeHeader('X-Powered-By');
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  // Prevent MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Enable browser XSS filtering
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Enforce secure HTTPS connection
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Permissions Policy to restrict camera/microphone/geolocation access unless requested
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // Content Security Policy
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; frame-src 'self' blob:; connect-src 'self' https: http:;"
  );
  
  next();
};

const sanitizeInput = (obj) => {
  if (typeof obj === 'string') {
    // Strip malicious script tags & event handlers (XSS Protection)
    return obj
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/onerror=/gi, '')
      .replace(/onload=/gi, '');
  }
  if (obj instanceof Object) {
    for (const key in obj) {
      if (key.startsWith('$')) {
        delete obj[key];
      } else {
        obj[key] = sanitizeInput(obj[key]);
      }
    }
  }
  return obj;
};

const nosqlSanitizer = (req, res, next) => {
  if (req.body) req.body = sanitizeInput(req.body);
  if (req.query) req.query = sanitizeInput(req.query);
  if (req.params) req.params = sanitizeInput(req.params);
  next();
};

const globalStore = {};
const GLOBAL_WINDOW_MS = 15 * 60 * 1000;
const MAX_GLOBAL_REQUESTS = 500; // max 500 requests per IP per 15 minutes

const globalRateLimiter = (req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || 'unknown';
  const now = Date.now();

  if (!globalStore[ip]) {
    globalStore[ip] = { count: 1, resetTime: now + GLOBAL_WINDOW_MS };
    return next();
  }

  const record = globalStore[ip];
  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + GLOBAL_WINDOW_MS;
    return next();
  }

  record.count += 1;
  if (record.count > MAX_GLOBAL_REQUESTS) {
    return res.status(429).json({
      message: 'Too many requests from this IP. Please wait a few minutes before trying again.'
    });
  }

  next();
};

const authRateLimiter = (req, res, next) => {
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

// Periodic cleanup of rate limiting memory (every 15 minutes)
setInterval(() => {
  const now = Date.now();
  for (const ip in rateLimitStore) {
    if (now > rateLimitStore[ip].resetTime) {
      delete rateLimitStore[ip];
    }
  }
  for (const ip in globalStore) {
    if (now > globalStore[ip].resetTime) {
      delete globalStore[ip];
    }
  }
}, 15 * 60 * 1000);

module.exports = {
  securityHeaders,
  nosqlSanitizer,
  authRateLimiter,
  globalRateLimiter,
};
