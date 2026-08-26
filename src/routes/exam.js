/**
 * Student Exam Routes — Exam taking, response submission, results
 */

const express = require('express');
const { getDb } = require('../db/database');
const { requireRole } = require('../middleware/roles');
const { autoGradeResponse, recomputeAllForStudent } = require('../services/scoring');
const { isChromeUserAgent } = require('../utils/browser-check');
const { executeCode, runTestCases } = require('../services/codeRunner');

const router = express.Router();

// All routes require student role & Google Chrome browser
router.use(requireRole('student'));
router.use((req, res, next) => {
  if (!isChromeUserAgent(req.headers['user-agent'])) {
    return res.status(403).json({ error: 'Google Chrome is strictly required for student logins and exams.' });
  }
  next();
});

// ─── GET /api/student/exams ─────────────────────────────────────────────────
// List available exams for this student
router.get('/exams', async (req, res, next) => {
  try {
    const db = getDb();
    const studentId = req.user.id;
    const targetExamId = req.session.targetExamId || null;

    const rawExams = await db.prepare(`
      SELECT e.*, c.display_name as component_name, c.name as component_key, c.weight,
             es.status as session_status, es.started_at as session_started, es.ends_at as session_ends,
             es.submitted_at as session_submitted,
             (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) as question_count,
             (SELECT COALESCE(SUM(s.marks_awarded), 0) FROM responses r
              JOIN scores s ON s.response_id = r.id
              WHERE r.exam_id = e.id AND r.student_id = ?) as marks_obtained
      FROM exams e
      JOIN components c ON c.id = e.component_id
      LEFT JOIN exam_sessions es ON es.exam_id = e.id AND es.student_id = ?
      WHERE e.is_published = 1
      ORDER BY c.id, e.exam_number
    `).all(studentId, studentId);

    const now = new Date();
    const exams = rawExams.map(e => {
      const accessCodeExpired = e.access_code_expires_at ? now > new Date(e.access_code_expires_at) : false;
      const sessionExpired = e.session_ends ? now > new Date(e.session_ends) && e.session_status !== 'submitted' : false;
      const isExpired = accessCodeExpired || sessionExpired;

      return {
        ...e,
        is_access_code_expired: accessCodeExpired,
        is_expired: isExpired,
        target_match: targetExamId ? Number(targetExamId) === Number(e.id) : true,
      };
    });

    res.json({ exams });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/student/exams/:id/start ──────────────────────────────────────
// Start an exam session (server-enforced timer)
router.post('/exams/:id/start', async (req, res, next) => {
  try {
    const db = getDb();
    const studentId = req.user.id;
    const examId = parseInt(req.params.id, 10);
    if (isNaN(examId)) {
      return res.status(400).json({ error: 'Invalid exam ID' });
    }

    const exam = await db.prepare('SELECT * FROM exams WHERE id = ? AND is_published = 1').get(examId);
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found or not published' });
    }

    const now = new Date();

    // Check if access code is expired
    if (exam.access_code_expires_at && now > new Date(exam.access_code_expires_at)) {
      return res.status(403).json({ error: 'This exam access code has expired. Exam access is closed.' });
    }

    // Check for existing session
    const existing = await db.prepare('SELECT * FROM exam_sessions WHERE student_id = ? AND exam_id = ?').get(studentId, examId);
    if (existing) {
      if (existing.status === 'submitted') {
        return res.status(400).json({ error: 'Exam already submitted' });
      }
      if (existing.ends_at && now > new Date(existing.ends_at)) {
        return res.status(403).json({ error: 'Exam session duration has ended and time has expired.' });
      }
      if (existing.status === 'active') {
        // Return existing session
        const questions = await db.prepare(
          'SELECT id, type, marks, content, options, test_cases, sort_order FROM questions WHERE exam_id = ? ORDER BY sort_order, id'
        ).all(examId);

        const parsed = questions.map(q => {
          let parsedOptions = null;
          let parsedTestCases = null;
          if (q.options) {
            try { parsedOptions = typeof q.options === 'string' ? JSON.parse(q.options) : q.options; } catch (e) {}
          }
          if (q.test_cases) {
            try { parsedTestCases = typeof q.test_cases === 'string' ? JSON.parse(q.test_cases) : q.test_cases; } catch (e) {}
          }
          return {
            ...q,
            options: parsedOptions,
            test_cases: parsedTestCases,
          };
        });

        // Get existing responses
        const responses = await db.prepare(
          'SELECT question_id, answer_data FROM responses WHERE student_id = ? AND exam_id = ?'
        ).all(studentId, examId);

        const responseMap = {};
        responses.forEach(r => { responseMap[r.question_id] = r.answer_data; });

        return res.json({
          session: existing,
          exam,
          questions: parsed,
          responses: responseMap,
          serverTime: new Date().toISOString(),
        });
      }
    }

    // Create new session (reuse `now` declared above)
    const endsAt = new Date(now.getTime() + exam.duration_minutes * 60 * 1000);

    const result = await db.prepare(`
      INSERT INTO exam_sessions (student_id, exam_id, started_at, ends_at, status)
      VALUES (?, ?, ?, ?, 'active')
    `).run(studentId, examId, now.toISOString(), endsAt.toISOString());

    // Get questions (without answers)
    const questions = await db.prepare(
      'SELECT id, type, marks, content, options, test_cases, sort_order FROM questions WHERE exam_id = ? ORDER BY sort_order, id'
    ).all(examId);

    const parsed = questions.map(q => {
      let parsedOptions = null;
      let parsedTestCases = null;
      if (q.options) {
        try { parsedOptions = typeof q.options === 'string' ? JSON.parse(q.options) : q.options; } catch (e) {}
      }
      if (q.test_cases) {
        try { parsedTestCases = typeof q.test_cases === 'string' ? JSON.parse(q.test_cases) : q.test_cases; } catch (e) {}
      }
      return {
        ...q,
        options: parsedOptions,
        test_cases: parsedTestCases,
      };
    });

    res.json({
      session: {
        id: result.lastInsertRowid,
        student_id: studentId,
        exam_id: examId,
        started_at: now.toISOString(),
        ends_at: endsAt.toISOString(),
        status: 'active',
      },
      exam,
      questions: parsed,
      responses: {},
      serverTime: now.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/student/responses ────────────────────────────────────────────
// Save/update a single response (auto-save during exam)
router.post('/responses', async (req, res, next) => {
  try {
    const db = getDb();
    const studentId = req.user.id;
    const { question_id, answer_data, exam_id } = req.body;

    if (!question_id || !exam_id) {
      return res.status(400).json({ error: 'question_id and exam_id are required' });
    }

    // Verify active session
    const session = await db.prepare(
      "SELECT * FROM exam_sessions WHERE student_id = ? AND exam_id = ? AND status = 'active'"
    ).get(studentId, exam_id);

    if (!session) {
      return res.status(400).json({ error: 'No active exam session' });
    }

    // Check if time has expired (server-enforced)
    if (new Date() > new Date(session.ends_at)) {
      await db.prepare("UPDATE exam_sessions SET status = 'expired' WHERE id = ?").run(session.id);
      return res.status(400).json({ error: 'Exam time has expired' });
    }

    // Upsert response
    await db.prepare(`
      INSERT INTO responses (student_id, exam_id, question_id, answer_data, submitted_at, status)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 'submitted')
      ON CONFLICT(student_id, question_id) DO UPDATE SET
        answer_data = ?, submitted_at = CURRENT_TIMESTAMP
    `).run(studentId, exam_id, question_id, answer_data || '', answer_data || '');

    res.json({ message: 'Response saved' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/student/exams/:id/submit ─────────────────────────────────────
// Submit entire exam — triggers auto-grading for MCQ
router.post('/exams/:id/submit', async (req, res, next) => {
  try {
    const db = getDb();
    const studentId = req.user.id;
    const examId = req.params.id;

    const session = await db.prepare(
      "SELECT * FROM exam_sessions WHERE student_id = ? AND exam_id = ? AND status = 'active'"
    ).get(studentId, examId);

    if (!session) {
      return res.status(400).json({ error: 'No active exam session' });
    }

    // Save any remaining responses from request body
    const { responses: finalResponses, remarks } = req.body;
    if (finalResponses && Array.isArray(finalResponses)) {
      const upsert = db.prepare(`
        INSERT INTO responses (student_id, exam_id, question_id, answer_data, submitted_at, status)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 'submitted')
        ON CONFLICT(student_id, question_id) DO UPDATE SET
          answer_data = ?, submitted_at = CURRENT_TIMESTAMP
      `);

      for (const r of finalResponses) {
        await upsert.run(studentId, examId, r.question_id, r.answer_data || '', r.answer_data || '');
      }
    }

    // Mark session as submitted
    await db.prepare(`
      UPDATE exam_sessions SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP, remarks = COALESCE(remarks, ?) WHERE id = ?
    `).run(remarks || null, session.id);

    // Auto-grade MCQ responses
    const allResponses = await db.prepare(
      'SELECT r.id FROM responses r JOIN questions q ON q.id = r.question_id WHERE r.student_id = ? AND r.exam_id = ?'
    ).all(studentId, examId);

    let autoGraded = 0;
    let pendingReview = 0;

    for (const r of allResponses) {
      const result = await autoGradeResponse(r.id);
      if (result !== null) autoGraded++;
      else pendingReview++;
    }

    // Recompute component totals and composite
    const exam = await db.prepare('SELECT component_id FROM exams WHERE id = ?').get(examId);
    if (exam) {
      const { recomputeComponentTotal, recomputeComposite } = require('../services/scoring');
      await recomputeComponentTotal(studentId, exam.component_id);
      await recomputeComposite(studentId);
    }

    res.json({
      message: 'Exam submitted',
      autoGraded,
      pendingReview,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/student/results ───────────────────────────────────────────────
// View own scores and composite
router.get('/results', async (req, res, next) => {
  try {
    const db = getDb();
    const studentId = req.user.id;

    // Component totals
    const componentTotals = await db.prepare(`
      SELECT ct.*, c.display_name, c.weight, c.max_raw_score
      FROM component_totals ct
      JOIN components c ON c.id = ct.component_id
      WHERE ct.student_id = ?
      ORDER BY c.id
    `).all(studentId);

    // Composite score
    const composite = await db.prepare('SELECT * FROM composite_scores WHERE student_id = ?').get(studentId);

    // Per-exam breakdown
    const examsList = await db.prepare(`
      SELECT e.id, e.title, e.exam_number, e.total_marks, c.display_name as component_name,
             es.status as session_status, es.submitted_at, es.remarks,
             COALESCE(SUM(s.marks_awarded), 0) as marks_obtained,
             COUNT(r.id) as responses_count,
             COUNT(s.id) as scored_count
      FROM exams e
      JOIN components c ON c.id = e.component_id
      LEFT JOIN exam_sessions es ON es.exam_id = e.id AND es.student_id = ?
      LEFT JOIN responses r ON r.exam_id = e.id AND r.student_id = ?
      LEFT JOIN scores s ON s.response_id = r.id
      WHERE e.is_published = 1
      GROUP BY e.id, c.display_name, c.id, es.status, es.submitted_at, es.remarks
      ORDER BY c.id, e.exam_number
    `).all(studentId, studentId);

    const examBreakdown = [];
    for (const e of examsList) {
      let questions = [];
      if (e.session_status) {
        const rawQuestions = await db.prepare(`
          SELECT q.id, q.content, q.type, q.correct_answer, q.options, q.marks, q.sort_order,
                 r.answer_data as student_answer,
                 s.marks_awarded, s.feedback
          FROM questions q
          LEFT JOIN responses r ON r.question_id = q.id AND r.student_id = ?
          LEFT JOIN scores s ON s.response_id = r.id
          WHERE q.exam_id = ?
          ORDER BY q.sort_order, q.id
        `).all(studentId, e.id);

        questions = rawQuestions.map(q => ({
          ...q,
          options: q.options ? (typeof q.options === 'string' ? JSON.parse(q.options) : q.options) : null,
        }));
      }
      examBreakdown.push({ ...e, questions });
    }

    res.json({
      componentTotals,
      composite: composite || null,
      examBreakdown,
      levelDescriptions: {
        1: 'Foundational (0%–49%)',
        2: 'Intermediate (50%–74%)',
        3: 'Advanced (75%–100%, English ≥ 50%)',
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/student/violations ───────────────────────────────────────────
router.post('/violations', async (req, res, next) => {
  const { exam_id, type, details } = req.body;
  if (!exam_id || !type) return res.status(400).json({ error: 'exam_id and type are required' });

  try {
    const db = getDb();
    await db.prepare('INSERT INTO violations (student_id, exam_id, type, details) VALUES (?, ?, ?, ?)').run(
      req.user.id,
      exam_id,
      type,
      details || ''
    );
    res.json({ message: 'Violation logged' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/student/run-code ─────────────────────────────────────────────
// Test and execute code with custom input or automated test cases
router.post('/run-code', async (req, res, next) => {
  try {
    const { code, language, input, question_id, run_test_cases } = req.body;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'No code provided for execution' });
    }

    const db = getDb();

    // If run_test_cases is requested, look up test_cases for question_id
    if (run_test_cases && question_id) {
      const q = await db.prepare('SELECT test_cases FROM questions WHERE id = ?').get(question_id);
      let testCases = [];
      if (q && q.test_cases) {
        try {
          testCases = typeof q.test_cases === 'string' ? JSON.parse(q.test_cases) : q.test_cases;
        } catch (e) {
          testCases = [];
        }
      }

      if (!Array.isArray(testCases) || testCases.length === 0) {
        // Fall back to single execution if no test cases defined
        const result = await executeCode({ code, language, input: input || '' });
        return res.json({ mode: 'single', ...result });
      }

      const suiteResult = await runTestCases({ code, language, testCases });
      return res.json({ mode: 'test_cases', ...suiteResult });
    }

    // Execute with custom input
    const result = await executeCode({
      code,
      language,
      input: input !== undefined ? input : '',
    });

    res.json({
      mode: 'single',
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
