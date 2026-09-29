const jwt = require('jsonwebtoken');
exports.auth = (req, res, next) => {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  try { req.user = jwt.verify(t, process.env.JWT_SECRET || 'dev-secret'); next(); }
  catch { res.status(401).json({ message: 'Please log in' }); }
};
exports.adminOnly = (req, res, next) =>
  req.user.userType === 'admin' ? next() : res.status(403).json({ message: 'Admins only' });
