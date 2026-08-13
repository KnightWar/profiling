/**
 * Seed Runner — Generates proper bcrypt hashes and seeds the database
 * Run: node src/db/seed-runner.js
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { initDb, getDb, closeDb } = require('./database');
const path = require('path');
const fs = require('fs');

async function seed() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  Seed Runner');
  console.log('══════════════════════════════════════════════\n');

  // Initialize schema
  const db = getDb();
  const schemaPath = path.join(__dirname, 'schema.sql');
  db.exec(fs.readFileSync(schemaPath, 'utf-8'));
  console.log('✓ Schema applied');

  // Check if already seeded
  const existing = db.prepare('SELECT COUNT(*) as c FROM users').get();
  if (existing.c > 0) {
    console.log('✓ Database already has data. Skipping seed.');
    closeDb();
    return;
  }

  // Hash passwords
  const adminHash = await bcrypt.hash('admin123', 10);
  const evalHash = await bcrypt.hash('eval123', 10);
  const studentHash = await bcrypt.hash('student123', 10);

  // Seed components
  db.prepare(`
    INSERT INTO components (name, display_name, weight, max_raw_score, question_type_mix) VALUES
    ('technical', 'Technical', 3, 500, '{"mcq":15,"subjective":10,"programming":25}')
  `).run();
  db.prepare(`
    INSERT INTO components (name, display_name, weight, max_raw_score, question_type_mix) VALUES
    ('aptitude', 'Logical & Aptitude', 3, 500, '{"mcq":35,"subjective":15}')
  `).run();
  db.prepare(`
    INSERT INTO components (name, display_name, weight, max_raw_score, question_type_mix) VALUES
    ('oral_english', 'Oral English', 2, 500, '{"oral_task":50}')
  `).run();
  db.prepare(`
    INSERT INTO components (name, display_name, weight, max_raw_score, question_type_mix) VALUES
    ('written_english', 'Written English', 2, 500, '{"mcq":15,"subjective":20,"writing_task":15}')
  `).run();
  console.log('✓ Components seeded (4 components, weights 3:3:2:2)');

  // Seed users
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('Admin', 'admin@cas.local', adminHash, 'admin');
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('Evaluator', 'evaluator@cas.local', evalHash, 'evaluator');

  const students = [
    { name: 'Alice Johnson', email: 'alice@cas.local', roll: 'STU001' },
    { name: 'Bob Smith', email: 'bob@cas.local', roll: 'STU002' },
    { name: 'Charlie Brown', email: 'charlie@cas.local', roll: 'STU003' },
    { name: 'Diana Lee', email: 'diana@cas.local', roll: 'STU004' },
    { name: 'Eva Martinez', email: 'eva@cas.local', roll: 'STU005' },
  ];

  for (const s of students) {
    db.prepare('INSERT INTO users (name, email, password_hash, role, roll_no) VALUES (?, ?, ?, ?, ?)').run(s.name, s.email, studentHash, 'student', s.roll);
  }
  console.log(`✓ Users seeded (1 admin, 1 evaluator, ${students.length} students)`);

  // Seed exams (10 per component)
  const components = db.prepare('SELECT * FROM components ORDER BY id').all();
  const examTitles = {
    technical: 'Technical Exam',
    aptitude: 'Aptitude Exam',
    oral_english: 'Oral English Exam',
    written_english: 'Written English Exam',
  };
  const durations = {
    technical: 60, aptitude: 60, oral_english: 30, written_english: 60,
  };

  for (const c of components) {
    for (let i = 1; i <= 10; i++) {
      db.prepare(`
        INSERT INTO exams (component_id, exam_number, title, total_marks, duration_minutes, question_type_mix)
        VALUES (?, ?, ?, 50, ?, ?)
      `).run(c.id, i, `${examTitles[c.name]} ${i}`, durations[c.name], c.question_type_mix);
    }
  }
  console.log('✓ Exams seeded (40 total: 10 per component)');

  closeDb();
  console.log('\n✓ Seed complete!\n');
  console.log('Credentials:');
  console.log('  Admin:     admin@cas.local / admin123');
  console.log('  Evaluator: evaluator@cas.local / eval123');
  console.log('  Students:  alice@cas.local / student123 (and bob, charlie, diana, eva)\n');
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
