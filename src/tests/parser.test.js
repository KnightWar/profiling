const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const XLSX = require('xlsx');
const { normalizeQuestion, parseQuestionFile, parseStudentFile, parseStudentCSV } = require('../services/questionParser');

test('normalizeQuestion converts raw rows into standardized question structure', () => {
  const rawMCQ = {
    type: 'mcq',
    question: 'What is SQLite?',
    'Option A': 'A database',
    'Option B': 'A framework',
    'Option C': 'A language',
    'Option D': 'An OS',
    'Correct Answer': 'A',
    marks: '1',
  };

  const norm = normalizeQuestion(rawMCQ);
  assert.equal(norm.type, 'mcq');
  assert.equal(norm.content, 'What is SQLite?');
  assert.deepEqual(norm.options, ['A database', 'A framework', 'A language', 'An OS']);
  assert.equal(norm.correct_answer, 'A');
  assert.equal(norm.marks, 1);
});

test('parseStudentCSV parses student CSV format accurately', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
  const csvPath = path.join(tmpDir, 'students.csv');
  const csvData = `name,email,roll_no\nAlice,alice@example.com,ST001\nBob,bob@example.com,ST002`;
  fs.writeFileSync(csvPath, csvData);

  const students = parseStudentCSV(csvPath);
  assert.equal(students.length, 2);
  assert.equal(students[0].name, 'Alice');
  assert.equal(students[0].email, 'alice@example.com');
  assert.equal(students[0].roll_no, 'ST001');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('parseStudentFile parses student XLSX templates cleanly', () => {
  const xlsxPath = path.resolve(__dirname, '../../public/templates/students_template.xlsx');
  if (fs.existsSync(xlsxPath)) {
    const students = parseStudentFile(xlsxPath, 'students_template.xlsx');
    assert.ok(students.length >= 5);
    assert.equal(students[0].name, 'Alice Johnson');
    assert.equal(students[0].email, 'reg001@student.local');
    assert.equal(students[0].roll_no, 'REG001');
  }
});

test('parseQuestionFile parses question XLSX templates cleanly', () => {
  const xlsxPath = path.resolve(__dirname, '../../public/templates/questions_template.xlsx');
  if (fs.existsSync(xlsxPath)) {
    const questions = parseQuestionFile(xlsxPath, 'questions_template.xlsx');
    assert.ok(questions.length >= 5);
    assert.equal(questions[0].type, 'mcq');
    assert.equal(questions[0].correct_answer, 'B');
    assert.equal(questions[4].type, 'writing_task');
    assert.equal(questions[5].type, 'oral_task');
  }
});
