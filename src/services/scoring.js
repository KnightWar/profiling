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
 * @param {Object} question - { correct_answer, options, marks }
 * @returns {number} marks awarded (0 or full marks)
 */
function gradeMCQ(response, question) {
  if (!response.answer_data || !question.correct_answer) return 0;
  const studentAns = String(response.answer_data).trim().toLowerCase();
  const correctAns = String(question.correct_answer).trim().toLowerCase();

  // Direct match (e.g., 'a' === 'a' or exact text)
  if (studentAns === correctAns) return question.marks;

  // If options array is available, map letters to option values
  if (question.options && Array.isArray(question.options)) {
    const letters = ['a', 'b', 'c', 'd', 'e', 'f'];
    const correctIdx = letters.indexOf(correctAns);
    if (correctIdx !== -1 && question.options[correctIdx]) {
      if (studentAns === question.options[correctIdx].trim().toLowerCase()) return question.marks;
    }
    const studentIdx = letters.indexOf(studentAns);
    if (studentIdx !== -1 && question.options[studentIdx]) {
      if (question.options[studentIdx].trim().toLowerCase() === correctAns) return question.marks;
    }
  }

  return 0;
}

// ─── Auto-grade Programming / Subjective / Oral ─────────────────────────────

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

function calculateTextSimilarity(textA, textB) {
  if (!textA || !textB) return 0;
  const normA = textA.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const normB = textB.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normA || !normB) return 0;
  if (normA === normB) return 1.0;

  // Token overlap (Jaccard similarity)
  const tokensA = new Set(normA.split(' '));
  const tokensB = new Set(normB.split(' '));
  let intersection = 0;
  tokensA.forEach(t => { if (tokensB.has(t)) intersection++; });
  const union = new Set([...tokensA, ...tokensB]).size;
  const tokenSim = union > 0 ? (intersection / union) : 0;

  // Character Levenshtein similarity on truncated samples
  const sampleA = normA.substring(0, 300);
  const sampleB = normB.substring(0, 300);
  const dist = calculateLevenshteinDistance(sampleA, sampleB);
  const maxLen = Math.max(sampleA.length, sampleB.length);
  const charSim = maxLen > 0 ? (maxLen - dist) / maxLen : 0;

  return Math.max(tokenSim, charSim);
}

function gradeSubjective(response, question) {
  if (!response.answer_data || !response.answer_data.trim()) return 0;
  const ans = response.answer_data.trim();
  if (ans.length < 5) return 0;

  if (question.correct_answer && question.correct_answer.trim()) {
    const sim = calculateTextSimilarity(ans, question.correct_answer.trim());
    if (sim >= 0.70) return question.marks;
    if (sim >= 0.40) return Math.round(question.marks * 0.75 * 2) / 2;
    if (sim >= 0.20) return Math.round(question.marks * 0.50 * 2) / 2;
  }

  // Baseline credit for providing detailed response
  return Math.round(question.marks * 0.60 * 2) / 2;
}

function gradeOralTask(response, question) {
  if (!response.answer_data || !response.answer_data.trim()) return 0;
  const ans = response.answer_data.trim();

  if (question.correct_answer && question.correct_answer.trim()) {
    const sim = calculateTextSimilarity(ans, question.correct_answer.trim());
    if (sim >= 0.75) return question.marks;
    if (sim >= 0.45) return Math.round(question.marks * 0.75 * 2) / 2;
    if (sim >= 0.20) return Math.round(question.marks * 0.50 * 2) / 2;
  }

  return Math.round(question.marks * 0.60 * 2) / 2;
}

