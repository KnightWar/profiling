/**
 * Role-based Access Control Middleware
 * ─────────────────────────────────────
 * Usage: router.use(requireRole('admin'))
 *        router.get('/path', requireRole('admin', 'evaluator'), handler)
 */

const { getDb } = require('../db/database');

function requireRole(...roles) {
  return async (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      const db = getDb();
      const user = await db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(req.session.userId);

      if (!user) {
        req.session.destroy();
        return res.status(401).json({ error: 'User not found' });
      }

      if (!roles.includes(user.role)) {
        return res.status(403).json({ error: `Access denied. Required role: ${roles.join(' or ')}` });
      }

      // Attach user to request for downstream handlers
      req.user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requireRole };
