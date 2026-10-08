import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';

// The real onRequest against a recording fake DB, pinning the access-control
// fixes from the API audit (webhook secret, role gates, school isolation).
const calls = [];
let rows = {}; // student id -> { name, school, phone }
let adminRow = null;
let rateRow = null;
vi.mock('../_lib/db.js', () => ({
  getDB: () => ({
    prepare: (sql) => {
      const stmt = (args) => ({
        sql, args,
        run: async () => { calls.push({ sql, args }); return { success: true, meta: { changes: 0 } }; },
        all: async () => { calls.push({ sql, args }); return { results: /^SELECT code FROM students$/.test(sql) ? [{ code: '1234567890' }] : [] }; },
        first: async () => {
          calls.push({ sql, args });
          if (/FROM rate_limits/.test(sql)) return rateRow;
          if (/FROM admins WHERE code/.test(sql)) return adminRow;
          if (/FROM students WHERE id = \?/.test(sql)) return rows[args[0]] || null;
          if (/FROM students WHERE phone/.test(sql)) return { id: 'st1', name: 'Real Student' };
          return null;
        },
      });
      return { bind: (...args) => stmt(args), ...stmt([]) };
    },
    batch: async (stmts) => stmts.map((st) => { calls.push({ sql: st.sql, args: st.args }); return { changes: 0 }; }),
  }),
}));

const { onRequest } = await import('./[[route]].js');

const SECRET = 's3cret-secret-value';
const DEV_KEY = 'Strong-Dev-Key-42';
const HOOK = 'Bot-Webhook-Secret-9';
const env = { JWT_SECRET: SECRET, DEV_KEY, SENDPULSE_WEBHOOK_SECRET: HOOK };
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (payload) => {
  const h = b64u({ alg: 'HS256', typ: 'JWT' });
  const b = b64u({ exp: Math.floor(Date.now() / 1000) + 600, ...payload });
  return `${h}.${b}.${crypto.createHmac('sha256', SECRET).update(`${h}.${b}`).digest('base64url')}`;
};
const bearer = (p) => ({ Authorization: 'Bearer ' + token(p) });
const studentA = bearer({ sub: 'st1', role: 'student', name: 'S', school: 'A' });
const adminA = bearer({ sub: 'ad1', role: 'admin', name: 'Admin A', school: 'A' });
const directorA = bearer({ sub: 'dr1', role: 'director', name: 'Dir A', school: 'A' });
const call = (path, { method = 'GET', headers = {}, body, e = env } = {}) => onRequest({
  request: new Request('http://localhost:3000' + path, {
    method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined,
  }),
  env: e,
});
const wrote = (re) => calls.some((c) => re.test(c.sql));

beforeEach(() => {
  calls.length = 0; rateRow = null; adminRow = null;
  rows = { st1: { name: 'S1', school: 'A' }, st2: { name: 'S2', school: 'B' } };
});

describe('GET /api/auth/recover-link — SendPulse bot only', () => {
  it('rejects a request without the webhook secret', async () => {
    const res = await call('/api/auth/recover-link?phone=0500000000');
    expect(res.status).toBe(401);
    expect(wrote(/INSERT INTO access_tokens/)).toBe(false);
  });
  it('rejects a wrong secret', async () => {
    const res = await call('/api/auth/recover-link?phone=0500000000', { headers: { 'X-Webhook-Secret': 'nope-nope-nope' } });
    expect(res.status).toBe(401);
  });
  it('fails closed when the secret is not configured', async () => {
    const res = await call('/api/auth/recover-link?phone=0500000000', { headers: { 'X-Webhook-Secret': '' }, e: { JWT_SECRET: SECRET, DEV_KEY } });
    expect(res.status).toBe(401);
  });
  it('issues a link when the bot presents the secret', async () => {
    const res = await call('/api/auth/recover-link?phone=0500000000', { headers: { 'X-Webhook-Secret': HOOK } });
    expect(res.status).toBe(200);
    expect(wrote(/INSERT INTO access_tokens/)).toBe(true);
  });
});

