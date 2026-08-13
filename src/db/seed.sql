-- ══════════════════════════════════════════════════════════════════════════════
-- Seed Data — Components + Default Admin + Sample Data
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── Components (fixed weights) ─────────────────────────────────────────────
INSERT OR IGNORE INTO components (name, display_name, weight, max_raw_score, question_type_mix) VALUES
  ('technical',       'Technical',       3, 500, '{"mcq":15,"subjective":10,"programming":25}'),
  ('aptitude',        'Logical & Aptitude', 3, 500, '{"mcq":35,"subjective":15}'),
  ('oral_english',    'Oral English',    2, 500, '{"oral_task":50}'),
  ('written_english', 'Written English', 2, 500, '{"mcq":15,"subjective":20,"writing_task":15}');

-- ─── Default Admin ──────────────────────────────────────────────────────────
-- Password: admin123 (bcrypt hash)
INSERT OR IGNORE INTO users (name, email, password_hash, role) VALUES
  ('Admin', 'admin@cas.local', '$2a$10$8KzVMQzJx8Gk6Q5X1YqKXO7KwJRmGxZFpE5r3V0yN8jQfZx9QWXWW', 'admin');

-- ─── Default Evaluator ─────────────────────────────────────────────────────
-- Password: eval123
INSERT OR IGNORE INTO users (name, email, password_hash, role) VALUES
  ('Evaluator', 'evaluator@cas.local', '$2a$10$8KzVMQzJx8Gk6Q5X1YqKXO7KwJRmGxZFpE5r3V0yN8jQfZx9QWXWW', 'evaluator');

-- ─── Sample Students ────────────────────────────────────────────────────────
-- Password: student123
INSERT OR IGNORE INTO users (name, email, password_hash, role, roll_no) VALUES
  ('Alice Johnson',  'alice@cas.local',  '$2a$10$8KzVMQzJx8Gk6Q5X1YqKXO7KwJRmGxZFpE5r3V0yN8jQfZx9QWXWW', 'student', 'STU001'),
  ('Bob Smith',      'bob@cas.local',    '$2a$10$8KzVMQzJx8Gk6Q5X1YqKXO7KwJRmGxZFpE5r3V0yN8jQfZx9QWXWW', 'student', 'STU002'),
  ('Charlie Brown',  'charlie@cas.local','$2a$10$8KzVMQzJx8Gk6Q5X1YqKXO7KwJRmGxZFpE5r3V0yN8jQfZx9QWXWW', 'student', 'STU003');

-- ─── Create default exams (10 per component) ────────────────────────────────
-- Technical exams 1-10
INSERT OR IGNORE INTO exams (component_id, exam_number, title, total_marks, duration_minutes, question_type_mix) VALUES
  (1, 1,  'Technical Exam 1',  50, 60, '{"mcq":15,"subjective":10,"programming":25}'),
  (1, 2,  'Technical Exam 2',  50, 60, '{"mcq":15,"subjective":10,"programming":25}'),
  (1, 3,  'Technical Exam 3',  50, 60, '{"mcq":15,"subjective":10,"programming":25}'),
  (1, 4,  'Technical Exam 4',  50, 60, '{"mcq":15,"subjective":10,"programming":25}'),
  (1, 5,  'Technical Exam 5',  50, 60, '{"mcq":15,"subjective":10,"programming":25}'),
  (1, 6,  'Technical Exam 6',  50, 60, '{"mcq":15,"subjective":10,"programming":25}'),
  (1, 7,  'Technical Exam 7',  50, 60, '{"mcq":15,"subjective":10,"programming":25}'),
  (1, 8,  'Technical Exam 8',  50, 60, '{"mcq":15,"subjective":10,"programming":25}'),
  (1, 9,  'Technical Exam 9',  50, 60, '{"mcq":15,"subjective":10,"programming":25}'),
  (1, 10, 'Technical Exam 10', 50, 60, '{"mcq":15,"subjective":10,"programming":25}');

