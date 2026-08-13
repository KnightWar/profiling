-- ══════════════════════════════════════════════════════════════════════════════
-- Composite Assessment System — PostgreSQL Database Schema
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── Users ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT    NOT NULL,
  email         TEXT    UNIQUE NOT NULL,
  password_hash TEXT    NOT NULL,
  role          TEXT    CHECK(role IN ('admin','student','evaluator')) NOT NULL DEFAULT 'student',
  roll_no       TEXT,
  phone         TEXT,
  active        INTEGER DEFAULT 1,
  active_session_id TEXT,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role);

-- ─── Components ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS components (
  id            SERIAL PRIMARY KEY,
  name          TEXT    UNIQUE NOT NULL,
  display_name  TEXT    NOT NULL,
  weight        INTEGER NOT NULL,
  max_raw_score INTEGER DEFAULT 500,
  question_type_mix TEXT -- JSON string
);

-- ─── Exams ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exams (
  id                  SERIAL PRIMARY KEY,
  component_id        INTEGER NOT NULL REFERENCES components(id),
  exam_number         INTEGER NOT NULL,
  title               TEXT    NOT NULL DEFAULT 'Exam',
  total_marks         INTEGER DEFAULT 50,
  duration_minutes    INTEGER DEFAULT 60,
  timer_enabled       INTEGER DEFAULT 1,
  is_published        INTEGER DEFAULT 0,
  access_code         TEXT    UNIQUE,
  access_code_expires_at TIMESTAMP,
  start_time          TIMESTAMP,
  question_type_mix   TEXT, -- JSON string
  instructions        TEXT,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(component_id, exam_number)
);

CREATE INDEX IF NOT EXISTS idx_exams_component ON exams(component_id);

-- ─── Questions ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS questions (
  id              SERIAL PRIMARY KEY,
  exam_id         INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  type            TEXT    CHECK(type IN ('mcq','subjective','programming','oral_task','writing_task')) NOT NULL,
  marks           INTEGER NOT NULL CHECK(marks > 0),
  content         TEXT    NOT NULL,
  options         TEXT,   -- JSON string
  correct_answer  TEXT,   -- MCQ option or model answer
  test_cases      TEXT,   -- JSON string
  rubric          TEXT,   -- JSON string
  sort_order      INTEGER DEFAULT 0,
  source          TEXT    DEFAULT 'manual' CHECK(source IN ('manual','ai_generated')),
  difficulty      TEXT    DEFAULT 'medium' CHECK(difficulty IN ('easy','medium','hard')),
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_questions_exam ON questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_questions_type ON questions(type);

-- ─── Exam Sessions ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exam_sessions (
  id          SERIAL PRIMARY KEY,
  student_id  INTEGER NOT NULL REFERENCES users(id),
  exam_id     INTEGER NOT NULL REFERENCES exams(id),
  started_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ends_at     TIMESTAMP NOT NULL,
  submitted_at TIMESTAMP,
  status      TEXT    DEFAULT 'active' CHECK(status IN ('active','submitted','expired','abandoned')),
  remarks     TEXT,
  UNIQUE(student_id, exam_id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_student ON exam_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status  ON exam_sessions(status);

-- ─── Responses ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS responses (
  id            SERIAL PRIMARY KEY,
  student_id    INTEGER NOT NULL REFERENCES users(id),
  exam_id       INTEGER NOT NULL REFERENCES exams(id),
  question_id   INTEGER NOT NULL REFERENCES questions(id),
  answer_data   TEXT,     -- Text answer, selected option, or code
  audio_url     TEXT,     -- Path/URL to audio file
  submitted_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status        TEXT     DEFAULT 'submitted' CHECK(status IN ('submitted','graded','flagged','pending_review')),
  UNIQUE(student_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_responses_student  ON responses(student_id);
CREATE INDEX IF NOT EXISTS idx_responses_exam     ON responses(exam_id);
CREATE INDEX IF NOT EXISTS idx_responses_status   ON responses(status);

-- ─── Scores ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scores (
  id            SERIAL PRIMARY KEY,
  response_id   INTEGER NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  marks_awarded REAL    NOT NULL CHECK(marks_awarded >= 0),
  scored_by     INTEGER REFERENCES users(id),
  scoring_type  TEXT    DEFAULT 'manual' CHECK(scoring_type IN ('auto','manual')),
  feedback      TEXT,
  scored_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(response_id)
);

CREATE INDEX IF NOT EXISTS idx_scores_response ON scores(response_id);

-- ─── Component Totals ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS component_totals (
  id              SERIAL PRIMARY KEY,
  student_id      INTEGER NOT NULL REFERENCES users(id),
  component_id    INTEGER NOT NULL REFERENCES components(id),
  total_marks     REAL    DEFAULT 0,
  exams_completed INTEGER DEFAULT 0,
  exams_graded    INTEGER DEFAULT 0,
  is_finalized    INTEGER DEFAULT 0,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, component_id)
);

CREATE INDEX IF NOT EXISTS idx_ct_student ON component_totals(student_id);

-- ─── Composite Scores ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS composite_scores (
  id          SERIAL PRIMARY KEY,
  student_id  INTEGER NOT NULL REFERENCES users(id) UNIQUE,
  t_score     REAL DEFAULT 0,
  l_score     REAL DEFAULT 0,
  o_score     REAL DEFAULT 0,
  w_score     REAL DEFAULT 0,
  total_score REAL DEFAULT 0,
  level       INTEGER,
  computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── Violations / Proctoring Logs ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS violations (
  id          SERIAL PRIMARY KEY,
  student_id  INTEGER NOT NULL REFERENCES users(id),
  exam_id     INTEGER NOT NULL REFERENCES exams(id),
  type        TEXT    NOT NULL,
  details     TEXT,
  timestamp   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_violations_student ON violations(student_id);
CREATE INDEX IF NOT EXISTS idx_violations_exam    ON violations(exam_id);

-- ─── Student Batches ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS batches (
  id          SERIAL PRIMARY KEY,
  name        TEXT    UNIQUE NOT NULL,
  description TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_batches (
  student_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  batch_id    INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (student_id, batch_id)
);

CREATE TABLE IF NOT EXISTS exam_batches (
  exam_id     INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  batch_id    INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (exam_id, batch_id)
);

-- ─── Express Session Table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
) WITH (OIDS=FALSE);

ALTER TABLE "session" DROP CONSTRAINT IF EXISTS "session_pkey";
ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
