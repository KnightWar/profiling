/**
 * Admin Routes — Student, Exam, and Dashboard Management
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const { getDb } = require('../db/database');
const { requireRole } = require('../middleware/roles');
const { parseStudentCSV } = require('../services/questionParser');
const XLSX = require('xlsx');
const os = require('os');

const router = express.Router();
const upload = multer({ dest: os.tmpdir() });

// All admin routes require admin role
router.use(requireRole('admin'));

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════

// ─── GET /api/admin/dashboard ───────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  const db = getDb();

  const totalStudents = (await db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'student'").get()).c;
  const totalExams = (await db.prepare('SELECT COUNT(*) as c FROM exams').get()).c;
  const publishedExams = (await db.prepare('SELECT COUNT(*) as c FROM exams WHERE is_published = 1').get()).c;
  const totalQuestions = (await db.prepare('SELECT COUNT(*) as c FROM questions').get()).c;
  const pendingReview = (await db.prepare("SELECT COUNT(*) as c FROM responses WHERE status IN ('submitted', 'pending_review')").get()).c;

  const components = await db.prepare('SELECT * FROM components ORDER BY id').all();

  const levelDistribution = await db.prepare(`
    SELECT level, COUNT(*) as count
    FROM composite_scores
    WHERE level IS NOT NULL
    GROUP BY level
    ORDER BY level
  `).all();

  const recentSessions = await db.prepare(`
    SELECT es.*, u.name as student_name, e.title as exam_title
    FROM exam_sessions es
    JOIN users u ON u.id = es.student_id
    JOIN exams e ON e.id = es.exam_id
    ORDER BY es.started_at DESC
    LIMIT 10
  `).all();

  res.json({
    stats: {
      totalStudents,
      totalExams,
      publishedExams,
      totalQuestions,
      pendingReview,
    },
    components,
    levelDistribution,
    recentSessions,
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// STUDENT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

// ─── GET /api/admin/students ────────────────────────────────────────────────
router.get('/students', async (req, res) => {
  const db = getDb();
  const { search, page = 1, limit = 50, batch_id } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let sql = `
    SELECT u.id, u.name, u.email, u.roll_no, u.phone, u.active, u.created_at,
           cs.total_score, cs.level,
           GROUP_CONCAT(b.name, ', ') as batches
    FROM users u
    LEFT JOIN composite_scores cs ON cs.student_id = u.id
    LEFT JOIN student_batches sb ON sb.student_id = u.id
    LEFT JOIN batches b ON b.id = sb.batch_id
    WHERE u.role = 'student'
  `;
  let countSql = `
    SELECT COUNT(DISTINCT u.id) as c
    FROM users u
    LEFT JOIN student_batches sb ON sb.student_id = u.id
    WHERE u.role = 'student'
  `;
  const params = [];
  const countParams = [];

  if (batch_id) {
    sql += ` AND sb.batch_id = ?`;
    countSql += ` AND sb.batch_id = ?`;
    params.push(parseInt(batch_id));
    countParams.push(parseInt(batch_id));
  }

  if (search) {
    sql += ` AND (u.name LIKE ? OR u.email LIKE ? OR u.roll_no LIKE ?)`;
    countSql += ` AND (u.name LIKE ? OR u.email LIKE ? OR u.roll_no LIKE ?)`;
    const term = `%${search}%`;
    params.push(term, term, term);
    countParams.push(term, term, term);
  }

  sql += ` GROUP BY u.id ORDER BY u.name ASC LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), offset);

  const students = await db.prepare(sql).all(...params);
  const total = (await db.prepare(countSql).get(...countParams)).c;

  res.json({ students, total, page: parseInt(page), limit: parseInt(limit) });
});

// ─── POST /api/admin/students ───────────────────────────────────────────────
router.post('/students', async (req, res) => {
  try {
    const { name, roll_no, reg_no, email, password, phone } = req.body;
    const cleanRoll = (roll_no || reg_no || '').trim();

    if (!name || !cleanRoll) {
      return res.status(400).json({ error: 'Student Name and Registration / Roll Number are required' });
    }

    const db = getDb();
    const cleanEmail = email ? email.toLowerCase().trim() : `${cleanRoll.toLowerCase()}@student.local`;

    const existing = await db.prepare('SELECT id FROM users WHERE LOWER(roll_no) = ? OR LOWER(email) = ?').get(cleanRoll.toLowerCase(), cleanEmail);
    if (existing) {
      return res.status(409).json({ error: 'Student with this Registration / Roll Number already exists' });
    }

    const hash = await bcrypt.hash(password || 'student123', 10);
    const result = await db.prepare(
      'INSERT INTO users (name, email, password_hash, role, roll_no, phone) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(name.trim(), cleanEmail, hash, 'student', cleanRoll, phone || null);

    res.status(201).json({
      message: 'Student created',
      student: { id: result.lastInsertRowid, name: name.trim(), email: cleanEmail, roll_no: cleanRoll },
    });
  } catch (err) {
    console.error('Create student error:', err);
    res.status(500).json({ error: 'Failed to create student' });
  }
});

// ─── POST /api/admin/students/bulk ──────────────────────────────────────────
router.post('/students/bulk', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Excel (.xlsx) or CSV (.csv) file required' });
    }

    const { batch_id } = req.body;
    let parsedBatchId = null;
    if (batch_id) {
      parsedBatchId = parseInt(batch_id);
    }

    const { parseStudentFile } = require('../services/questionParser');
    const students = parseStudentFile(req.file.path, req.file.originalname);
    const db = getDb();
    let created = 0;
    let skipped = 0;
    const errors = [];

    db.transaction(async () => {
      for (const s of students) {
        try {
          const cleanRoll = (s.roll_no || '').trim();
          const cleanEmail = (s.email || '').toLowerCase().trim();

          if (!cleanRoll) {
            skipped++;
            continue;
          }

          let studentId = null;
          const existing = await db.prepare(
            'SELECT id FROM users WHERE LOWER(roll_no) = ? OR LOWER(email) = ?'
          ).get(cleanRoll.toLowerCase(), cleanEmail);

          if (existing) {
            studentId = existing.id;
            skipped++;
          } else {
            const hash = bcrypt.hashSync(s.password || 'student123', 10);
            const res = await db.prepare(
              'INSERT INTO users (name, email, password_hash, role, roll_no, phone) VALUES (?, ?, ?, ?, ?, ?)'
            ).run(s.name || cleanRoll, cleanEmail, hash, 'student', cleanRoll, s.phone || null);
            studentId = res.lastInsertRowid;
            created++;
          }

          if (parsedBatchId && studentId) {
            await db.prepare('INSERT OR IGNORE INTO student_batches (student_id, batch_id) VALUES (?, ?)').run(studentId, parsedBatchId);
          }
        } catch (e) {
          errors.push({ student: s.roll_no || s.name, error: e.message });
        }
      }
    })();

    // Clean up temp file
    const fs = require('fs');
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.json({ message: `Successfully imported ${created} students (${skipped} skipped/duplicate)`, created, skipped, errors });
  } catch (err) {
    console.error('Bulk import error:', err);
    res.status(500).json({ error: 'Bulk import failed' });
  }
});

// ─── PUT /api/admin/students/:id ────────────────────────────────────────────
router.put('/students/:id', async (req, res) => {
  try {
    const { name, email, roll_no, phone, active, password } = req.body;
    const db = getDb();

    const student = await db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(req.params.id);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name.trim()); }
    if (email !== undefined) { updates.push('email = ?'); params.push(email.toLowerCase().trim()); }
    if (roll_no !== undefined) { updates.push('roll_no = ?'); params.push(roll_no); }
    if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
    if (active !== undefined) { updates.push('active = ?'); params.push(active ? 1 : 0); }
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      updates.push('password_hash = ?');
      params.push(hash);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(req.params.id);
    await db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    res.json({ message: 'Student updated' });
  } catch (err) {
    console.error('Update student error:', err);
    res.status(500).json({ error: 'Failed to update student' });
  }
});

// ─── DELETE /api/admin/students/:id/exams ───────────────────────────────
router.delete('/students/:id/exams', async (req, res) => {
  const db = getDb();
  const student = await db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  try {
    const deleteTx = db.transaction(async () => {
      await db.prepare('DELETE FROM composite_scores WHERE student_id = ?').run(req.params.id);
      await db.prepare('DELETE FROM component_totals WHERE student_id = ?').run(req.params.id);
      await db.prepare('DELETE FROM scores WHERE response_id IN (SELECT id FROM responses WHERE student_id = ?)').run(req.params.id);
      await db.prepare('DELETE FROM responses WHERE student_id = ?').run(req.params.id);
      await db.prepare('DELETE FROM exam_sessions WHERE student_id = ?').run(req.params.id);
      await db.prepare('DELETE FROM violations WHERE student_id = ?').run(req.params.id);
      // Reset active session ID just in case
      await db.prepare('UPDATE users SET active_session_id = NULL WHERE id = ?').run(req.params.id);
    });
    await deleteTx();
    res.json({ message: 'All exams and scores for this student have been reset.' });
  } catch (err) {
    console.error('Reset exams error:', err);
    res.status(500).json({ error: 'Failed to reset exams' });
  }
});

// ─── DELETE /api/admin/students/:id ─────────────────────────────────────────
router.delete('/students/:id', async (req, res) => {
  const db = getDb();
  const student = await db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(req.params.id);
  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  // Hard delete student and clean up all associated records in DB
  const deleteTx = db.transaction(async () => {
    await db.prepare('DELETE FROM composite_scores WHERE student_id = ?').run(req.params.id);
    await db.prepare('DELETE FROM component_totals WHERE student_id = ?').run(req.params.id);
    await db.prepare('DELETE FROM scores WHERE response_id IN (SELECT id FROM responses WHERE student_id = ?)').run(req.params.id);
    await db.prepare('DELETE FROM responses WHERE student_id = ?').run(req.params.id);
    await db.prepare('DELETE FROM exam_sessions WHERE student_id = ?').run(req.params.id);
    await db.prepare('DELETE FROM violations WHERE student_id = ?').run(req.params.id);
    await db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  });
  await deleteTx();

  res.json({ message: 'Student permanently deleted from database' });
});

// ─── POST /api/admin/students/bulk-delete ───────────────────────────────────
router.post('/students/bulk-delete', async (req, res) => {
  const { student_ids } = req.body;
  if (!Array.isArray(student_ids) || student_ids.length === 0) {
    return res.status(400).json({ error: 'No students selected' });
  }

  const db = getDb();
  try {
    const deleteTx = db.transaction(async (ids) => {
      for (const id of ids) {
        await db.prepare('DELETE FROM composite_scores WHERE student_id = ?').run(id);
        await db.prepare('DELETE FROM component_totals WHERE student_id = ?').run(id);
        await db.prepare('DELETE FROM scores WHERE response_id IN (SELECT id FROM responses WHERE student_id = ?)').run(id);
        await db.prepare('DELETE FROM responses WHERE student_id = ?').run(id);
        await db.prepare('DELETE FROM exam_sessions WHERE student_id = ?').run(id);
        await db.prepare('DELETE FROM violations WHERE student_id = ?').run(id);
        await db.prepare('DELETE FROM student_batches WHERE student_id = ?').run(id);
        await db.prepare("DELETE FROM users WHERE id = ? AND role = 'student'").run(id);
      }
    });
    await deleteTx(student_ids);
    res.json({ message: `Successfully deleted ${student_ids.length} students` });
  } catch (err) {
    console.error('Bulk delete error:', err);
    res.status(500).json({ error: 'Failed to delete students' });
  }
});

// ─── POST /api/admin/students/bulk-batch ────────────────────────────────────
router.post('/students/bulk-batch', async (req, res) => {
  const { student_ids, batch_id } = req.body;
  if (!Array.isArray(student_ids) || student_ids.length === 0 || !batch_id) {
    return res.status(400).json({ error: 'Missing students or batch ID' });
  }

  const db = getDb();
  try {
    const assignTx = db.transaction(async (ids, bId) => {
      const stmt = db.prepare('INSERT OR IGNORE INTO student_batches (student_id, batch_id) VALUES (?, ?)');
      for (const id of ids) {
        await stmt.run(id, bId);
      }
    });
    await assignTx(student_ids, batch_id);
    res.json({ message: `Successfully assigned ${student_ids.length} students to batch` });
  } catch (err) {
    console.error('Bulk batch assign error:', err);
    res.status(500).json({ error: 'Failed to assign batches' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// EXAM MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

// ─── GET /api/admin/components ──────────────────────────────────────────────
router.get('/components', async (req, res) => {
  const db = getDb();
  const components = await db.prepare('SELECT * FROM components ORDER BY id').all();
  res.json({ components });
});

// ─── GET /api/admin/exams ───────────────────────────────────────────────────
router.get('/exams', async (req, res) => {
  const db = getDb();
  const { component_id } = req.query;

  let sql = `
    SELECT e.*, c.display_name as component_name, c.weight as component_weight,
           (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) as question_count,
           (SELECT COALESCE(SUM(q.marks), 0) FROM questions q WHERE q.exam_id = e.id) as total_question_marks
    FROM exams e
    JOIN components c ON c.id = e.component_id
  `;
  const params = [];

  if (component_id) {
    sql += ' WHERE e.component_id = ?';
    params.push(parseInt(component_id));
  }

  sql += ' ORDER BY e.component_id, e.exam_number';
  const exams = await db.prepare(sql).all(...params);

  res.json({ exams });
});

// ─── POST /api/admin/exams ──────────────────────────────────────────────────
router.post('/exams', async (req, res) => {
  try {
    const { component_id, exam_number, title, total_marks, duration_minutes, instructions } = req.body;

    if (!component_id || !exam_number) {
      return res.status(400).json({ error: 'component_id and exam_number are required' });
    }

    const db = getDb();
    const component = await db.prepare('SELECT * FROM components WHERE id = ?').get(component_id);
    if (!component) {
      return res.status(404).json({ error: 'Component not found' });
    }

    const result = await db.prepare(`
      INSERT INTO exams (component_id, exam_number, title, total_marks, duration_minutes, question_type_mix, instructions)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      component_id,
      exam_number,
      title || `${component.display_name} Exam ${exam_number}`,
      total_marks || 50,
      duration_minutes || 60,
      component.question_type_mix,
      instructions || null
    );

    res.status(201).json({ message: 'Exam created', exam_id: result.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Exam number already exists for this component' });
    }
    console.error('Create exam error:', err);
    res.status(500).json({ error: 'Failed to create exam' });
  }
});

// ─── PUT /api/admin/exams/:id ───────────────────────────────────────────────
router.put('/exams/:id', async (req, res) => {
  try {
    const { title, duration_minutes, timer_enabled, is_published, instructions, access_code, start_time } = req.body;
    const db = getDb();

    const exam = await db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id);
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    const updates = [];
    const params = [];

    if (title !== undefined) { updates.push('title = ?'); params.push(title); }

    let newDuration = exam.duration_minutes;
    if (duration_minutes !== undefined) {
      updates.push('duration_minutes = ?');
      params.push(duration_minutes);
      newDuration = duration_minutes;
    }

    let newStartTime = exam.start_time;
    if (start_time !== undefined) {
      updates.push('start_time = ?');
      params.push(start_time);
      newStartTime = start_time;
    }

    // Auto calculate access_code_expires_at based on start_time and duration
    if ((start_time !== undefined || duration_minutes !== undefined) && newStartTime) {
      const expiresAt = new Date(new Date(newStartTime).getTime() + newDuration * 60000).toISOString();
      updates.push('access_code_expires_at = ?');
      params.push(expiresAt);
    }

    if (timer_enabled !== undefined) { updates.push('timer_enabled = ?'); params.push(timer_enabled ? 1 : 0); }
    if (is_published !== undefined) { updates.push('is_published = ?'); params.push(is_published ? 1 : 0); }
    if (instructions !== undefined) { updates.push('instructions = ?'); params.push(instructions); }
    if (access_code !== undefined) { updates.push('access_code = ?'); params.push(access_code.trim().toUpperCase()); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(req.params.id);
    await db.prepare(`UPDATE exams SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    res.json({ message: 'Exam updated' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Access code is already used by another exam' });
    }
    console.error('Update exam error:', err);
    res.status(500).json({ error: 'Failed to update exam' });
  }
});

// ─── GET /api/admin/exams/:id/export ─────────────────────────────────────────
router.get('/exams/:id/export', async (req, res) => {
  try {
    const db = getDb();
    const examId = req.params.id;

    const exam = await db.prepare(`
      SELECT e.title, e.total_marks, c.name as component_name 
      FROM exams e 
      JOIN components c ON e.component_id = c.id 
      WHERE e.id = ?
    `).get(examId);

    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    const results = await db.prepare(`
      SELECT 
        u.name as student_name, 
        u.roll_no, 
        b.name as batch_name,
        SUM(s.marks_awarded) as score
      FROM users u
      LEFT JOIN student_batches sb ON sb.student_id = u.id
      LEFT JOIN batches b ON b.id = sb.batch_id
      LEFT JOIN responses r ON r.student_id = u.id AND r.exam_id = ?
      LEFT JOIN scores s ON s.response_id = r.id
      WHERE u.role = 'student'
      GROUP BY u.id
      ORDER BY u.name ASC
    `).all(examId);

    const exportData = results.map(row => ({
      'Student Name': row.student_name,
      'Reg No': row.roll_no || 'N/A',
      'Topics of Exam': exam.component_name + ' - ' + exam.title,
      'Batch Group': row.batch_name || 'Unassigned',
      'Score': row.score !== null ? row.score : 'Pending/Not Attempted',
      'Max Score': exam.total_marks
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Scores');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const safeTitle = (exam.component_name + '_' + exam.title).replace(/[^a-z0-9]/gi, '_');
    res.setHeader('Content-Disposition', `attachment; filename="Exam_Scores_${safeTitle}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    console.error('Export exam scores error:', err);
    res.status(500).json({ error: 'Failed to export scores' });
  }
});

// ─── POST /api/admin/exams/:id/access-code ──────────────────────────────────
router.post('/exams/:id/access-code', async (req, res) => {
  try {
    const { valid_hours = 2 } = req.body;
    const db = getDb();
  const exam = await db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id);
  if (!exam) {
    return res.status(404).json({ error: 'Exam not found' });
  }

  const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  const hours = parseFloat(valid_hours) || 2;
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

  await db.prepare('UPDATE exams SET access_code = ?, access_code_expires_at = ? WHERE id = ?').run(newCode, expiresAt, req.params.id);

  res.json({ message: `Access code generated (valid for ${hours}h)`, access_code: newCode, expires_at: expiresAt });
} catch (err) {
  console.error('Generate access code error:', err);
  res.status(500).json({ error: 'Failed to generate access code' });
}
});

// ═══════════════════════════════════════════════════════════════════════════
// BATCH / GROUP MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/admin/batches — List all batches with student & exam counts
router.get('/batches', async (req, res) => {
  try {
    const db = getDb();
    const batches = await db.prepare(`
      SELECT b.*,
             (SELECT COUNT(*) FROM student_batches sb WHERE sb.batch_id = b.id) as student_count,
             (SELECT COUNT(*) FROM exam_batches eb WHERE eb.batch_id = b.id) as exam_count
      FROM batches b
      ORDER BY b.name ASC
    `).all();
    res.json({ batches });
  } catch (err) {
    console.error('Get batches error:', err);
    res.status(500).json({ error: 'Failed to fetch batches' });
  }
});

// POST /api/admin/batches — Create a batch
router.post('/batches', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Batch Name is required' });
    }
    const db = getDb();
    const result = await db.prepare('INSERT INTO batches (name, description) VALUES (?, ?)').run(name.trim(), description || null);
    res.status(201).json({ message: 'Batch created', batch_id: result.lastInsertRowid });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Batch with this name already exists' });
    }
    console.error('Create batch error:', err);
    res.status(500).json({ error: 'Failed to create batch' });
  }
});

// PUT /api/admin/batches/:id — Edit a batch
router.put('/batches/:id', async (req, res) => {
  try {
    const { name, description } = req.body;
    const db = getDb();
    await db.prepare('UPDATE batches SET name = COALESCE(?, name), description = COALESCE(?, description) WHERE id = ?').run(name ? name.trim() : null, description !== undefined ? description : null, req.params.id);
    res.json({ message: 'Batch updated' });
  } catch (err) {
    console.error('Update batch error:', err);
    res.status(500).json({ error: 'Failed to update batch' });
  }
});

// DELETE /api/admin/batches/:id — Delete a batch
router.delete('/batches/:id', async (req, res) => {
  try {
    const db = getDb();
    db.transaction(async () => {
      await db.prepare('DELETE FROM student_batches WHERE batch_id = ?').run(req.params.id);
      await db.prepare('DELETE FROM exam_batches WHERE batch_id = ?').run(req.params.id);
      await db.prepare('DELETE FROM batches WHERE id = ?').run(req.params.id);
    })();
    res.json({ message: 'Batch deleted' });
  } catch (err) {
    console.error('Delete batch error:', err);
    res.status(500).json({ error: 'Failed to delete batch' });
  }
});

// GET /api/admin/batches/:id/students — Get student IDs in a batch
router.get('/batches/:id/students', async (req, res) => {
  try {
    const db = getDb();
    const students = await db.prepare(`
      SELECT u.id, u.name, u.roll_no, u.email
      FROM users u
      JOIN student_batches sb ON sb.student_id = u.id
      WHERE sb.batch_id = ? AND u.role = 'student'
      ORDER BY u.name ASC
    `).all(req.params.id);
    res.json({ students });
  } catch (err) {
    console.error('Get batch students error:', err);
    res.status(500).json({ error: 'Failed to fetch batch students' });
  }
});

// POST /api/admin/batches/:id/students — Assign students to batch
router.post('/batches/:id/students', async (req, res) => {
  try {
    const { student_ids = [] } = req.body;
    const db = getDb();
    const batchId = req.params.id;

    db.transaction(async () => {
      await db.prepare('DELETE FROM student_batches WHERE batch_id = ?').run(batchId);
      const stmt = await db.prepare('INSERT OR IGNORE INTO student_batches (student_id, batch_id) VALUES (?, ?)');
      for (const sid of student_ids) {
        stmt.run(sid, batchId);
      }
    })();

    res.json({ message: `Assigned ${student_ids.length} students to batch` });
  } catch (err) {
    console.error('Assign batch students error:', err);
    res.status(500).json({ error: 'Failed to assign students to batch' });
  }
});

// GET /api/admin/exams/:id/batches — Get batch IDs assigned to an exam
router.get('/exams/:id/batches', async (req, res) => {
  try {
    const db = getDb();
    const batches = await db.prepare(`
      SELECT b.id, b.name, b.description
      FROM batches b
      JOIN exam_batches eb ON eb.batch_id = b.id
      WHERE eb.exam_id = ?
    `).all(req.params.id);
    res.json({ batches });
  } catch (err) {
    console.error('Get exam batches error:', err);
    res.status(500).json({ error: 'Failed to fetch exam batches' });
  }
});

// POST /api/admin/exams/:id/batches — Assign batch IDs to an exam
router.post('/exams/:id/batches', async (req, res) => {
  try {
    const { batch_ids = [] } = req.body;
    const db = getDb();
    const examId = req.params.id;

    db.transaction(async () => {
      // Remove all batches currently assigned to THIS exam
      await db.prepare('DELETE FROM exam_batches WHERE exam_id = ?').run(examId);

      const removeBatchFromOtherExams = db.prepare('DELETE FROM exam_batches WHERE batch_id = ?');
      const stmt = db.prepare('INSERT OR IGNORE INTO exam_batches (exam_id, batch_id) VALUES (?, ?)');

      for (const bid of batch_ids) {
        // Enforce one exam per batch: remove this batch from any other exams
        await removeBatchFromOtherExams.run(bid);
        await stmt.run(examId, bid);
      }
    })();

    res.json({ message: `Assigned ${batch_ids.length} batches to exam` });
  } catch (err) {
    console.error('Assign exam batches error:', err);
    res.status(500).json({ error: 'Failed to assign batches to exam' });
  }
});

module.exports = router;
