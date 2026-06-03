const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const authHeader = req.get('Authorization') || '';

  if (!authHeader.startsWith('Bearer ')) {
    return res.status(403).json({
      error: 'Missing or invalid authorization token'
    });
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(403).json({
      error: 'Invalid authorization token'
    });
  }
}

function requireRole(...roles) {
  return function (req, res, next) {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Insufficient permissions'
      });
    }

    next();
  };
}

module.exports = {
  requireAuth,
  requireRole
};