describe('GET /api/admins/:code — director/dev only', () => {
  it('refuses a student', async () => {
    expect((await call('/api/admins/0112345678', { headers: studentA })).status).toBe(403);
  });
  it('refuses a regular admin', async () => {
    expect((await call('/api/admins/0112345678', { headers: adminA })).status).toBe(403);
  });
  it('allows a director', async () => {
    adminRow = { id: 'a', name: 'X', school: 'A', role: 'admin' };
    expect((await call('/api/admins/0112345678?school=A', { headers: directorA })).status).toBe(200);
  });
  it('rate-limits lookups', async () => {
    rateRow = { count: 10, win: Math.floor(Date.now() / 60000) };
    expect((await call('/api/admins/0112345678', { headers: directorA })).status).toBe(429);
  });
});

describe('DELETE /api/students/:id — ownership before cascade', () => {
  it('deletes nothing for a student of another school', async () => {
    const res = await call('/api/students/st2', { method: 'DELETE', headers: adminA });
    expect(res.status).toBe(403);
    expect(wrote(/^\s*DELETE/i)).toBe(false);
  });
  it('deletes a student of the admin school', async () => {
    const res = await call('/api/students/st1', { method: 'DELETE', headers: adminA });
    expect(res.status).toBe(200);
    expect(wrote(/DELETE FROM students WHERE id = \?/)).toBe(true);
  });
  it('returns 404 for an unknown student', async () => {
    expect((await call('/api/students/nope', { method: 'DELETE', headers: adminA })).status).toBe(404);
  });
});

describe('POST /api/students?upsert=1 — scoped to the admin school', () => {
  it('updates only rows already in the admin school and never moves schools', async () => {
    const res = await call('/api/students?upsert=1', { method: 'POST', headers: adminA, body: [{ name: 'N', code: '1234567890', school: 'B' }] });
    expect(res.status).toBe(200);
    const upd = calls.find((c) => /^UPDATE students/.test(c.sql));
    expect(upd.sql).toMatch(/WHERE code = \? AND school = \?/);
    expect(upd.sql).not.toMatch(/school = \?,/);
    expect(upd.args).toEqual(['N', null, '1234567890', 'A']);
  });
});

describe('POST /api/quiz/grade — removed', () => {
  it('is no longer served', async () => {
    const res = await call('/api/quiz/grade', { method: 'POST', headers: studentA, body: { answers: [{ qnum: 1, ans: 1 }] } });
    expect(res.status).not.toBe(200);
    expect(wrote(/FROM questions WHERE qnum IN/)).toBe(false);
  });
});

describe('progress and prereq — school isolation', () => {
  it('blocks reading progress of another school student', async () => {
    expect((await call('/api/progress/st2', { headers: adminA })).status).toBe(403);
  });
  it('blocks a student reading someone else', async () => {
    expect((await call('/api/progress/st2', { headers: studentA })).status).toBe(403);
  });
  it('allows reading progress of an own-school student', async () => {
    expect((await call('/api/progress/st1', { headers: adminA })).status).toBe(200);
  });
  it('blocks writing progress for another school student', async () => {
    const res = await call('/api/progress', { method: 'POST', headers: adminA, body: { studentId: 'st2', lessonId: 'l1' } });
    expect(res.status).toBe(403);
    expect(wrote(/INSERT INTO student_progress/)).toBe(false);
  });
  it('blocks prereq overview for another school student', async () => {
    expect((await call('/api/prereq/overview?subject=chemistry-1&studentId=st2', { headers: adminA })).status).toBe(403);
  });
  it('blocks resetting prereq progress of another school student', async () => {
    const res = await call('/api/prereq/progress?subject=chemistry-1&studentId=st2', { method: 'DELETE', headers: adminA });
    expect(res.status).toBe(403);
    expect(wrote(/DELETE FROM student_prereq/)).toBe(false);
  });
  it('still lets the dev key reset any student', async () => {
    const res = await call('/api/prereq/progress?subject=chemistry-1&studentId=st2', { method: 'DELETE', headers: { 'X-Dev-Key': DEV_KEY } });
    expect(res.status).toBe(200);
  });
});
