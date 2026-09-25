import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';

// The real onRequest against a recording fake DB, to pin the security fixes from the audit.
const calls = [];
let rateRow = null; // what `SELECT count, win FROM rate_limits` returns
vi.mock('../_lib/db.js', () => ({
  getDB: () => ({
    prepare: (sql) => {
      const stmt = (args) => ({
        run: async () => { calls.push({ sql, args }); return { success: true, meta: { changes: 0 } }; },
        all: async () => { calls.push({ sql, args }); return { results: [] }; },
        first: async () => { calls.push({ sql, args }); return /FROM rate_limits/.test(sql) ? rateRow : null; },
      });
      return { bind: (...args) => stmt(args), ...stmt([]) };
    },
    batch: async () => [],
  }),
}));

const { onRequest } = await import('./[[route]].js');

const SECRET = 's3cret-secret-value';
const DEV_KEY = 'Strong-Dev-Key-42';
const env = { JWT_SECRET: SECRET, DEV_KEY };
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (payload) => {
  const h = b64u({ alg: 'HS256', typ: 'JWT' });
  const b = b64u({ exp: Math.floor(Date.now() / 1000) + 600, ...payload });
  return `${h}.${b}.${crypto.createHmac('sha256', SECRET).update(`${h}.${b}`).digest('base64url')}`;
};
const student = token({ sub: 'st1', role: 'student', name: 'Real Student', school: 'A-School' });
const call = (path, { method = 'GET', headers = {}, body, e = env } = {}) => onRequest({
  request: new Request('http://localhost:3000' + path, {
    method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined,
  }),
  env: e,
});
const insertedLog = () => calls.find((c) => /INSERT INTO logs/.test(c.sql));
// bind order in logEvent: id, level, category, message, user_name, user_role, school, ip, device, student_id, created_at
const logRow = () => { const a = insertedLog().args; return { level: a[1], category: a[2], message: a[3], user_name: a[4], user_role: a[5], school: a[6], student_id: a[9] }; };

beforeEach(() => { calls.length = 0; rateRow = null; });

describe('POST /api/dev/logs — a student can no longer forge log rows', () => {
  const hostile = { level: 'fatal', category: 'suspicious', message: '<img src=x onerror=alert(1)>', user_name: 'Director Bob', user_role: 'director', school: 'Other School' };

  it('forces category to a safe one and takes identity from the token, not the body', async () => {
    const res = await call('/api/dev/logs', { method: 'POST', headers: { Authorization: 'Bearer ' + student }, body: hostile });
    expect(res.status).toBe(201);
    expect(logRow()).toMatchObject({ level: 'info', category: 'client', user_name: 'Real Student', user_role: 'student', school: 'A-School', student_id: 'st1' });
  });

  it('keeps the legitimate client categories and levels', async () => {
    await call('/api/dev/logs', { method: 'POST', headers: { Authorization: 'Bearer ' + student }, body: { level: 'error', category: 'prereq', message: 'x' } });
    expect(logRow()).toMatchObject({ level: 'error', category: 'prereq' });
  });

  it('truncates a student message to 300 characters', async () => {
    await call('/api/dev/logs', { method: 'POST', headers: { Authorization: 'Bearer ' + student }, body: { category: 'error', message: 'a'.repeat(900) } });
    expect(logRow().message).toHaveLength(300);
  });

  it('rate-limits a student who floods the endpoint', async () => {
    rateRow = { count: 30, win: Math.floor(Date.now() / 60000) };
    const res = await call('/api/dev/logs', { method: 'POST', headers: { Authorization: 'Bearer ' + student }, body: { category: 'error', message: 'x' } });
    expect(res.status).toBe(429);
    expect(insertedLog()).toBeUndefined();
  });

  it('still lets the developer write arbitrary rows (dev key)', async () => {
    const res = await call('/api/dev/logs', { method: 'POST', headers: { 'X-Dev-Key': DEV_KEY }, body: hostile });
    expect(res.status).toBe(201);
    expect(logRow()).toMatchObject({ category: 'suspicious', user_role: 'director', school: 'Other School' });
  });

  it('rejects an unauthenticated caller', async () => {
    const res = await call('/api/dev/logs', { method: 'POST', body: hostile });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/general-tests/results — school isolation', () => {
  const q = () => calls.find((c) => /FROM general_test_results/.test(c.sql));

  it('an admin only ever sees their own school, whatever ?school= says', async () => {
    const admin = token({ sub: 'a1', role: 'admin', school: 'A-School' });
    const res = await call('/api/general-tests/results?school=Other', { headers: { Authorization: 'Bearer ' + admin } });
    expect(res.status).toBe(200);
    expect(q().sql).toMatch(/AND school = \?/);
    expect(q().args).toEqual(['A-School']);
  });

  it('a school-scoped director is confined too', async () => {
    const director = token({ sub: 'd1', role: 'director', school: 'A-School' });
    await call('/api/general-tests/results?school=Other', { headers: { Authorization: 'Bearer ' + director } });
    expect(q().args).toEqual(['A-School']);
  });

  it('an admin token without a school claim is refused instead of seeing everything', async () => {
    const orphan = token({ sub: 'a2', role: 'admin' });
    const res = await call('/api/general-tests/results', { headers: { Authorization: 'Bearer ' + orphan } });
    expect(res.status).toBe(403);
    expect(q()).toBeUndefined();
  });

  it('a company-wide director may choose a school, and dev sees all', async () => {
    const star = token({ sub: 'd2', role: 'director', school: '*' });
    await call('/api/general-tests/results?school=B-School', { headers: { Authorization: 'Bearer ' + star } });
    expect(q().args).toEqual(['B-School']);
    calls.length = 0;
    await call('/api/general-tests/results', { headers: { 'X-Dev-Key': DEV_KEY } });
    expect(q().sql).not.toMatch(/AND school = \?/);
  });

  it('students cannot read it at all', async () => {
    const res = await call('/api/general-tests/results', { headers: { Authorization: 'Bearer ' + student } });
    expect(res.status).toBe(401);
  });
});

describe('dev key authentication', () => {
  it('accepts the right key, rejects a wrong or missing one', async () => {
    expect((await call('/api/dev/schools', { headers: { 'X-Dev-Key': DEV_KEY } })).status).toBe(200);
    expect((await call('/api/dev/schools', { headers: { 'X-Dev-Key': DEV_KEY + 'x' } })).status).toBe(401);
    expect((await call('/api/dev/schools')).status).toBe(401);
  });

  it('a configured-but-empty DEV_KEY no longer authorizes header-less requests', async () => {
    expect((await call('/api/dev/schools', { e: { ...env, DEV_KEY: '' } })).status).toBe(401);
    expect((await call('/api/dev/schools', { headers: { 'X-Dev-Key': '' }, e: { ...env, DEV_KEY: '' } })).status).toBe(401);
    expect((await call('/api/dev/schools', { e: { JWT_SECRET: SECRET } })).status).toBe(401); // DEV_KEY not set at all
  });

  it('does not accept the key from the URL', async () => {
    expect((await call('/api/dev/schools?key=' + DEV_KEY)).status).toBe(401);
  });

  it('POST /api/auth/dev rejects a wrong key and an empty configured key', async () => {
    expect((await call('/api/auth/dev', { method: 'POST', body: { key: 'nope-nope-nope' } })).status).toBe(401);
    expect((await call('/api/auth/dev', { method: 'POST', body: { key: '' }, e: { ...env, DEV_KEY: '' } })).status).toBe(401);
  });
});
