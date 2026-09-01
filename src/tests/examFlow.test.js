const test = require('node:test');
const assert = require('node:assert/strict');
const { getDb } = require('../db/database');
const { autoGradeResponse, recomputeComponentTotal, recomputeComposite } = require('../services/scoring');

test('End-to-End Exam Lifecycle & Auto-Scoring Verification', async (t) => {
  const db = getDb();

  // 1. Setup mock student and test questions in database
  const student = await db.prepare(`
    INSERT INTO users (name, email, password_hash, role, roll_no)
    VALUES ('Test Flow Student', 'flow@test.edu', 'hash', 'student', 'ROLL_FLOW_101')
  `).run();
  const studentId = student.lastInsertRowid;

  // Insert a test exam with unique exam_number
  const exam = await db.prepare(`
    INSERT INTO exams (component_id, exam_number, title, duration_minutes, total_marks, is_published)
    VALUES (1, 999, 'Comprehensive Flow Test Exam', 60, 50, 1)
  `).run();
  const examId = exam.lastInsertRowid;

  // Question 1: MCQ (5 marks)
  const q1 = await db.prepare(`
    INSERT INTO questions (exam_id, type, content, marks, correct_answer, options, sort_order)
    VALUES (?, 'mcq', 'What is 2 + 2?', 5, 'B', '["2", "4", "6", "8"]', 1)
  `).run(examId);
  const q1Id = q1.lastInsertRowid;

  // Question 2: Programming Python (10 marks)
  const q2 = await db.prepare(`
    INSERT INTO questions (exam_id, type, content, marks, correct_answer, test_cases, sort_order)
    VALUES (?, 'programming', 'Palindrome check', 10, 'def solution(s): return s == s[::-1]', ?, 2)
  `).run(examId, JSON.stringify([
    { input: 'radar', expected: 'True' },
    { input: 'python', expected: 'False' },
  ]));
  const q2Id = q2.lastInsertRowid;

  // Question 3: Programming SQL (10 marks)
  const q3 = await db.prepare(`
    INSERT INTO questions (exam_id, type, content, marks, correct_answer, test_cases, sort_order)
    VALUES (?, 'programming', 'Find top salary', 10, 'SELECT max(salary) FROM emp;', ?, 3)
  `).run(examId, JSON.stringify([
    {
      input: "CREATE TABLE emp (id INT, salary INT); INSERT INTO emp VALUES (1, 5000), (2, 9000), (3, 7500);",
      expected: "max(salary)\n9000",
    },
  ]));
  const q3Id = q3.lastInsertRowid;

  // Question 4: Programming Bash (10 marks)
  const q4 = await db.prepare(`
    INSERT INTO questions (exam_id, type, content, marks, correct_answer, test_cases, sort_order)
    VALUES (?, 'programming', 'Filter errors', 10, 'grep "ERROR"', ?, 4)
  `).run(examId, JSON.stringify([
    {
      input: "OK: server running\nERROR: database down\nINFO: user login\n",
      expected: "ERROR: database down",
    },
  ]));
  const q4Id = q4.lastInsertRowid;

  // 2. Start Exam Session
  const session = await db.prepare(`
    INSERT INTO exam_sessions (student_id, exam_id, status, started_at, ends_at)
    VALUES (?, ?, 'active', CURRENT_TIMESTAMP, datetime('now', '+60 minutes'))
  `).run(studentId, examId);
  const sessionId = session.lastInsertRowid;

  await t.test('Question Navigation & Response Auto-Saving', async () => {
    // Navigate to Q1 and answer correctly
    await db.prepare(`
      INSERT INTO responses (student_id, exam_id, question_id, answer_data, submitted_at, status)
      VALUES (?, ?, ?, 'B', CURRENT_TIMESTAMP, 'submitted')
    `).run(studentId, examId, q1Id);

    // Navigate to Q2 and write working Python solution
    const workingPython = `
def solution(s):
    return str(s == s[::-1])

if __name__ == '__main__':
    import sys
    print(solution(sys.stdin.read().strip()))
    `;
    await db.prepare(`
      INSERT INTO responses (student_id, exam_id, question_id, answer_data, submitted_at, status)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 'submitted')
    `).run(studentId, examId, q2Id, workingPython);

    // Navigate to Q3 and write working SQL query
    const workingSQL = `
      SELECT max(salary) FROM emp;
    `;
    await db.prepare(`
      INSERT INTO responses (student_id, exam_id, question_id, answer_data, submitted_at, status)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 'submitted')
    `).run(studentId, examId, q3Id, workingSQL);

    // Navigate to Q4 and write working Bash command
    const workingBash = `
      grep "ERROR"
    `;
    await db.prepare(`
      INSERT INTO responses (student_id, exam_id, question_id, answer_data, submitted_at, status)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 'submitted')
    `).run(studentId, examId, q4Id, workingBash);

    const savedResponses = await db.prepare(
      'SELECT * FROM responses WHERE student_id = ? AND exam_id = ?'
    ).all(studentId, examId);

    assert.equal(savedResponses.length, 4, 'All 4 answers should be saved');
  });

  await t.test('Exam Submission & Auto-Grading Scoring Accuracy', async () => {
    // Mark session as submitted
    await db.prepare(`
      UPDATE exam_sessions SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(sessionId);

    // Auto-grade all responses
    const responses = await db.prepare(
      'SELECT id, question_id FROM responses WHERE student_id = ? AND exam_id = ?'
    ).all(studentId, examId);

    for (const r of responses) {
      await autoGradeResponse(r.id);
    }

    // Verify individual scores
    const r1Score = await db.prepare(
      'SELECT marks_awarded FROM scores s JOIN responses r ON r.id = s.response_id WHERE r.question_id = ? AND r.student_id = ?'
    ).get(q1Id, studentId);
    assert.equal(r1Score.marks_awarded, 5, 'MCQ (Q1) should score 5/5');

    const r2Score = await db.prepare(
      'SELECT marks_awarded FROM scores s JOIN responses r ON r.id = s.response_id WHERE r.question_id = ? AND r.student_id = ?'
    ).get(q2Id, studentId);
    assert.equal(r2Score.marks_awarded, 10, 'Python (Q2) should score 10/10');

    const r3Score = await db.prepare(
      'SELECT marks_awarded FROM scores s JOIN responses r ON r.id = s.response_id WHERE r.question_id = ? AND r.student_id = ?'
    ).get(q3Id, studentId);
    assert.equal(r3Score.marks_awarded, 10, 'SQL (Q3) should score 10/10');

    const r4Score = await db.prepare(
      'SELECT marks_awarded FROM scores s JOIN responses r ON r.id = s.response_id WHERE r.question_id = ? AND r.student_id = ?'
    ).get(q4Id, studentId);
    assert.equal(r4Score.marks_awarded, 10, 'Bash (Q4) should score 10/10');
  });

  await t.test('Component and Composite Totals Recomputation', async () => {
    const compTotal = await recomputeComponentTotal(studentId, 1);
    assert.ok(compTotal.total_marks > 0, `Total marks should be positive, got ${compTotal.total_marks}`);

    const composite = await recomputeComposite(studentId);
    assert.ok(composite.total_score > 0, `Composite score should be positive, got ${composite.total_score}`);
    assert.ok(composite.level >= 1, `Composite level should be assigned, got ${composite.level}`);
  });

  // Cleanup test records
  await db.prepare('DELETE FROM scores WHERE response_id IN (SELECT id FROM responses WHERE student_id = ?)').run(studentId);
  await db.prepare('DELETE FROM responses WHERE student_id = ?').run(studentId);
  await db.prepare('DELETE FROM exam_sessions WHERE student_id = ?').run(studentId);
  await db.prepare('DELETE FROM questions WHERE exam_id = ?').run(examId);
  await db.prepare('DELETE FROM exams WHERE id = ?').run(examId);
  await db.prepare('DELETE FROM component_totals WHERE student_id = ?').run(studentId);
  await db.prepare('DELETE FROM composite_scores WHERE student_id = ?').run(studentId);
  await db.prepare('DELETE FROM users WHERE id = ?').run(studentId);
});