-- Aptitude exams 1-10
INSERT OR IGNORE INTO exams (component_id, exam_number, title, total_marks, duration_minutes, question_type_mix) VALUES
  (2, 1,  'Aptitude Exam 1',  50, 60, '{"mcq":35,"subjective":15}'),
  (2, 2,  'Aptitude Exam 2',  50, 60, '{"mcq":35,"subjective":15}'),
  (2, 3,  'Aptitude Exam 3',  50, 60, '{"mcq":35,"subjective":15}'),
  (2, 4,  'Aptitude Exam 4',  50, 60, '{"mcq":35,"subjective":15}'),
  (2, 5,  'Aptitude Exam 5',  50, 60, '{"mcq":35,"subjective":15}'),
  (2, 6,  'Aptitude Exam 6',  50, 60, '{"mcq":35,"subjective":15}'),
  (2, 7,  'Aptitude Exam 7',  50, 60, '{"mcq":35,"subjective":15}'),
  (2, 8,  'Aptitude Exam 8',  50, 60, '{"mcq":35,"subjective":15}'),
  (2, 9,  'Aptitude Exam 9',  50, 60, '{"mcq":35,"subjective":15}'),
  (2, 10, 'Aptitude Exam 10', 50, 60, '{"mcq":35,"subjective":15}');

-- Oral English exams 1-10
INSERT OR IGNORE INTO exams (component_id, exam_number, title, total_marks, duration_minutes, question_type_mix) VALUES
  (3, 1,  'Oral English Exam 1',  50, 30, '{"oral_task":50}'),
  (3, 2,  'Oral English Exam 2',  50, 30, '{"oral_task":50}'),
  (3, 3,  'Oral English Exam 3',  50, 30, '{"oral_task":50}'),
  (3, 4,  'Oral English Exam 4',  50, 30, '{"oral_task":50}'),
  (3, 5,  'Oral English Exam 5',  50, 30, '{"oral_task":50}'),
  (3, 6,  'Oral English Exam 6',  50, 30, '{"oral_task":50}'),
  (3, 7,  'Oral English Exam 7',  50, 30, '{"oral_task":50}'),
  (3, 8,  'Oral English Exam 8',  50, 30, '{"oral_task":50}'),
  (3, 9,  'Oral English Exam 9',  50, 30, '{"oral_task":50}'),
  (3, 10, 'Oral English Exam 10', 50, 30, '{"oral_task":50}');

-- Written English exams 1-10
INSERT OR IGNORE INTO exams (component_id, exam_number, title, total_marks, duration_minutes, question_type_mix) VALUES
  (4, 1,  'Written English Exam 1',  50, 60, '{"mcq":15,"subjective":20,"writing_task":15}'),
  (4, 2,  'Written English Exam 2',  50, 60, '{"mcq":15,"subjective":20,"writing_task":15}'),
  (4, 3,  'Written English Exam 3',  50, 60, '{"mcq":15,"subjective":20,"writing_task":15}'),
  (4, 4,  'Written English Exam 4',  50, 60, '{"mcq":15,"subjective":20,"writing_task":15}'),
  (4, 5,  'Written English Exam 5',  50, 60, '{"mcq":15,"subjective":20,"writing_task":15}'),
  (4, 6,  'Written English Exam 6',  50, 60, '{"mcq":15,"subjective":20,"writing_task":15}'),
  (4, 7,  'Written English Exam 7',  50, 60, '{"mcq":15,"subjective":20,"writing_task":15}'),
  (4, 8,  'Written English Exam 8',  50, 60, '{"mcq":15,"subjective":20,"writing_task":15}'),
  (4, 9,  'Written English Exam 9',  50, 60, '{"mcq":15,"subjective":20,"writing_task":15}'),
  (4, 10, 'Written English Exam 10', 50, 60, '{"mcq":15,"subjective":20,"writing_task":15}');
