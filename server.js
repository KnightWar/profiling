require('dotenv').config();

const express = require('express');
const compression = require('compression'); // 1.1 gzip/brotli
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const { isPg, getDb, initDb, closeDb } = require('./src/db/database');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

// ─── Guard against an insecure default session secret in production ────────
// A missing SESSION_SECRET in prod means every deploy shares the same
// publicly-known fallback string, which lets anyone forge session cookies.
// Fail loudly at boot instead of silently running insecurely.
if (isProd && !process.env.SESSION_SECRET) {
  console.error('[FATAL] SESSION_SECRET is not set. Refusing to start in production ' +
    'with the insecure default secret. Set SESSION_SECRET in your environment variables.');
  process.exit(1);
}

// Trust proxy for secure cookies on Vercel/production
if (isProd) {
  app.set('trust proxy', 1);
}

// ─── Ensure directories (only locally) ───────────────────────────────────────
if (!isPg) {
  fs.mkdirSync(path.resolve(process.env.UPLOAD_DIR || './uploads'), { recursive: true });
  fs.mkdirSync(path.resolve('./data'), { recursive: true });
}

// ─── Middleware ─────────────────────────────────────────────────────────────
// 1.1 — Compress all responses (gzip/brotli) before anything else
app.use(compression());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Session config (Postgres in production, SQLite in local development)
let sessionStore;
if (isPg) {
  const PgStore = require('connect-pg-simple')(session);
  const { Pool } = require('pg');
  sessionStore = new PgStore({
    pool: new Pool({
      connectionString: process.env.DATABASE_URL,
      max: parseInt(process.env.PG_POOL_MAX || '3', 10), // keep per-instance pool small on serverless
      ssl: { rejectUnauthorized: false }
    }),
    tableName: 'session',
    createTableIfMissing: true
  });
} else {
  const SQLiteStore = require('connect-sqlite3')(session);
  sessionStore = new SQLiteStore({
    db: 'sessions.db',
    dir: path.resolve('./data'),
    concurrentDB: true,
  });
}

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'cas-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax',
  },
}));

// ─── Static files ────────────────────────────────────────────────────────────
// Static files in /dist (immutable hashed bundles)
app.use('/dist', express.static(path.join(__dirname, 'public', 'dist'), {
  maxAge: '1y',
  immutable: true,
  etag: true,
}));

// Everything else (fonts, icons, templates, and — importantly — index.html)
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: 0,
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html') || filePath.endsWith('manifest.json') || filePath.endsWith('sw.js')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  },
}));

// Upload files served statically
app.use('/uploads', express.static(path.resolve(process.env.UPLOAD_DIR || './uploads'), {
  maxAge: '1m',
  etag: true,
}));

// ─── Lazy DB Initialization (Serverless Friendly) ───────────────────────────
let isDbInitialized = false;
let dbInitPromise = null;

app.use(async (req, res, next) => {
  if (!isDbInitialized) {
    if (!dbInitPromise) {
      dbInitPromise = initDb()
        .then(() => {
          isDbInitialized = true;
          dbInitPromise = null;
        })
        .catch(err => {
          console.error('[DB] Lazy initialization failed:', err);
          dbInitPromise = null;
          next(err);
        });
    }
    await dbInitPromise;
  }
  next();
});

// ─── Single Session Enforcement ──────────────────────────────────────────────
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

app.use('/api', async (req, res, next) => {
  // Skip auth routes (login)
  if (req.path === '/auth/login' || req.path === '/auth/access-code-login') {
    return next();
  }

  // Only enforce single-session on state-changing requests
  if (req.session && req.session.userId && MUTATING_METHODS.has(req.method)) {
    try {
      const db = getDb();
      const user = await db.prepare('SELECT active_session_id FROM users WHERE id = ?').get(req.session.userId);

      // If user's active session doesn't match this request's session ID, invalidate this session
      if (user && user.active_session_id && user.active_session_id !== req.sessionID) {
        req.session.destroy();
        return res.status(401).json({ error: 'Session expired. You logged in from another device or browser.' });
      }
    } catch (err) {
      console.error('Session validation error:', err);
    }
  }
  next();
});

// ─── API Routes ─────────────────────────────────────────────────────────────
const authRoutes = require('./src/routes/auth');
const adminRoutes = require('./src/routes/admin');
const questionRoutes = require('./src/routes/questions');
const examRoutes = require('./src/routes/exam');
const evaluatorRoutes = require('./src/routes/evaluator');
const scoreRoutes = require('./src/routes/scores');

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin', questionRoutes);
app.use('/api/student', examRoutes);
app.use('/api/evaluator', evaluatorRoutes);
app.use('/api/scores', scoreRoutes);

// ─── SPA fallback ───────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  // Don't catch API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Error handler ──────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// Graceful shutdown (only outside Vercel)
if (!process.env.VERCEL) {
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    closeDb();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    closeDb();
    process.exit(0);
  });
}

// ─── Start ──────────────────────────────────────────────────────────────────
if (require.main === module) {
  console.log('\n══════════════════════════════════════════════');
  console.log('  Composite Assessment System');
  console.log('══════════════════════════════════════════════');
  
  initDb().then(() => {
    isDbInitialized = true;
    app.listen(PORT, () => {
      console.log(`\n[SERVER] Running on http://localhost:${PORT}`);
      console.log(`[SERVER] Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('══════════════════════════════════════════════\n');
    });
  }).catch(err => {
    console.error('[SERVER] Database initialization failed:', err);
    process.exit(1);
  });
}

module.exports = app;
