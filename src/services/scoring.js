/**
 * Composite Scoring Engine
 * ────────────────────────
 * Formula: S = 3T + 3L + 2O + 2W  (Max = 5000)
 *
 * Levels (fixed absolute bands):
 *   Level 3 — Advanced:      3750–5000 AND (O + W) ≥ 500
 *   Level 2 — Intermediate:  2500–3749
 *   Level 1 — Foundational:  0–2499
 */

const { getDb } = require('../db/database');

// ─── Component weights ─────────────────────────────────────────────────────
const WEIGHTS = {
  technical: 3,
  aptitude: 3,
  oral_english: 2,
  written_english: 2,
};

const COMPOSITE_MAX = 5000;
const LEVEL_THRESHOLDS = {
  advanced: 3750,
  intermediate: 2500,
};
const ENGLISH_FLOOR = 500; // O + W must be ≥ 500 for Level 3

// ─── Core composite calculation ─────────────────────────────────────────────

/**
 * Compute composite score and level from raw component totals.
 * @param {number} T - Technical raw total (0-500)
 * @param {number} L - Aptitude raw total (0-500)
 * @param {number} O - Oral English raw total (0-500)
 * @param {number} W - Written English raw total (0-500)
 * @returns {{ total_score: number, level: number }}
 */
function computeComposite(T, L, O, W) {
  const S = 3 * T + 3 * L + 2 * O + 2 * W;

  let level;
  if (S >= LEVEL_THRESHOLDS.advanced && (O + W) >= ENGLISH_FLOOR) {
    level = 3; // Advanced
  } else if (S >= LEVEL_THRESHOLDS.intermediate) {
    level = 2; // Intermediate
  } else {
    level = 1; // Foundational
  }

  return { total_score: S, level };
}

// ─── Auto-grade MCQ ─────────────────────────────────────────────────────────

/**
 * Auto-grade an MCQ response.
 * @param {Object} response - { answer_data, question_id }
 * @param {Object} question - { correct_answer, marks }
 * @returns {number} marks awarded (0 or full marks)
 */
function gradeMCQ(response, question) {
  if (!response.answer_data || !question.correct_answer) return 0;
  const studentAnswer = response.answer_data.trim().toUpperCase();
  const correctAnswer = question.correct_answer.trim().toUpperCase();
  return studentAnswer === correctAnswer ? question.marks : 0;
}

// ─── Auto-grade Programming (test case based) ──────────────────────────────

/**
 * Grade programming response by matching expected outputs.
 * NOTE: This is a simple string-match grader. For sandboxed execution,
 * integrate a code runner service.
 * @param {Object} response - { answer_data (code) }
 * @param {Object} question - { test_cases (JSON), marks }
 * @returns {number} marks awarded (proportional to passed test cases)
 */
function gradeProgramming(response, question) {
  // For now, route to manual review
  // Full implementation would sandbox-execute the code
  return null; // null = needs manual grading
}

// ─── Auto-grade Oral Task using Levenshtein distance ────────────────────────
function calculateLevenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
  for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function gradeOralTask(response, question) {
  if (!response.answer_data || !question.correct_answer) return null;
  const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
  const ans = normalize(response.answer_data);
  const correct = normalize(question.correct_answer);
  if (correct.length === 0) return null;

  const distance = calculateLevenshteinDistance(ans, correct);
  const maxLen = Math.max(ans.length, correct.length);
  const similarity = (maxLen - distance) / maxLen;

  if (similarity >= 0.85) {
    return question.marks;
  } else if (similarity >= 0.50) {
    return Math.max(1, Math.floor(question.marks / 2));
  }
  return null; // Route to manual if very poor match
}

// ─── Auto-grade a single response ───────────────────────────────────────────

