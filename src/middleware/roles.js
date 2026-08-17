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
      const user = await db.prepare('SELECT id, name, email, role, login_authorized FROM users WHERE id = ?').get(req.session.userId);

      if (!user) {
        req.session.destroy();
        return res.status(401).json({ error: 'User not found' });
      }

      if (user.role === 'student') {
        if (!user.login_authorized) {
          req.session.destroy();
          return res.status(401).json({ error: 'UNAUTHORIZED_STUDENT', message: 'Your login authorization has been revoked by the admin.' });
        }

        if (req.session.targetExamId) {
          const exam = await db.prepare('SELECT is_published, access_code FROM exams WHERE id = ?').get(req.session.targetExamId);
          if (!exam || !exam.is_published || !exam.access_code) {
            req.session.destroy();
            return res.status(401).json({ error: 'EXAM_UNAVAILABLE', message: 'The exam is no longer scheduled or the access code is invalid.' });
          }
        }
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