function stripCodeCommentsAndWhitespace(code) {
  if (!code) return '';
  let clean = String(code);
  // Strip block comments /* ... */ or """ ... """ / ''' ... '''
  clean = clean.replace(/\/\*[\s\S]*?\*\//g, '');
  clean = clean.replace(/"""[\s\S]*?"""/g, '');
  clean = clean.replace(/'''[\s\S]*?'''/g, '');
  // Strip line comments // ... or # ...
  clean = clean.replace(/\/\/.*$/gm, '');
  clean = clean.replace(/#.*$/gm, '');
  // Normalize whitespace
  clean = clean.replace(/\s+/g, ' ').trim();
  return clean;
}

function isBoilerplateOrEmptyCode(code) {
  if (!code || !code.trim()) return true;
  const rawTrimmed = code.trim();
  if (rawTrimmed.length === 0) return true;

  const { LANGUAGE_STARTERS } = require('./codeRunner');

  // Check exact/normalized match with language starter templates
  if (LANGUAGE_STARTERS) {
    for (const starter of Object.values(LANGUAGE_STARTERS)) {
      if (rawTrimmed === starter.trim()) return true;
      const cleanStarter = stripCodeCommentsAndWhitespace(starter);
      const cleanUser = stripCodeCommentsAndWhitespace(code);
      if (cleanUser === cleanStarter) return true;
    }
  }

  const clean = stripCodeCommentsAndWhitespace(code);
  // Extremely short or empty after comment removal
  if (clean.length < 5) return true;

  // Check for trivial Python patterns with no actual logic (for any function name):
  const trivialPython = [
    /^def\s+[a-zA-Z0-9_]+\s*\([^)]*\)\s*:\s*(return\s*[a-zA-Z0-9_]*|pass)\s*(if __name__.*)?$/i,
    /^def\s+[a-zA-Z0-9_]+\s*\([^)]*\)\s*:\s*pass\s*$/i,
    /^def\s+[a-zA-Z0-9_]+\s*\([^)]*\)\s*:\s*return\s*$/i,
    /^def\s+[a-zA-Z0-9_]+\s*\([^)]*\)\s*:\s*return\s+(None|null|""|''|0|input_data|input|s|data|arr|num|n|nums|target|val)\s*(if __name__.*)?$/i,
    /^pass$/i,
    /^return\s*[a-zA-Z0-9_]*;?$/i,
  ];

  for (const pattern of trivialPython) {
    if (pattern.test(clean)) return true;
  }

  // Check for trivial JS patterns (for any function name):
  const trivialJS = [
    /^(function\s+[a-zA-Z0-9_]+|const\s+[a-zA-Z0-9_]+\s*=\s*(function|\([^)]*\)\s*=>))\s*\([^)]*\)\s*\{\s*(return\s*[a-zA-Z0-9_]*;?|;?)\s*\}\s*(const input.*)?$/i,
    /^(function\s+[a-zA-Z0-9_]+|const\s+[a-zA-Z0-9_]+\s*=\s*(function|\([^)]*\)\s*=>))\s*\([^)]*\)\s*\{\s*return\s+(inputData|input|undefined|null|""|''|0|s|data|arr|num|n);?\s*\}\s*(const input.*)?$/i,
  ];

  for (const pattern of trivialJS) {
    if (pattern.test(clean)) return true;
  }

  // Check for trivial C / C++ patterns (for any function name):
  const trivialC = [
    /^(char\*|string|int|void|bool|float|double)\s+[a-zA-Z0-9_]+\s*\([^)]*\)\s*\{\s*return\s+[a-zA-Z0-9_"]*;\s*\}\s*(int main.*)?$/i,
  ];
  for (const pattern of trivialC) {
    if (pattern.test(clean)) return true;
  }

  // Check for trivial SQL patterns:
  const trivialSQL = [
    /^SELECT\s+\*\s+FROM\s+(your_table|table_name|table|sample_table);?$/i,
    /^SELECT\s+\*\s*;?$/i,
  ];
  for (const pattern of trivialSQL) {
    if (pattern.test(clean)) return true;
  }

  // Check for trivial Bash patterns:
  const trivialBash = [
    /^#!\/bin\/(bash|sh)\s*$/i,
    /^#!\/usr\/bin\/env\s+(bash|sh)\s*(cat)?$/i,
  ];
  for (const pattern of trivialBash) {
    if (pattern.test(clean)) return true;
  }

  return false;
}

