const { getDb } = require('./src/db/database');

async function seed() {
  const db = getDb();
  
  try {
    const exam = await db.prepare('SELECT id FROM exams LIMIT 1').get();
    const student = await db.prepare('SELECT id FROM users WHERE role="student" LIMIT 1').get();
    
    if (exam && student) {
      const q = await db.prepare('INSERT INTO questions (exam_id, type, marks, content) VALUES (?, ?, ?, ?)').run(exam.id, 'subjective', 10, 'Explain recursion in your own words.');
      
      await db.prepare('INSERT INTO exam_sessions (student_id, exam_id, status) VALUES (?, ?, ?)').run(student.id, exam.id, 'submitted');
      
      await db.prepare('INSERT INTO responses (student_id, exam_id, question_id, answer_data, status) VALUES (?, ?, ?, ?, ?)').run(student.id, exam.id, q.lastInsertRowid, 'A function calling itself until a base case.', 'pending_review');
      
      console.log('Subjective response created for evaluator queue');
    }
  } catch(e) {
    console.log(e);
  }
}

seed();
