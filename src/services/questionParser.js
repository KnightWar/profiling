/**
 * Question & Student File Parser
 * ───────────────────────────────
 * Parses uploaded XLSX/CSV/JSON files into question or student arrays.
 */

const fs = require('fs');
const path = require('path');

// ─── Parse question file (XLSX/CSV/JSON) ────────────────────────────────────

function parseQuestionFile(filePath, originalName) {
  const ext = path.extname(originalName || filePath).toLowerCase();

  if (ext === '.json') {
    return parseJSON(filePath);
  } else if (ext === '.csv') {
    return parseCSV(filePath);
  } else if (ext === '.xlsx' || ext === '.xls') {
    return parseXLSX(filePath);
  } else {
    throw new Error(`Unsupported file type: ${ext}. Use .json, .csv, or .xlsx`);
  }
}

function parseJSON(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) {
    throw new Error('JSON must be an array of questions');
  }
  return data.map(normalizeQuestion);
}

function parseCSV(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').map(l => l.trim()).filter(l => l);

  if (lines.length < 2) {
    throw new Error('CSV must have header row + at least 1 data row');
  }

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
  const questions = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ''; });

    questions.push(normalizeQuestion(row));
  }

  return questions;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseXLSX(filePath) {
  try {
    const XLSX = require('xlsx');
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet);

    return rows.map(normalizeQuestion);
  } catch (err) {
    throw new Error(`Failed to parse XLSX: ${err.message}`);
  }
}

// ─── Normalize a raw question row ───────────────────────────────────────────

function normalizeQuestion(raw) {
  const q = {};

  // Type
  q.type = (raw.type || raw.Type || raw.question_type || 'mcq').toLowerCase().trim();

  // Map common type names
  const typeMap = {
    'mcq': 'mcq',
    'multiple choice': 'mcq',
    'subjective': 'subjective',
    'short answer': 'subjective',
    'programming': 'programming',
    'code': 'programming',
    'oral': 'oral_task',
    'oral_task': 'oral_task',
    'writing': 'writing_task',
    'writing_task': 'writing_task',
    'email': 'writing_task',
    'report': 'writing_task',
  };
  q.type = typeMap[q.type] || q.type;

  // Content
  let content = raw.content || raw.question || raw.Question || raw.text || '';
  if (typeof content === 'string' && content.includes('\\n') && !content.includes('\n')) {
    content = content.replace(/\\n/g, '\n');
  }
  q.content = content;

  // Marks
  q.marks = parseInt(raw.marks || raw.Marks || raw.mark || 1) || 1;

  // Options (MCQ)
  if (raw.options) {
    q.options = Array.isArray(raw.options) ? raw.options : JSON.parse(raw.options);
  } else if (raw['Option A'] || raw['option_a'] || raw['option a']) {
    q.options = [
      raw['Option A'] || raw['option_a'] || raw['option a'] || '',
      raw['Option B'] || raw['option_b'] || raw['option b'] || '',
      raw['Option C'] || raw['option_c'] || raw['option c'] || '',
      raw['Option D'] || raw['option_d'] || raw['option d'] || '',
    ].filter(o => o);
  }

  // Correct answer
  let correctAnswer = raw.correct_answer || raw.correct || raw['Correct Answer'] || raw['correct answer'] || null;
  if (typeof correctAnswer === 'string' && correctAnswer.includes('\\n') && !correctAnswer.includes('\n')) {
    correctAnswer = correctAnswer.replace(/\\n/g, '\n');
  }
  q.correct_answer = correctAnswer;

  // Map numeric correct answers to letters (1=A, 2=B, etc.)
  if (q.correct_answer && !isNaN(q.correct_answer)) {
    const map = { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'E', 6: 'F' };
    q.correct_answer = map[parseInt(q.correct_answer)] || q.correct_answer;
  }

  // Test cases (programming)
  if (raw.test_cases) {
    q.test_cases = typeof raw.test_cases === 'string' ? JSON.parse(raw.test_cases) : raw.test_cases;
  }

  // Rubric
  if (raw.rubric) {
    q.rubric = typeof raw.rubric === 'string' ? JSON.parse(raw.rubric) : raw.rubric;
  }

  // Difficulty
  q.difficulty = (raw.difficulty || raw.Difficulty || 'medium').toLowerCase().trim();

  return q;
}

// ─── Parse student CSV or XLSX ──────────────────────────────────────────────

function parseStudentFile(filePath, originalName) {
  const ext = path.extname(originalName || filePath).toLowerCase();

  if (ext === '.xlsx' || ext === '.xls') {
    try {
      const XLSX = require('xlsx');
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet);

      return rows.map(row => {
        const cleanRow = {};
        Object.keys(row).forEach(k => { cleanRow[k.toLowerCase().trim()] = String(row[k]).trim(); });
        const rollNo = cleanRow.roll_no || cleanRow.rollno || cleanRow.roll || cleanRow['roll no'] || cleanRow.reg_no || cleanRow.regno || cleanRow['reg no'] || cleanRow['registration no'] || '';
        const name = cleanRow.name || cleanRow.student_name || cleanRow['student name'] || '';
        const email = cleanRow.email || (rollNo ? `${rollNo.toLowerCase()}@student.local` : '');
        return {
          name,
          email,
          password: cleanRow.password || 'student123',
          roll_no: rollNo,
          phone: cleanRow.phone || cleanRow.mobile || '',
        };
      }).filter(s => s.name && s.roll_no);
    } catch (err) {
      throw new Error(`Failed to parse student XLSX: ${err.message}`);
    }
  }

  return parseStudentCSV(filePath);
}

function parseStudentCSV(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').map(l => l.trim()).filter(l => l);

  if (lines.length < 2) {
    throw new Error('CSV must have header + at least 1 row');
  }

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
  const students = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ''; });

    const rollNo = row.roll_no || row.rollno || row.roll || row['roll no'] || row.reg_no || row.regno || row['reg no'] || row['registration no'] || '';
    const name = row.name || row.student_name || row['student name'] || '';
    const email = row.email || (rollNo ? `${rollNo.toLowerCase()}@student.local` : '');

    students.push({
      name,
      email,
      password: row.password || 'student123',
      roll_no: rollNo,
      phone: row.phone || row.mobile || '',
    });
  }

  return students.filter(s => s.name && s.roll_no);
}

module.exports = { parseQuestionFile, parseStudentFile, parseStudentCSV, normalizeQuestion };
