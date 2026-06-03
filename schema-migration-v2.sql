-- LearnGate — Migration v2: School separation + Schools table
-- Run this in Cloudflare D1 Console

-- Add school column to students
ALTER TABLE students ADD COLUMN school TEXT NOT NULL DEFAULT '';

-- Add school column to plans
ALTER TABLE plans ADD COLUMN school TEXT NOT NULL DEFAULT '';

-- Add school column to admins
ALTER TABLE admins ADD COLUMN school TEXT NOT NULL DEFAULT '';

-- Schools table
CREATE TABLE IF NOT EXISTS schools (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO schools (id, name) VALUES
  ('school-khaldiya',  'ثانوية الخالدية'),
  ('school-sawari',    'ثانوية ذات الصواري');

-- Upgrade default admin to super-admin (school='*' = access all schools)
UPDATE admins SET school = '*' WHERE id = '00000000-0000-0000-0000-000000000001';
