/**
 * Score Routes — Composite scores, reports, exports
 */

const express = require('express');
const { getDb } = require('../db/database');
const { requireRole } = require('../middleware/roles');
const { recomputeAllStudents, recomputeAllForStudent, WEIGHTS, COMPOSITE_MAX } = require('../services/scoring');
const { analyzeAiContent } = require('../services/aiDetector');

const router = express.Router();

// ─── GET /api/scores/all ────────────────────────────────────────────────────
// All composite scores (admin only)
router.get('/all', requireRole('admin'), async (req, res, next) => {
  try {
    // Auto-sync scores across all students for fresh data
    try { await recomputeAllStudents(); } catch (e) { console.error('Auto sync scores error:', e); }

    const db = getDb();
    const { level, sort = 'total_score', order = 'desc', search } = req.query;

    let sql = `
      SELECT cs.*, u.name, u.email, u.roll_no
      FROM composite_scores cs
      JOIN users u ON u.id = cs.student_id
      WHERE 1=1
    `;
    const params = [];

    if (level) {
      sql += ' AND cs.level = ?';
      params.push(parseInt(level));
    }

    if (search) {
      sql += ' AND (u.name LIKE ? OR u.roll_no LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const validSorts = ['total_score', 'name', 't_score', 'l_score', 'o_score', 'w_score', 'level'];
    const sortCol = validSorts.includes(sort)
      ? (sort === 'name' ? 'u.name' : `cs.${sort}`)
      : 'cs.total_score';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

    sql += ` ORDER BY ${sortCol} ${sortOrder}`;

    const scores = await db.prepare(sql).all(...params);

    // Summary stats
    const summary = await db.prepare(`
      SELECT
        COUNT(*) as total_students,
        ROUND(CAST(AVG(total_score) AS NUMERIC), 1) as avg_score,
        MAX(total_score) as max_score,
        MIN(total_score) as min_score,
        COUNT(CASE WHEN level = 3 THEN 1 END) as level_3_count,
        COUNT(CASE WHEN level = 2 THEN 1 END) as level_2_count,
        COUNT(CASE WHEN level = 1 THEN 1 END) as level_1_count
      FROM composite_scores
    `).get();

    res.json({
      scores,
      summary,
      weights: WEIGHTS,
      compositeMax: COMPOSITE_MAX,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/scores/student/:id ────────────────────────────────────────────
// Detailed score for a specific student (admin)
router.get('/student/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const studentId = req.params.id;
    try { await recomputeAllForStudent(studentId); } catch (e) { console.error('Student score recompute error:', e); }

    const db = getDb();
    const student = await db.prepare('SELECT id, name, email, roll_no FROM users WHERE id = ?').get(studentId);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const componentTotals = await db.prepare(`
      SELECT ct.*, c.display_name, c.weight, c.max_raw_score
      FROM component_totals ct
      JOIN components c ON c.id = ct.component_id
      WHERE ct.student_id = ?
      ORDER BY c.id
    `).all(studentId);

    const composite = await db.prepare('SELECT * FROM composite_scores WHERE student_id = ?').get(studentId);

    const examBreakdown = await db.prepare(`
      SELECT e.id, e.title, e.exam_number, e.total_marks,
             c.display_name as component_name,
             es.status as session_status,
             COALESCE(SUM(s.marks_awarded), 0) as marks_obtained,
             COUNT(r.id) as responses_count,
             COUNT(s.id) as scored_count
      FROM exams e
      JOIN components c ON c.id = e.component_id
      LEFT JOIN exam_sessions es ON es.exam_id = e.id AND es.student_id = ?
      LEFT JOIN responses r ON r.exam_id = e.id AND r.student_id = ?
      LEFT JOIN scores s ON s.response_id = r.id
      GROUP BY e.id, c.display_name, c.id, es.status
      ORDER BY c.id, e.exam_number
    `).all(studentId, studentId);

    // Fetch individual responses with AI analysis
    const responses = await db.prepare(`
      SELECT r.id, r.question_id, r.answer_data, r.submitted_at, r.status,
             q.type as question_type, q.content as question_content, q.marks as max_marks,
             s.marks_awarded
      FROM responses r
      JOIN questions q ON q.id = r.question_id
      LEFT JOIN scores s ON s.response_id = r.id
      WHERE r.student_id = ?
      ORDER BY r.submitted_at DESC
    `).all(studentId);

    const responsesWithAi = responses.map(r => ({
      ...r,
      ai_analysis: analyzeAiContent(r.answer_data),
    }));

    res.json({ student, componentTotals, composite, examBreakdown, responses: responsesWithAi });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/scores/recompute ─────────────────────────────────────────────
// Force recompute all composite scores (admin)
router.post('/recompute', requireRole('admin'), async (req, res) => {
  try {
    const results = await recomputeAllStudents();
    res.json({
      message: `Recomputed scores for ${results.length} students`,
      results,
    });
  } catch (err) {
    console.error('Recompute error:', err);
    res.status(500).json({ error: 'Recompute failed' });
  }
});

// ─── POST /api/scores/recompute/:studentId ──────────────────────────────────
// Recompute for a single student (admin)
router.post('/recompute/:studentId', requireRole('admin'), async (req, res) => {
  try {
    const result = await recomputeAllForStudent(req.params.studentId);
    res.json({ message: 'Recomputed', ...result });
  } catch (err) {
    console.error('Recompute error:', err);
    res.status(500).json({ error: 'Recompute failed' });
  }
});

// ─── GET /api/scores/export ─────────────────────────────────────────────────
// Export all scores as CSV
router.get('/export', requireRole('admin'), async (req, res, next) => {
  try {
    const db = getDb();

    const scores = await db.prepare(`
      SELECT u.name, u.email, u.roll_no,
             cs.t_score, cs.l_score, cs.o_score, cs.w_score,
             cs.total_score, cs.level, cs.computed_at
      FROM composite_scores cs
      JOIN users u ON u.id = cs.student_id
      ORDER BY cs.total_score DESC
    `).all();

    // Build CSV
    const headers = ['Name', 'Email', 'Roll No', 'Technical (/500)', 'Aptitude (/500)',
      'Oral English (/500)', 'Written English (/500)', 'Composite (/5000)', 'Level', 'Computed At'];

    let csv = headers.join(',') + '\n';
    for (const s of scores) {
      const levelName = s.level === 3 ? 'Advanced' : s.level === 2 ? 'Intermediate' : 'Foundational';
      csv += [
        `"${s.name}"`, `"${s.email}"`, `"${s.roll_no || ''}"`,
        s.t_score, s.l_score, s.o_score, s.w_score,
        s.total_score, `"Level ${s.level} - ${levelName}"`, `"${s.computed_at || ''}"`
      ].join(',') + '\n';
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=composite_scores_export.csv');
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
