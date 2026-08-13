/**
 * Evaluator Routes — Score oral + subjective responses
 */

const express = require('express');
const { getDb } = require('../db/database');
const { requireRole } = require('../middleware/roles');
const { recomputeComponentTotal, recomputeComposite } = require('../services/scoring');

const router = express.Router();

// Evaluator or admin can access
router.use(requireRole('admin', 'evaluator'));

// ─── GET /api/evaluator/queue ───────────────────────────────────────────────
// Get pending responses to score
router.get('/queue', async (req, res, next) => {
  try {
    const db = getDb();
    const { status = 'pending_review', component_id, exam_id, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let sql = `
      SELECT r.id, r.student_id, r.exam_id, r.question_id, r.answer_data, r.audio_url,
             r.submitted_at, r.status,
             u.name as student_name, u.roll_no,
             q.type as question_type, q.marks as max_marks, q.content as question_content,
             q.rubric, q.correct_answer,
             e.title as exam_title, e.exam_number,
             c.display_name as component_name, c.id as component_id,
             s.marks_awarded, s.feedback, s.scored_by
      FROM responses r
      JOIN users u ON u.id = r.student_id
      JOIN questions q ON q.id = r.question_id
      JOIN exams e ON e.id = r.exam_id
      JOIN components c ON c.id = e.component_id
      LEFT JOIN scores s ON s.response_id = r.id
      WHERE r.status IN ('submitted', 'pending_review', 'flagged')
        AND q.type IN ('subjective', 'programming', 'oral_task', 'writing_task')
    `;
    const params = [];

    if (status === 'graded') {
      sql = sql.replace(
        "r.status IN ('submitted', 'pending_review', 'flagged')",
        "r.status = 'graded'"
      );
    }

    if (component_id) {
      sql += ' AND c.id = ?';
      params.push(parseInt(component_id));
    }

    if (exam_id) {
      sql += ' AND e.id = ?';
      params.push(parseInt(exam_id));
    }

    sql += ' ORDER BY r.submitted_at ASC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const responses = await db.prepare(sql).all(...params);

    // Parse JSON fields
    const parsed = responses.map(r => ({
      ...r,
      rubric: r.rubric ? JSON.parse(r.rubric) : null,
    }));

    // Get total count
    const countSql = `
      SELECT COUNT(*) as c FROM responses r
      JOIN questions q ON q.id = r.question_id
      JOIN exams e ON e.id = r.exam_id
      WHERE r.status IN ('submitted', 'pending_review', 'flagged')
        AND q.type IN ('subjective', 'programming', 'oral_task', 'writing_task')
    `;
    const countObj = await db.prepare(countSql).get();
    const total = countObj.c;

    res.json({ responses: parsed, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/evaluator/responses/:id ───────────────────────────────────────
// Get single response detail for scoring
router.get('/responses/:id', async (req, res, next) => {
  try {
    const db = getDb();

    const response = await db.prepare(`
      SELECT r.*, u.name as student_name, u.roll_no,
             q.type as question_type, q.marks as max_marks, q.content as question_content,
             q.options, q.correct_answer, q.rubric, q.test_cases,
             e.title as exam_title, e.exam_number,
             c.display_name as component_name,
             s.marks_awarded, s.feedback, s.scored_by, s.scored_at
      FROM responses r
      JOIN users u ON u.id = r.student_id
      JOIN questions q ON q.id = r.question_id
      JOIN exams e ON e.id = r.exam_id
      JOIN components c ON c.id = e.component_id
      LEFT JOIN scores s ON s.response_id = r.id
      WHERE r.id = ?
    `).get(req.params.id);

    if (!response) {
      return res.status(404).json({ error: 'Response not found' });
    }

    // Parse JSON fields
    response.rubric = response.rubric ? JSON.parse(response.rubric) : null;
    response.options = response.options ? JSON.parse(response.options) : null;
    response.test_cases = response.test_cases ? JSON.parse(response.test_cases) : null;

    res.json({ response });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/evaluator/responses/:id/score ────────────────────────────────
// Submit score for a response
router.post('/responses/:id/score', async (req, res) => {
  try {
    const db = getDb();
    const evaluatorId = req.user.id;
    const { marks_awarded, feedback } = req.body;

    if (marks_awarded === undefined || marks_awarded === null) {
      return res.status(400).json({ error: 'marks_awarded is required' });
    }

    const response = await db.prepare(`
      SELECT r.*, q.marks as max_marks, e.component_id
      FROM responses r
      JOIN questions q ON q.id = r.question_id
      JOIN exams e ON e.id = r.exam_id
      WHERE r.id = ?
    `).get(req.params.id);

    if (!response) {
      return res.status(404).json({ error: 'Response not found' });
    }

    if (marks_awarded < 0 || marks_awarded > response.max_marks) {
      return res.status(400).json({ error: `Marks must be between 0 and ${response.max_marks}` });
    }

    // Upsert score
    await db.prepare(`
      INSERT INTO scores (response_id, marks_awarded, scored_by, scoring_type, feedback, scored_at)
      VALUES (?, ?, ?, 'manual', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(response_id) DO UPDATE SET
        marks_awarded = ?, scored_by = ?, feedback = ?, scored_at = CURRENT_TIMESTAMP
    `).run(
      req.params.id, marks_awarded, evaluatorId, feedback || null,
      marks_awarded, evaluatorId, feedback || null
    );

    // Update response status
    await db.prepare("UPDATE responses SET status = 'graded' WHERE id = ?").run(req.params.id);

    // Recompute component total and composite for the student
    await recomputeComponentTotal(response.student_id, response.component_id);
    await recomputeComposite(response.student_id);

    res.json({ message: 'Score submitted', marks_awarded });
  } catch (err) {
    console.error('Score response error:', err);
    res.status(500).json({ error: 'Failed to submit score' });
  }
});

// ─── GET /api/evaluator/stats ───────────────────────────────────────────────
// Evaluator workload stats
router.get('/stats', async (req, res, next) => {
  try {
    const db = getDb();
    const stats = await db.prepare(`
      SELECT
        q.type as question_type,
        c.display_name as component_name,
        COUNT(CASE WHEN r.status IN ('submitted','pending_review') THEN 1 END) as pending,
        COUNT(CASE WHEN r.status = 'graded' THEN 1 END) as graded,
        COUNT(r.id) as total
      FROM responses r
      JOIN questions q ON q.id = r.question_id
      JOIN exams e ON e.id = r.exam_id
      JOIN components c ON c.id = e.component_id
      WHERE q.type IN ('subjective', 'programming', 'oral_task', 'writing_task')
      GROUP BY q.type, c.display_name, c.id
      ORDER BY c.id
    `).all();

    res.json({ stats });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
