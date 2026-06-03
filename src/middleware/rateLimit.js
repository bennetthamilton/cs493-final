const buckets = new Map();

const WINDOW_MS = 10000;
const MAX_REQUESTS = 30;

function rateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();

  const bucket = buckets.get(ip) || {
    count: 0,
    windowStart: now
  };

  if (now - bucket.windowStart > WINDOW_MS) {
    bucket.count = 0;
    bucket.windowStart = now;
  }

  bucket.count += 1;
  buckets.set(ip, bucket);

  if (bucket.count > MAX_REQUESTS) {
    return res.status(429).json({
      error: 'Too many requests'
    });
  }

  next();
}

module.exports = rateLimit;