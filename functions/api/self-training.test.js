import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';

// The real onRequest against an in-memory fake of the one table this feature owns.
let row = null; // { state, rev, updated_at }
let clickRows = []; let quizRows = [];
const calls = [];
vi.mock('../_lib/db.js', () => ({
  getDB: () => ({
    prepare: (sql) => {
      const exec = (args) => ({
        run: async () => {
          calls.push({ sql, args });
          if (/^INSERT INTO student_self_training/.test(sql)) {
            if (row) return { meta: { changes: 0 } };
            row = { state: args[1], rev: 1, updated_at: args[2] }; return { meta: { changes: 1 } };
          }
          if (/^UPDATE student_self_training/.test(sql)) {
            const [state, updated, , baseRev] = args;
            if (!row || row.rev !== baseRev) return { meta: { changes: 0 } };
            row = { state, rev: row.rev + 1, updated_at: updated }; return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        },
        first: async () => (/FROM student_self_training/.test(sql) ? row : null),
        all: async () => { calls.push({ sql, args }); return { results: /student_engagement_logs/.test(sql) ? clickRows : /FROM skill_progress/.test(sql) ? quizRows : [] }; },
      });
      return { bind: (...a) => exec(a), ...exec([]) };
    },
    batch: async () => [],
  }),
}));

const { onRequest } = await import('./[[route]].js');
const SECRET = 'test-secret-value';
const env = { JWT_SECRET: SECRET, DEV_KEY: 'Strong-Dev-Key-42' };
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (payload) => {
  const h = b64u({ alg: 'HS256', typ: 'JWT' });
  const b = b64u({ exp: Math.floor(Date.now() / 1000) + 600, ...payload });
  return `${h}.${b}.${crypto.createHmac('sha256', SECRET).update(`${h}.${b}`).digest('base64url')}`;
};
const student = token({ sub: 'st1', role: 'student', name: 'S', school: 'A' });
const call = (method, body, auth = student) => onRequest({
  request: new Request('http://localhost:3000/api/self-training', {
    method, headers: { ...(auth ? { Authorization: 'Bearer ' + auth } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }),
  env,
});
const good = { ui: { round: 1, section: 'verbal', skill: 'analogy' }, progress: { '1:analogy': { intro: true, clips: [1, 2], models: [], levels: { easy: 0, medium: 0, advanced: 0 } } } };

beforeEach(() => { row = null; calls.length = 0; clickRows = []; quizRows = []; });

describe('/api/self-training', () => {
  it('is for students only', async () => {
    expect((await call('GET', null, null)).status).toBe(401);
    expect((await call('GET', null, token({ sub: 'a1', role: 'admin', school: 'A' }))).status).toBe(401);
    expect((await call('PUT', { state: good, baseRev: 0 }, token({ sub: 'd', role: 'dev' }))).status).toBe(401);
  });

  it('returns state:null / rev 0 before the first save', async () => {
    const res = await call('GET');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ state: null, rev: 0, updatedAt: null });
    expect(body.activity.analogy).toEqual({ introSeen: false, clips: [], models: [], levels: { easy: 0, medium: 0, advanced: 0 } });
  });

  it('saves, then reads back the same (sanitized) state with a new revision', async () => {
    const put = await call('PUT', { state: good, baseRev: 0 });
    expect(put.status).toBe(200);
    expect((await put.json()).rev).toBe(1);
    const got = await (await call('GET')).json();
    expect(got.rev).toBe(1);
    expect(got.state.progress['1:analogy']).toEqual({ intro: true, clips: [1, 2], models: [], levels: { easy: 0, medium: 0, advanced: 0 } });
  });

  it('stores only sanitized data (hostile keys and out-of-range values dropped)', async () => {
    await call('PUT', { baseRev: 0, state: { progress: { '1:analogy': { intro: true, clips: [1, 999, '<b>'] }, '1:evil': { intro: true }, '<script>': {} }, ui: { round: 'x' } } });
    const stored = JSON.parse(row.state);
    expect(Object.keys(stored.progress)).toEqual(['1:analogy']);
    expect(stored.progress['1:analogy'].clips).toEqual([1]);
    expect(stored.ui.round).toBe(1);
  });

  it('a stale revision gets conflict:true with the current state instead of overwriting it', async () => {
    await call('PUT', { state: good, baseRev: 0 });                       // rev 1
    await call('PUT', { state: { ...good, ui: { ...good.ui } }, baseRev: 1 }); // rev 2 (another device)
    const stale = await call('PUT', { state: { progress: {} }, baseRev: 1 });
    expect(stale.status).toBe(200);
    const body = await stale.json();
    expect(body).toMatchObject({ conflict: true, rev: 2 });
    expect(body.state.progress['1:analogy'].clips).toEqual([1, 2]);
    expect(row.rev).toBe(2); // not overwritten
  });

  it('a first save racing another first save also gets conflict:true, not a duplicate row', async () => {
    await call('PUT', { state: good, baseRev: 0 });
    const second = await call('PUT', { state: { progress: {} }, baseRev: 0 });
    expect((await second.json()).conflict).toBe(true);
    expect(row.rev).toBe(1);
  });

  it('GET returns the activity computed from this student clicks and quiz results', async () => {
    clickRows = [{ skill_key: 'analogy', resource_type: 'video', resource_index: 0 }, { skill_key: 'analogy', resource_type: 'video', resource_index: 2 }];
    quizRows = [{ quiz_skill_id: 'verbal-easy-v4', status: 'passed', attempts: 1 }];
    const body = await (await call('GET')).json();
    expect(body.activity.analogy).toEqual({ introSeen: true, clips: [2], models: [], levels: { easy: 2, medium: 0, advanced: 0 } });
    const q = calls.find((c) => /student_engagement_logs/.test(c.sql));
    expect(q.args).toEqual(['st1']);          // only this student's own activity
  });

  it('rejects a non-JSON body', async () => {
    const res = await onRequest({ request: new Request('http://localhost:3000/api/self-training', { method: 'PUT', headers: { Authorization: 'Bearer ' + student, 'Content-Type': 'application/json' }, body: 'nope' }), env });
    expect(res.status).toBe(400);
  });
});