async function gradeProgramming(response, question) {
  if (!response.answer_data || !response.answer_data.trim()) return 0;
  const code = response.answer_data.trim();

  // 1. If code is trivial boilerplate / starter template with no custom logic, 0 marks
  if (isBoilerplateOrEmptyCode(code)) {
    return 0;
  }

  // 2. Parse test cases if present
  let testCases = question.test_cases;
  if (typeof testCases === 'string') {
    try { testCases = JSON.parse(testCases); } catch (e) { testCases = []; }
  }

  // 3. If question has test cases, execute them against the submitted code
  if (Array.isArray(testCases) && testCases.length > 0) {
    try {
      const { runTestCases, detectLanguage } = require('./codeRunner');
      const lang = detectLanguage(code);
      const testResult = await runTestCases({ code, language: lang, testCases, timeout: 4000 });

      if (testResult && testResult.totalCount > 0) {
        if (testResult.passedCount === 0) return 0;
        const passRatio = testResult.passedCount / testResult.totalCount;
        const awarded = Math.round(question.marks * passRatio * 2) / 2;
        return awarded;
      }
    } catch (err) {
      console.error('gradeProgramming runTestCases error:', err);
    }
  }

  // 4. Fallback if no test cases are configured on the question:
  // Compare with model answer if available
  if (question.correct_answer && question.correct_answer.trim()) {
    const sim = calculateTextSimilarity(code, question.correct_answer.trim());
    if (sim >= 0.85) return question.marks;
    if (sim >= 0.60) return Math.round(question.marks * 0.70 * 2) / 2;
    if (sim >= 0.35) return Math.round(question.marks * 0.40 * 2) / 2;
    return 0;
  }

  // If no test cases and no model answer, do not award marks automatically without verified execution
  return 0;
}

// ─── Auto-grade a single response ───────────────────────────────────────────

