-- ══════════════════════════════════════════════════════════════════════════════
-- Composite Assessment System — Database Schema
-- ══════════════════════════════════════════════════════════════════════════════
-- Scoring: S = 3T + 3L + 2O + 2W   (Max = 5000)
-- Levels:  3 (≥3750 AND English≥500), 2 (≥2500), 1 (<2500)
-- ══════════════════════════════════════════════════════════════════════════════

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ─── Users ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  email         TEXT    UNIQUE NOT NULL,
  password_hash TEXT    NOT NULL,
  role          TEXT    CHECK(role IN ('admin','student','evaluator')) NOT NULL DEFAULT 'student',
  roll_no       TEXT,
  phone         TEXT,
  active        INTEGER DEFAULT 1,
  login_authorized INTEGER DEFAULT 0,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role);

-- ─── Components ─────────────────────────────────────────────────────────────
-- Fixed: Technical(3), Aptitude(3), Oral English(2), Written English(2)
CREATE TABLE IF NOT EXISTS components (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    UNIQUE NOT NULL,
  display_name  TEXT    NOT NULL,
  weight        INTEGER NOT NULL,
  max_raw_score INTEGER DEFAULT 500,
  question_type_mix TEXT -- JSON: default mix per 50-mark exam
);

-- ─── Exams ──────────────────────────────────────────────────────────────────
-- 10 exams per component × 4 components = 40 total
CREATE TABLE IF NOT EXISTS exams (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  component_id        INTEGER NOT NULL REFERENCES components(id),
  exam_number         INTEGER NOT NULL,
  title               TEXT    NOT NULL DEFAULT 'Exam',
  total_marks         INTEGER DEFAULT 50,
  duration_minutes    INTEGER DEFAULT 60,
  timer_enabled       INTEGER DEFAULT 1,
  is_published        INTEGER DEFAULT 0,
  access_code         TEXT    UNIQUE,
  access_code_expires_at DATETIME,
  start_time          DATETIME,
  question_type_mix   TEXT, -- JSON override: {"mcq":15,"subjective":10,"programming":25}
  instructions        TEXT,
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(component_id, exam_number)
);

CREATE INDEX IF NOT EXISTS idx_exams_component ON exams(component_id);

-- ─── Questions ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS questions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id         INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  type            TEXT    CHECK(type IN ('mcq','subjective','programming','oral_task','writing_task')) NOT NULL,
  marks           INTEGER NOT NULL CHECK(marks > 0),
  content         TEXT    NOT NULL,
  options         TEXT,   -- JSON for MCQ: ["opt A","opt B","opt C","opt D"]
  correct_answer  TEXT,   -- MCQ: "A"/"B"/"C"/"D"; others: model answer text
  test_cases      TEXT,   -- JSON for programming: [{"input":"...","expected":"..."}]
  rubric          TEXT,   -- JSON for subjective/oral: {"criteria":[...]}
  sort_order      INTEGER DEFAULT 0,
  source          TEXT    DEFAULT 'manual' CHECK(source IN ('manual','ai_generated')),
  difficulty      TEXT    DEFAULT 'medium' CHECK(difficulty IN ('easy','medium','hard')),
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_questions_exam ON questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_questions_type ON questions(type);

-- ─── Exam Sessions ──────────────────────────────────────────────────────────
-- Tracks when a student starts/finishes an exam (server-enforced timer)
CREATE TABLE IF NOT EXISTS exam_sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL REFERENCES users(id),
  exam_id     INTEGER NOT NULL REFERENCES exams(id),
  started_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  ends_at     DATETIME NOT NULL,
  submitted_at DATETIME,
  status      TEXT    DEFAULT 'active' CHECK(status IN ('active','submitted','expired','abandoned')),
  UNIQUE(student_id, exam_id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_student ON exam_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status  ON exam_sessions(status);

-- ─── Responses ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS responses (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id    INTEGER NOT NULL REFERENCES users(id),
  exam_id       INTEGER NOT NULL REFERENCES exams(id),
  question_id   INTEGER NOT NULL REFERENCES questions(id),
  answer_data   TEXT,     -- Text answer, selected option letter, or code
  audio_url     TEXT,     -- For oral questions: path to audio file
  submitted_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  status        TEXT     DEFAULT 'submitted' CHECK(status IN ('submitted','graded','flagged','pending_review')),
  UNIQUE(student_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_responses_student  ON responses(student_id);
CREATE INDEX IF NOT EXISTS idx_responses_exam     ON responses(exam_id);
CREATE INDEX IF NOT EXISTS idx_responses_status   ON responses(status);

-- ─── Scores ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scores (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  response_id   INTEGER NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  marks_awarded REAL    NOT NULL CHECK(marks_awarded >= 0),
  scored_by     INTEGER REFERENCES users(id),  -- NULL = auto-graded (MCQ/code)
  scoring_type  TEXT    DEFAULT 'manual' CHECK(scoring_type IN ('auto','manual')),
  feedback      TEXT,
  scored_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(response_id)
);

CREATE INDEX IF NOT EXISTS idx_scores_response ON scores(response_id);

-- ─── Component Totals (cached per student per component) ────────────────────
CREATE TABLE IF NOT EXISTS component_totals (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id      INTEGER NOT NULL REFERENCES users(id),
  component_id    INTEGER NOT NULL REFERENCES components(id),
  total_marks     REAL    DEFAULT 0,
  exams_completed INTEGER DEFAULT 0,
  exams_graded    INTEGER DEFAULT 0,
  is_finalized    INTEGER DEFAULT 0,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, component_id)
);

CREATE INDEX IF NOT EXISTS idx_ct_student ON component_totals(student_id);

-- ─── Composite Scores (final per student) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS composite_scores (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL REFERENCES users(id) UNIQUE,
  t_score     REAL DEFAULT 0,  -- Technical raw total (/500)
  l_score     REAL DEFAULT 0,  -- Aptitude raw total (/500)
  o_score     REAL DEFAULT 0,  -- Oral English raw total (/500)
  w_score     REAL DEFAULT 0,  -- Written English raw total (/500)
  total_score REAL DEFAULT 0,  -- S = 3T + 3L + 2O + 2W (/5000)
  level       INTEGER,         -- 1, 2, or 3
  computed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── Violations / Proctoring Logs ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS violations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL REFERENCES users(id),
  exam_id     INTEGER NOT NULL REFERENCES exams(id),
  type        TEXT    NOT NULL,  -- 'tab_switch','copy_paste','right_click','webcam_missing'
  details     TEXT,
  timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_violations_student ON violations(student_id);
CREATE INDEX IF NOT EXISTS idx_violations_exam    ON violations(exam_id);

-- ─── Student Batches / Groups ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS batches (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    UNIQUE NOT NULL,
  description TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_batches (
  student_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  batch_id    INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (student_id, batch_id)
);

CREATE TABLE IF NOT EXISTS exam_batches (
  exam_id     INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  batch_id    INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (exam_id, batch_id)
);

