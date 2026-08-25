/**
 * Question Routes — CRUD + AI Generation + File Upload
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const { getDb } = require('../db/database');
const { requireRole } = require('../middleware/roles');
const { generateQuestions } = require('../services/gemini');
const { parseQuestionFile } = require('../services/questionParser');

const os = require('os');

const router = express.Router();
const upload = multer({ dest: os.tmpdir() });

// All routes require admin
router.use(requireRole('admin'));

function normalizeQuestionForStorage(q, defaultSource = 'manual') {
  let rawType = String(q?.type || 'mcq').toLowerCase().trim();
  let type = 'subjective';
  if (rawType.includes('mcq') || rawType.includes('choice')) type = 'mcq';
  else if (rawType.includes('prog') || rawType.includes('code')) type = 'programming';
  else if (rawType.includes('oral') || rawType.includes('speak')) type = 'oral_task';
  else if (rawType.includes('writ') || rawType.includes('essay')) type = 'writing_task';
  else if (rawType.includes('subj') || rawType.includes('short')) type = 'subjective';

  let marks = Math.max(1, Math.round(parseFloat(q?.marks) || 1));

  let content = String(q?.content || q?.question || 'Question content').trim();
  if (!content) content = 'Question statement';

  let difficulty = String(q?.difficulty || 'medium').toLowerCase().trim();
  if (!['easy', 'medium', 'hard'].includes(difficulty)) difficulty = 'medium';

  let source = String(q?.source || defaultSource).toLowerCase().trim();
  if (!['manual', 'ai_generated'].includes(source)) source = defaultSource;

  let options = null;
  if (type === 'mcq') {
    if (Array.isArray(q?.options)) {
      options = JSON.stringify(q.options.map(o => String(o).trim()).filter(Boolean));
    } else if (typeof q?.options === 'string' && q.options.trim()) {
      try {
        const parsed = JSON.parse(q.options);
        options = Array.isArray(parsed) ? JSON.stringify(parsed) : JSON.stringify([q.options]);
      } catch (e) {
        options = JSON.stringify(q.options.split(',').map(s => s.trim()).filter(Boolean));
      }
    }
  }

  let correctAnswer = '';
  if (q?.correct_answer !== null && q?.correct_answer !== undefined) {
    if (typeof q.correct_answer === 'object') {
      correctAnswer = JSON.stringify(q.correct_answer);
    } else {
      correctAnswer = String(q.correct_answer).trim();
    }
  } else if (q?.correct) {
    correctAnswer = String(q.correct).trim();
  }

  let testCases = null;
  if (q?.test_cases) {
    testCases = typeof q.test_cases === 'string' ? q.test_cases : JSON.stringify(q.test_cases);
  }

  let rubric = null;
  if (q?.rubric) {
    rubric = typeof q.rubric === 'string' ? q.rubric : JSON.stringify(q.rubric);
  }

  return { type, marks, content, options, correct_answer: correctAnswer, test_cases: testCases, rubric, difficulty, source };
}

// ─── GET /api/admin/exams/:id/questions ─────────────────────────────────────
router.get('/exams/:id/questions', async (req, res, next) => {
  try {
    const db = getDb();
    const exam = await db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id);
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    const questions = await db.prepare(
      'SELECT * FROM questions WHERE exam_id = ? ORDER BY sort_order, id'
    ).all(req.params.id);

    // Parse JSON fields
    const parsed = questions.map(q => ({
      ...q,
      options: q.options ? JSON.parse(q.options) : null,
      test_cases: q.test_cases ? JSON.parse(q.test_cases) : null,
      rubric: q.rubric ? JSON.parse(q.rubric) : null,
    }));

    const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);
    const typeCounts = {};
    questions.forEach(q => {
      typeCounts[q.type] = (typeCounts[q.type] || 0) + q.marks;
    });

    res.json({
      exam,
      questions: parsed,
      summary: { totalMarks, typeCounts, questionCount: questions.length },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/admin/exams/:id/questions ────────────────────────────────────
// Add a single question manually
router.post('/exams/:id/questions', async (req, res, next) => {
  try {
    const db = getDb();
    const exam = await db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id);
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    const normalized = normalizeQuestionForStorage(req.body, 'manual');

    // Validate MCQ has options
    if (normalized.type === 'mcq') {
      const opts = normalized.options ? JSON.parse(normalized.options) : [];
      if (opts.length < 2) {
        return res.status(400).json({ error: 'MCQ requires at least 2 options' });
      }
    }

    const maxSort = await db.prepare('SELECT MAX(sort_order) as m FROM questions WHERE exam_id = ?').get(req.params.id);

    const result = await db.prepare(`
      INSERT INTO questions (exam_id, type, marks, content, options, correct_answer, test_cases, rubric, sort_order, source, difficulty)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.params.id,
      normalized.type,
      normalized.marks,
      normalized.content,
      normalized.options,
      normalized.correct_answer,
      normalized.test_cases,
      normalized.rubric,
      (maxSort?.m || 0) + 1,
      normalized.source,
      normalized.difficulty
    );

    res.status(201).json({ message: 'Question added successfully', question_id: result.lastInsertRowid });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/admin/exams/:id/questions/upload ─────────────────────────────
// Upload questions from XLSX/CSV/JSON file
router.post('/exams/:id/questions/upload', upload.single('file'), async (req, res, next) => {
  try {
    const db = getDb();
    const exam = await db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id);
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'File required' });
    }

    const questions = parseQuestionFile(req.file.path, req.file.originalname);
    const maxSort = await db.prepare('SELECT MAX(sort_order) as m FROM questions WHERE exam_id = ?').get(req.params.id);
    let sortOrder = (maxSort?.m || 0);

    const insert = db.prepare(`
      INSERT INTO questions (exam_id, type, marks, content, options, correct_answer, test_cases, rubric, sort_order, source, difficulty)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let count = 0;
    for (const rawQ of questions) {
      const q = normalizeQuestionForStorage(rawQ, 'manual');
      sortOrder++;
      await insert.run(
        req.params.id,
        q.type,
        q.marks,
        q.content,
        q.options,
        q.correct_answer,
        q.test_cases,
        q.rubric,
        sortOrder,
        q.source,
        q.difficulty
      );
      count++;
    }

    // Clean up temp file
    const fs = require('fs');
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.json({ message: `Uploaded ${count} questions`, count });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/admin/exams/:id/questions/generate ───────────────────────────
// Generate questions using Gemini AI
router.post('/exams/:id/questions/generate', async (req, res, next) => {
  try {
    const db = getDb();
    const exam = await db.prepare(`
      SELECT e.*, c.name as component_name, c.display_name, c.question_type_mix as default_mix
      FROM exams e
      JOIN components c ON c.id = e.component_id
      WHERE e.id = ?
    `).get(req.params.id);

    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    const { topic, description, difficulty, questionTypes } = req.body;

    if (!topic) {
      return res.status(400).json({ error: 'topic is required' });
    }

    // Use provided question types or fall back to component defaults
    let typeMix = questionTypes;
    if (!typeMix && exam) {
      try {
        typeMix = JSON.parse(exam.default_mix || exam.question_type_mix || '{}');
      } catch (e) {
        typeMix = {};
      }
    }

    const generated = await generateQuestions({
      topic,
      description: description || '',
      difficulty: difficulty || 'medium',
      component: exam.component_name || 'technical',
      typeMix: typeMix || {},
    });

    // Return preview (don't save yet — let admin review first)
    res.json({
      message: `Generated ${generated.length} questions`,
      questions: generated,
      typeMix,
    });
  } catch (err) {
    console.error('AI Generation Route Error:', err);
    res.status(500).json({ error: err.message || 'Generation failed' });
  }
});

// ─── POST /api/admin/exams/:id/questions/save-generated ─────────────────────
// Save reviewed AI-generated questions
router.post('/exams/:id/questions/save-generated', async (req, res, next) => {
  try {
    const db = getDb();
    const exam = await db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id);
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    const { questions, clearExisting } = req.body;
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: 'questions array required' });
    }

    try {
      // Optionally clear existing questions
      if (clearExisting) {
        const examId = parseInt(req.params.id, 10);
        await db.prepare('DELETE FROM scores WHERE response_id IN (SELECT id FROM responses WHERE exam_id = ?)').run(examId);
        await db.prepare('DELETE FROM responses WHERE exam_id = ?').run(examId);
        await db.prepare('DELETE FROM questions WHERE exam_id = ?').run(examId);
      }

      const maxSort = await db.prepare('SELECT MAX(sort_order) as m FROM questions WHERE exam_id = ?').get(req.params.id);
      let sortOrder = maxSort?.m || 0;

      const insert = db.prepare(`
        INSERT INTO questions (exam_id, type, marks, content, options, correct_answer, test_cases, rubric, sort_order, source, difficulty)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      let count = 0;
      for (const rawQ of questions) {
        const q = normalizeQuestionForStorage(rawQ, 'ai_generated');
        sortOrder++;
        await insert.run(
          req.params.id,
          q.type,
          q.marks,
          q.content,
          q.options,
          q.correct_answer,
          q.test_cases,
          q.rubric,
          sortOrder,
          q.source,
          q.difficulty
        );
        count++;
      }
      res.json({ message: 'Questions saved successfully', count });
    } catch (dbErr) {
      console.error('Error saving generated questions:', dbErr);
      res.status(500).json({ error: `Failed to save generated questions: ${dbErr.message}` });
    }
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/admin/questions/:id ───────────────────────────────────────────
router.put('/questions/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const question = await db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.id);
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const normalized = normalizeQuestionForStorage({ ...question, ...req.body }, question.source || 'manual');

    await db.prepare(`
      UPDATE questions SET
        type = ?, marks = ?, content = ?, options = ?, correct_answer = ?,
        test_cases = ?, rubric = ?, difficulty = ?
      WHERE id = ?
    `).run(
      normalized.type,
      normalized.marks,
      normalized.content,
      normalized.options,
      normalized.correct_answer,
      normalized.test_cases,
      normalized.rubric,
      normalized.difficulty,
      req.params.id
    );

    res.json({ message: 'Question updated successfully' });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/admin/questions/:id ────────────────────────────────────────
router.delete('/questions/:id', async (req, res) => {
  try {
    const db = getDb();
    const qId = parseInt(req.params.id, 10);
    if (isNaN(qId)) {
      return res.status(400).json({ error: 'Invalid question ID' });
    }

    // Clean up responses and scores associated with this question
    await db.prepare('DELETE FROM scores WHERE response_id IN (SELECT id FROM responses WHERE question_id = ?)').run(qId);
    await db.prepare('DELETE FROM responses WHERE question_id = ?').run(qId);

    const result = await db.prepare('DELETE FROM questions WHERE id = ?').run(qId);
    if (!result || result.changes === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }
    res.json({ message: 'Question deleted' });
  } catch (err) {
    console.error('Delete question error:', err);
    res.status(500).json({ error: `Failed to delete question: ${err.message}` });
  }
});

// ─── POST /api/admin/exams/:id/questions/bulk-delete ────────────────────────
router.post('/exams/:id/questions/bulk-delete', async (req, res) => {
  const { question_ids } = req.body;
  if (!Array.isArray(question_ids) || question_ids.length === 0) {
    return res.status(400).json({ error: 'No questions selected' });
  }

  try {
    const db = getDb();
    const examId = parseInt(req.params.id, 10);
    if (isNaN(examId)) {
      return res.status(400).json({ error: 'Invalid exam ID' });
    }
    let deletedCount = 0;

    for (const rawId of question_ids) {
      const qId = parseInt(rawId, 10);
      if (isNaN(qId)) continue;
      await db.prepare('DELETE FROM scores WHERE response_id IN (SELECT id FROM responses WHERE question_id = ?)').run(qId);
      await db.prepare('DELETE FROM responses WHERE question_id = ?').run(qId);
      const result = await db.prepare('DELETE FROM questions WHERE id = ? AND exam_id = ?').run(qId, examId);
      if (result && result.changes) {
        deletedCount += result.changes;
      }
    }

    res.json({ message: `Successfully deleted ${deletedCount} questions` });
  } catch (err) {
    console.error('Bulk delete questions error:', err);
    res.status(500).json({ error: `Failed to delete questions: ${err.message}` });
  }
});

module.exports = router;
