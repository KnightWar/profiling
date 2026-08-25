const test = require('node:test');
const assert = require('node:assert/strict');
const { getDb } = require('../db/database');

test('Question delete cleans up responses and questions without error', async () => {
  const db = getDb();

  // Create a test question
  const insertQ = db.prepare(`
    INSERT INTO questions (exam_id, type, marks, content, options, correct_answer, sort_order, source, difficulty)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const qResult = await insertQ.run(1, 'programming', 5, 'Sample problem statement', null, 'print("ok")', 999, 'manual', 'medium');
  const qId = qResult.lastInsertRowid;

  // Insert a dummy response for this question if table exists
  const rResult = await db.prepare(`
    INSERT INTO responses (student_id, exam_id, question_id, answer_data, status)
    VALUES (?, ?, ?, ?, ?)
  `).run(1, 1, qId, 'print("student test")', 'submitted');
  const rId = rResult.lastInsertRowid;

  // Insert score
  await db.prepare(`
    INSERT INTO scores (response_id, marks_awarded, scored_by, scoring_type)
    VALUES (?, ?, ?, ?)
  `).run(rId, 5, null, 'auto');

  // Verify records exist
  const checkQ = await db.prepare('SELECT id FROM questions WHERE id = ?').get(qId);
  assert.ok(checkQ);

  // Now delete responses, scores and question (mimicking questions.js delete logic)
  await db.prepare('DELETE FROM scores WHERE response_id IN (SELECT id FROM responses WHERE question_id = ?)').run(qId);
  await db.prepare('DELETE FROM responses WHERE question_id = ?').run(qId);
  const delResult = await db.prepare('DELETE FROM questions WHERE id = ? AND exam_id = ?').run(qId, 1);

  assert.equal(delResult.changes, 1);

  const checkQAfter = await db.prepare('SELECT id FROM questions WHERE id = ?').get(qId);
  assert.equal(checkQAfter, undefined);
  const checkRAfter = await db.prepare('SELECT id FROM responses WHERE question_id = ?').get(qId);
  assert.equal(checkRAfter, undefined);
});
