/**
 * Database Connection & Helpers (Dual Mode: SQLite & PostgreSQL)
 * ────────────────────────────────────────────────────────────
 * Fallback to better-sqlite3 locally, use PostgreSQL in production (Neon/Vercel).
 */

const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const { AsyncLocalStorage } = require('async_hooks');

const transactionStorage = new AsyncLocalStorage();
const isPg = !!process.env.DATABASE_URL;

let _pgPool = null;
let _sqliteDb = null;

function getPgPool() {
  if (!_pgPool) {
    _pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: {
        rejectUnauthorized: false, // Required for Neon
      },
    });
  }
  return _pgPool;
}

function getSqliteDb() {
  if (!_sqliteDb) {
    const Database = require('better-sqlite3');
    const dbPath = process.env.DB_PATH || './data/assessment.db';
    const dir = path.dirname(path.resolve(dbPath));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    _sqliteDb = new Database(path.resolve(dbPath));
    _sqliteDb.pragma('journal_mode = WAL');
    _sqliteDb.pragma('foreign_keys = ON');
    _sqliteDb.pragma('busy_timeout = 5000');
  }
  return _sqliteDb;
}

function getDb() {
  if (isPg) {
    const pool = getPgPool();
    return {
      prepare(sql) {
        let translatedSql = sql;
        
        // Translate SQLite specific SQL features to PG equivalents
        // Convert GROUP_CONCAT to STRING_AGG
        translatedSql = translatedSql.replace(/GROUP_CONCAT\s*\(\s*([^,]+)\s*,\s*([^)]+)\)/gi, 'STRING_AGG($1, $2)');
        
        // Convert INSERT OR IGNORE to INSERT ... ON CONFLICT DO NOTHING
        if (/INSERT\s+OR\s+IGNORE\s+INTO/gi.test(translatedSql)) {
          translatedSql = translatedSql.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
          translatedSql += ' ON CONFLICT DO NOTHING';
        }

        // Convert SQLite parameters "?" to PostgreSQL "$1", "$2", "$3", etc.
        let index = 1;
        translatedSql = translatedSql.replace(/\?/g, () => `$${index++}`);

        return {
          async all(...params) {
            const client = transactionStorage.getStore() || pool;
            const normalized = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
            const res = await client.query(translatedSql, normalized);
            return res.rows;
          },
          async get(...params) {
            const client = transactionStorage.getStore() || pool;
            const normalized = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
            const res = await client.query(translatedSql, normalized);
            return res.rows[0] || null;
          },
          async run(...params) {
            const client = transactionStorage.getStore() || pool;
            const normalized = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
            const res = await client.query(translatedSql, normalized);
            return {
              changes: res.rowCount,
              lastInsertRowid: res.rows[0] ? res.rows[0].id : null,
            };
          }
        };
      },
      transaction(fn) {
        return async (...args) => {
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            const result = await transactionStorage.run(client, async () => {
              return await fn(...args);
            });
            await client.query('COMMIT');
            return result;
          } catch (err) {
            await client.query('ROLLBACK');
            throw err;
          } finally {
            client.release();
          }
        };
      }
    };
  } else {
    // SQLite mode: mock async methods to allow using await transparently in both modes
    const db = getSqliteDb();
    return {
      prepare(sql) {
        const stmt = db.prepare(sql);
        return {
          async all(...params) {
            const normalized = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
            return stmt.all(normalized);
          },
          async get(...params) {
            const normalized = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
            return stmt.get(normalized);
          },
          async run(...params) {
            const normalized = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
            const res = stmt.run(normalized);
            return {
              changes: res.changes,
              lastInsertRowid: res.lastInsertRowid,
            };
          }
        };
      },
      transaction(fn) {
        const tx = db.transaction(fn);
        return async (...args) => {
          return tx(...args);
        };
      }
    };
  }
}

