/**
 * Auth Routes — Login / Logout / Session Info
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/database');

const router = express.Router();

// ─── POST /api/auth/login ───────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const db = getDb();
    const user = await db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(email.toLowerCase().trim());

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Set session
    req.session.userId = user.id;
    req.session.role = user.role;

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        roll_no: user.roll_no,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ─── POST /api/auth/access-code-login ──────────────────────────────────────
router.post('/access-code-login', async (req, res) => {
  try {
    const { roll_no, access_code } = req.body;

    if (!roll_no || !access_code) {
      return res.status(400).json({ error: 'Roll Number and Exam Access Code are required' });
    }

    const db = getDb();

    // 1. Check student by Roll Number (or Email)
    const student = await db.prepare(`
      SELECT * FROM users
      WHERE (LOWER(roll_no) = ? OR LOWER(email) = ?) AND role = 'student' AND active = 1
    `).get(roll_no.trim().toLowerCase(), roll_no.trim().toLowerCase());

    if (!student) {
      return res.status(401).json({ error: 'Invalid Roll Number. Student not found in system.' });
    }

    // 2. Check exam by Access Code
    const cleanCode = access_code.trim().toUpperCase();
    const exam = await db.prepare(`
      SELECT e.*, c.display_name as component_name
      FROM exams e
      JOIN components c ON c.id = e.component_id
      WHERE UPPER(e.access_code) = ?
    `).get(cleanCode);

    if (!exam) {
      return res.status(401).json({ error: 'Invalid Access Code. Please request a valid access code from your admin.' });
    }

    if (!exam.is_published) {
      return res.status(403).json({ error: 'This exam has not been published by the admin yet.' });
    }

    if (exam.access_code_expires_at && new Date() > new Date(exam.access_code_expires_at)) {
      return res.status(401).json({ error: 'This Exam Access Code has expired. Please ask your administrator to generate a new access code for the active exam period.' });
    }

    // Check if exam is assigned to specific student batches
    const examBatchCountObj = await db.prepare('SELECT COUNT(*) as count FROM exam_batches WHERE exam_id = ?').get(exam.id);
    const examBatchCount = examBatchCountObj.count;
    if (examBatchCount > 0) {
      const isEnrolledObj = await db.prepare(`
        SELECT COUNT(*) as count FROM student_batches
        WHERE student_id = ? AND batch_id IN (SELECT batch_id FROM exam_batches WHERE exam_id = ?)
      `).get(student.id, exam.id);
      const isEnrolled = isEnrolledObj.count;

      if (isEnrolled === 0) {
        return res.status(403).json({ error: 'You are not enrolled in the student batch assigned to this exam.' });
      }
    }

    // Set student session
    req.session.userId = student.id;
    req.session.role = 'student';
    req.session.targetExamId = exam.id;

    // Update active session ID for single-login enforcement
    await db.prepare('UPDATE users SET active_session_id = ? WHERE id = ?').run(req.sessionID, student.id);

    res.json({
      user: {
        id: student.id,
        name: student.name,
        email: student.email,
        role: student.role,
        roll_no: student.roll_no,
      },
      exam: {
        id: exam.id,
        title: exam.title,
        component_name: exam.component_name,
        duration_minutes: exam.duration_minutes,
        timer_enabled: exam.timer_enabled !== 0,
        access_code: exam.access_code,
      },
    });
  } catch (err) {
    console.error('Access code login error:', err);
    res.status(500).json({ error: 'Access code login failed' });
  }
});

// ─── POST /api/auth/logout ──────────────────────────────────────────────────
router.post('/logout', async (req, res) => {
  const userId = req.session?.userId;
  req.session.destroy(async (err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    if (userId) {
      try {
        const db = getDb();
        await db.prepare('UPDATE users SET active_session_id = NULL WHERE id = ?').run(userId);
      } catch (e) {
        console.error('Failed to clear active_session_id:', e);
      }
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out' });
  });
});

// ─── GET /api/auth/me ───────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  // Prevent aggressive caching of the auth state
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const db = getDb();
    const user = await db.prepare('SELECT id, name, email, role, roll_no FROM users WHERE id = ?').get(req.session.userId);

    if (!user) {
      req.session.destroy();
      return res.status(401).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (err) {
    console.error('Auth check error:', err);
    res.status(500).json({ error: 'Auth check failed' });
  }
});

module.exports = router;