async function autoGradeResponse(responseId) {
  const db = getDb();

  const response = await db.prepare(`
    SELECT r.*, q.type, q.marks, q.correct_answer, q.options, q.test_cases
    FROM responses r
    JOIN questions q ON q.id = r.question_id
    WHERE r.id = ?
  `).get(responseId);

  if (!response) return null;

  // Parse options if string
  if (response.options && typeof response.options === 'string') {
    try { response.options = JSON.parse(response.options); } catch (e) {}
  }

  let marksAwarded = 0;
  const scoringType = 'auto';

  if (response.type === 'mcq') {
    marksAwarded = gradeMCQ(response, response);
  } else if (response.type === 'programming') {
    marksAwarded = await gradeProgramming(response, response);
  } else if (response.type === 'oral_task') {
    marksAwarded = gradeOralTask(response, response);
  } else if (response.type === 'subjective' || response.type === 'writing_task') {
    marksAwarded = gradeSubjective(response, response);
  } else {
    marksAwarded = gradeSubjective(response, response);
  }

  // Ensure marks within bounds
  marksAwarded = Math.min(Math.max(0, marksAwarded), response.marks);

  // Insert or update score
  const existingScore = await db.prepare('SELECT id FROM scores WHERE response_id = ?').get(responseId);
  if (existingScore) {
    await db.prepare(
      'UPDATE scores SET marks_awarded = ?, scoring_type = ?, scored_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(marksAwarded, scoringType, existingScore.id);
  } else {
    await db.prepare(
      'INSERT INTO scores (response_id, marks_awarded, scoring_type, scored_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)'
    ).run(responseId, marksAwarded, scoringType);
  }

  // Update response status to graded
  await db.prepare("UPDATE responses SET status = 'graded' WHERE id = ?").run(responseId);

  return marksAwarded;
}

// ─── Auto-grade all pending responses ───────────────────────────────────────

async function autoGradeUngradedResponses() {
  const db = getDb();
  try {
    const responses = await db.prepare(`
      SELECT r.id FROM responses r
      LEFT JOIN scores s ON s.response_id = r.id
      WHERE s.id IS NULL
    `).all();
    for (const r of responses) {
      try { await autoGradeResponse(r.id); } catch (e) {}
    }
  } catch (e) {
    console.error('autoGradeUngradedResponses error:', e);
  }
}

// ─── Recompute component total for a student ────────────────────────────────

async function recomputeComponentTotal(studentId, componentId) {
  const db = getDb();

  // First auto-grade any ungraded responses for this student and component
  try {
    const ungraded = await db.prepare(`
      SELECT r.id FROM responses r
      JOIN exams e ON e.id = r.exam_id
      LEFT JOIN scores s ON s.response_id = r.id
      WHERE r.student_id = ? AND e.component_id = ? AND s.id IS NULL
    `).all(studentId, componentId);

    for (const u of ungraded) {
      try { await autoGradeResponse(u.id); } catch (e) {}
    }
  } catch (e) {}

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

  const totalMarks = Math.round((Number(result.total_marks) || 0) * 10) / 10;
  const examsCompleted = Number(result.exams_completed) || 0;
  const examsGraded = Number(result.exams_graded) || 0;

  // Upsert component total
  const existingCt = await db.prepare(
    'SELECT id FROM component_totals WHERE student_id = ? AND component_id = ?'
  ).get(studentId, componentId);

  if (existingCt) {
    await db.prepare(
      'UPDATE component_totals SET total_marks = ?, exams_completed = ?, exams_graded = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(totalMarks, examsCompleted, examsGraded, existingCt.id);
  } else {
    await db.prepare(
      'INSERT INTO component_totals (student_id, component_id, total_marks, exams_completed, exams_graded, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)'
    ).run(studentId, componentId, totalMarks, examsCompleted, examsGraded);
  }

  return { total_marks: totalMarks, exams_completed: examsCompleted, exams_graded: examsGraded };
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
    scores[c.name] = Number(c.total_marks) || 0;
  }

  const T = scores.technical || 0;
  const L = scores.aptitude || 0;
  const O = scores.oral_english || 0;
  const W = scores.written_english || 0;

  const { total_score, level } = computeComposite(T, L, O, W);

  // Upsert composite score
  const existingCs = await db.prepare('SELECT id FROM composite_scores WHERE student_id = ?').get(studentId);
  if (existingCs) {
    await db.prepare(
      'UPDATE composite_scores SET t_score = ?, l_score = ?, o_score = ?, w_score = ?, total_score = ?, level = ?, computed_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(T, L, O, W, total_score, level, existingCs.id);
  } else {
    await db.prepare(
      'INSERT INTO composite_scores (student_id, t_score, l_score, o_score, w_score, total_score, level, computed_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)'
    ).run(studentId, T, L, O, W, total_score, level);
  }

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
  
  await autoGradeUngradedResponses();

  const students = await db.prepare("SELECT id FROM users WHERE role = 'student'").all();
  const results = [];

  for (const s of students) {
    try {
      const result = await recomputeAllForStudent(s.id);
      results.push({ student_id: s.id, ...result });
    } catch (e) {
      console.error(`Error recomputing student ${s.id}:`, e);
    }
  }

  return results;
}

module.exports = {
  computeComposite,
  gradeMCQ,
  gradeProgramming,
  isBoilerplateOrEmptyCode,
  autoGradeResponse,
  autoGradeUngradedResponses,
  recomputeComponentTotal,
  recomputeComposite,
  recomputeAllForStudent,
  recomputeAllStudents,
  WEIGHTS,
  COMPOSITE_MAX,
  LEVEL_THRESHOLDS,
  ENGLISH_FLOOR,
};