async function initDb() {
  if (isPg) {
    const pool = getPgPool();
    
    // Run Postgres migrations for existing databases before early return
    try { await pool.query("ALTER TABLE users ADD COLUMN login_authorized BOOLEAN DEFAULT false;"); } catch (e) {}

    // Quick check if schema is already applied to avoid 10+ second DDL execution on cold starts
    try {
      const checkRes = await pool.query('SELECT COUNT(*) as c FROM components');
      const count = parseInt(checkRes.rows[0].c, 10);
      if (count > 0) {
        return; // Schema and seed already applied!
      }
    } catch (e) {
      // Table doesn't exist yet, proceed with full initialization
    }

    console.log('[DB] Running PostgreSQL initialization...');
    const schemaPath = path.join(__dirname, 'schema-pg.sql');
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf-8');
      await pool.query(schema);
      console.log('  ✓ PostgreSQL Schema applied');
    }

    // Check if seeded
    const countRes = await pool.query('SELECT COUNT(*) as c FROM components');
    const count = parseInt(countRes.rows[0].c, 10);
    if (count === 0) {
      console.log('  ⚠ PostgreSQL Database is empty. Running seed...');
      const bcrypt = require('bcryptjs');
      const adminHash = bcrypt.hashSync('admin123', 10);
      const evalHash = bcrypt.hashSync('eval123', 10);
      const studentHash = bcrypt.hashSync('student123', 10);

      // Components
      await pool.query(`
        INSERT INTO components (name, display_name, weight, max_raw_score, question_type_mix) VALUES
          ('technical', 'Technical', 3, 500, '{"mcq":15,"subjective":10,"programming":25}'),
          ('aptitude', 'Logical & Aptitude', 3, 500, '{"mcq":35,"subjective":15}'),
          ('oral_english', 'Oral English', 2, 500, '{"oral_task":50}'),
          ('written_english', 'Written English', 2, 500, '{"mcq":15,"subjective":20,"writing_task":15}')
        ON CONFLICT DO NOTHING;
      `);

      // Users
      await pool.query('INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', ['Admin', 'admin@cas.local', adminHash, 'admin']);
      await pool.query('INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', ['Evaluator', 'evaluator@cas.local', evalHash, 'evaluator']);

      const students = [
        ['Alice Johnson', 'alice@cas.local', 'STU001'],
        ['Bob Smith', 'bob@cas.local', 'STU002'],
        ['Charlie Brown', 'charlie@cas.local', 'STU003'],
        ['Diana Lee', 'diana@cas.local', 'STU004'],
        ['Eva Martinez', 'eva@cas.local', 'STU005'],
      ];
      for (const [name, email, roll] of students) {
        await pool.query('INSERT INTO users (name, email, password_hash, role, roll_no) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING', [name, email, studentHash, 'student', roll]);
      }

      // Exams (10 per component)
      const comps = (await pool.query('SELECT * FROM components ORDER BY id')).rows;
      const names = { technical: 'Technical Exam', aptitude: 'Aptitude Exam', oral_english: 'Oral English Exam', written_english: 'Written English Exam' };
      const durs = { technical: 60, aptitude: 60, oral_english: 30, written_english: 60 };
      for (const c of comps) {
        for (let i = 1; i <= 10; i++) {
          await pool.query(
            'INSERT INTO exams (component_id, exam_number, title, total_marks, duration_minutes, question_type_mix) VALUES ($1, $2, $3, 50, $4, $5) ON CONFLICT DO NOTHING',
            [c.id, i, `${names[c.name]} ${i}`, durs[c.name], c.question_type_mix]
          );
        }
      }
      console.log('  ✓ PostgreSQL Database seeded (admin@cas.local / admin123)');
    } else {
      console.log('  ✓ PostgreSQL Database ready');
    }
  } else {
    console.log('[DB] Running SQLite initialization...');
    const db = getSqliteDb();
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf-8');
      db.exec(schema);
      console.log('  ✓ SQLite Schema applied');

      // Run migrations/populate same as before
      try { db.exec("ALTER TABLE exams ADD COLUMN access_code TEXT;"); } catch (e) {}
      try { db.exec("ALTER TABLE exams ADD COLUMN timer_enabled INTEGER DEFAULT 1;"); } catch (e) {}
      try { db.exec("ALTER TABLE exams ADD COLUMN access_code_expires_at DATETIME;"); } catch (e) {}
      try { db.exec("ALTER TABLE exams ADD COLUMN start_time DATETIME;"); } catch (e) {}
      try { db.exec("ALTER TABLE users ADD COLUMN active_session_id TEXT;"); } catch (e) {}
      try { db.exec("ALTER TABLE exam_sessions ADD COLUMN remarks TEXT;"); } catch (e) {}

      const unassignedExams = db.prepare("SELECT id FROM exams WHERE access_code IS NULL OR access_code = '' OR access_code_expires_at IS NULL").all();
      if (unassignedExams.length > 0) {
        const stmt = db.prepare("UPDATE exams SET access_code = COALESCE(access_code, ?), access_code_expires_at = ? WHERE id = ?");
        for (const e of unassignedExams) {
          const code = Math.random().toString(36).substring(2, 8).toUpperCase();
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          stmt.run(code, expiresAt, e.id);
        }
      }
    }

    const count = db.prepare('SELECT COUNT(*) as c FROM components').get();
    if (count.c === 0) {
      console.log('  ⚠ SQLite Database is empty. Running seed...');
      const bcrypt = require('bcryptjs');
      const adminHash = bcrypt.hashSync('admin123', 10);
      const evalHash = bcrypt.hashSync('eval123', 10);
      const studentHash = bcrypt.hashSync('student123', 10);

      db.exec(`
        INSERT INTO components (name, display_name, weight, max_raw_score, question_type_mix) VALUES
          ('technical', 'Technical', 3, 500, '{"mcq":15,"subjective":10,"programming":25}'),
          ('aptitude', 'Logical & Aptitude', 3, 500, '{"mcq":35,"subjective":15}'),
          ('oral_english', 'Oral English', 2, 500, '{"oral_task":50}'),
          ('written_english', 'Written English', 2, 500, '{"mcq":15,"subjective":20,"writing_task":15}');
      `);

      db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('Admin', 'admin@cas.local', adminHash, 'admin');
      db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('Evaluator', 'evaluator@cas.local', evalHash, 'evaluator');

      const students = [
        ['Alice Johnson', 'alice@cas.local', 'STU001'],
        ['Bob Smith', 'bob@cas.local', 'STU002'],
        ['Charlie Brown', 'charlie@cas.local', 'STU003'],
      ];
      for (const [name, email, roll] of students) {
        db.prepare('INSERT INTO users (name, email, password_hash, role, roll_no) VALUES (?, ?, ?, ?, ?)').run(name, email, studentHash, 'student', roll);
      }

      const comps = db.prepare('SELECT * FROM components ORDER BY id').all();
      const names = { technical: 'Technical Exam', aptitude: 'Aptitude Exam', oral_english: 'Oral English Exam', written_english: 'Written English Exam' };
      const durs = { technical: 60, aptitude: 60, oral_english: 30, written_english: 60 };
      for (const c of comps) {
        for (let i = 1; i <= 10; i++) {
          db.prepare('INSERT INTO exams (component_id, exam_number, title, total_marks, duration_minutes, question_type_mix) VALUES (?, ?, ?, 50, ?, ?)').run(
            c.id, i, `${names[c.name]} ${i}`, durs[c.name], c.question_type_mix
          );
        }
      }
      console.log('  ✓ SQLite Database seeded (admin@cas.local / admin123)');
    } else {
      console.log('  ✓ SQLite Database ready');
    }
  }
}

function closeDb() {
  if (_pgPool) {
    _pgPool.end();
    _pgPool = null;
  }
  if (_sqliteDb) {
    _sqliteDb.close();
    _sqliteDb = null;
  }
}

module.exports = {
  getDb,
  initDb,
  closeDb,
  isPg,
};