async function autoGradeResponse(responseId) {
  const db = getDb();

  const response = await db.prepare(`
    SELECT r.*, q.type, q.marks, q.correct_answer, q.test_cases
    FROM responses r
    JOIN questions q ON q.id = r.question_id
    WHERE r.id = ?
  `).get(responseId);

  if (!response) return null;

  let marksAwarded = null;
  let scoringType = 'manual';

  if (response.type === 'mcq') {
    marksAwarded = gradeMCQ(response, response);
    scoringType = 'auto';
  } else if (response.type === 'programming' && response.test_cases) {
    marksAwarded = gradeProgramming(response, response);
    if (marksAwarded !== null) scoringType = 'auto';
  } else if (response.type === 'oral_task') {
    marksAwarded = gradeOralTask(response, response);
    if (marksAwarded !== null) scoringType = 'auto';
  }

  if (marksAwarded !== null) {
    // Insert or update score
    await db.prepare(`
      INSERT INTO scores (response_id, marks_awarded, scoring_type, scored_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(response_id) DO UPDATE SET marks_awarded = ?, scoring_type = ?, scored_at = CURRENT_TIMESTAMP
    `).run(responseId, marksAwarded, scoringType, marksAwarded, scoringType);

    // Update response status
    await db.prepare("UPDATE responses SET status = 'graded' WHERE id = ?").run(responseId);

    return marksAwarded;
  }

  // Route to manual review
  await db.prepare("UPDATE responses SET status = 'pending_review' WHERE id = ?").run(responseId);
  return null;
}

// ─── Recompute component total for a student ────────────────────────────────

async function recomputeComponentTotal(studentId, componentId) {
  const db = getDb();

  // Sum all graded scores for this student in this component
  const result = await db.prepare(`
    SELECT
      COUNT(DISTINCT e.id) as exams_completed,
      COUNT(DISTINCT CASE WHEN r.status = 'graded' THEN e.id END) as exams_graded,
      COALESCE(SUM(s.marks_awarded), 0) as total_marks
    FROM exams e
    JOIN responses r ON r.exam_id = e.id AND r.student_id = ?
    LEFT JOIN scores s ON s.response_id = r.id
    WHERE e.component_id = ?
  `).get(studentId, componentId);

  // Upsert component total
  await db.prepare(`
    INSERT INTO component_totals (student_id, component_id, total_marks, exams_completed, exams_graded, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(student_id, component_id) DO UPDATE SET
      total_marks = ?, exams_completed = ?, exams_graded = ?, updated_at = CURRENT_TIMESTAMP
  `).run(
    studentId, componentId, result.total_marks, result.exams_completed, result.exams_graded,
    result.total_marks, result.exams_completed, result.exams_graded
  );

  return result;
}

// ─── Recompute composite score for a student ────────────────────────────────

async function recomputeComposite(studentId) {
  const db = getDb();

  // Get all component totals
  const components = await db.prepare(`
    SELECT c.name, COALESCE(ct.total_marks, 0) as total_marks
    FROM components c
    LEFT JOIN component_totals ct ON ct.component_id = c.id AND ct.student_id = ?
    ORDER BY c.id
  `).all(studentId);

  const scores = {};
  for (const c of components) {
    scores[c.name] = c.total_marks;
  }

  const T = scores.technical || 0;
  const L = scores.aptitude || 0;
  const O = scores.oral_english || 0;
  const W = scores.written_english || 0;

  const { total_score, level } = computeComposite(T, L, O, W);

  // Upsert composite score
  await db.prepare(`
    INSERT INTO composite_scores (student_id, t_score, l_score, o_score, w_score, total_score, level, computed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(student_id) DO UPDATE SET
      t_score = ?, l_score = ?, o_score = ?, w_score = ?,
      total_score = ?, level = ?, computed_at = CURRENT_TIMESTAMP
  `).run(
    studentId, T, L, O, W, total_score, level,
    T, L, O, W, total_score, level
  );

  return { t_score: T, l_score: L, o_score: O, w_score: W, total_score, level };
}

// ─── Recompute everything for a student ─────────────────────────────────────

async function recomputeAllForStudent(studentId) {
  const db = getDb();
  const components = await db.prepare('SELECT * FROM components ORDER BY id').all();

  for (const comp of components) {
    await recomputeComponentTotal(studentId, comp.id);
  }

  return await recomputeComposite(studentId);
}

// ─── Recompute all students ─────────────────────────────────────────────────

async function recomputeAllStudents() {
  const db = getDb();
  const students = await db.prepare("SELECT id FROM users WHERE role = 'student' AND active = 1").all();
  const results = [];

  for (const s of students) {
    const result = await recomputeAllForStudent(s.id);
    results.push({ student_id: s.id, ...result });
  }

  return results;
}

module.exports = {
  computeComposite,
  gradeMCQ,
  autoGradeResponse,
  recomputeComponentTotal,
  recomputeComposite,
  recomputeAllForStudent,
  recomputeAllStudents,
  WEIGHTS,
  COMPOSITE_MAX,
  LEVEL_THRESHOLDS,
  ENGLISH_FLOOR,
};
