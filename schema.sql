-- LearnGate — Cloudflare D1 Schema
-- Run this in Cloudflare D1 Console or via:
--   npx wrangler d1 execute learngate-db --file=schema.sql

-- Students
CREATE TABLE IF NOT EXISTS students (
  id         TEXT PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Plans
CREATE TABLE IF NOT EXISTS plans (
  id           TEXT PRIMARY KEY,
  student_id   TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','active')),
  gaps         TEXT NOT NULL DEFAULT '[]',
  admin_note   TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at  TEXT
);

CREATE INDEX IF NOT EXISTS plans_student_id_idx ON plans(student_id);
CREATE INDEX IF NOT EXISTS plans_status_idx     ON plans(status);

-- Questions
CREATE TABLE IF NOT EXISTS questions (
  id         TEXT    PRIMARY KEY,
  qnum       INTEGER NOT NULL UNIQUE,
  type       TEXT    NOT NULL CHECK (type IN ('verbal','quantitative')),
  skill_id   TEXT    NOT NULL,
  text       TEXT    NOT NULL,
  opt1       TEXT    NOT NULL,
  opt2       TEXT    NOT NULL,
  opt3       TEXT    NOT NULL,
  opt4       TEXT    NOT NULL,
  ans        INTEGER NOT NULL CHECK (ans BETWEEN 0 AND 3),
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_questions_qnum ON questions(qnum);

-- Admins
CREATE TABLE IF NOT EXISTS admins (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  code       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Default admin (رقم سجل المشرف الافتراضي)
INSERT OR IGNORE INTO admins (id, name, code)
VALUES ('00000000-0000-0000-0000-000000000001', 'المشرف الرئيسي', '1000000000');
