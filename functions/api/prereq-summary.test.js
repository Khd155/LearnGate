import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';

// The real onRequest against a scripted fake DB: only chem1-t1-c3 has an authored summary.
vi.mock('../_lib/db.js', () => ({
  getDB: () => ({
    prepare: (sql) => ({
      bind: (...args) => ({
        run: async () => ({ success: true }),
        all: async () => ({ results: /FROM evaluation_questions/.test(sql) && args[0] === 'chem1-t1-c3'
          ? [{ question_id: 'e1', level: 'knowledge', prompt: 'p', model_answer: 'a' }] : [] }),
        first: async () => (/FROM chapter_summaries/.test(sql) && args[0] === 'chem1-t1-c3'
          ? { chapter_id: 'chem1-t1-c3', key_concepts: '["k"]', new_terms: '[]', core_rule: 'r', worked_example: 'w', common_pitfall: 'c' } : null),
      }),
      run: async () => ({ success: true }),
      all: async () => ({ results: [] }),
      first: async () => null,
    }),
    batch: async () => [],
  }),
}));

const { onRequest } = await import('./[[route]].js');
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (secret) => {
  const h = b64u({ alg: 'HS256', typ: 'JWT' }); const b = b64u({ sub: 's1', role: 'student', exp: Math.floor(Date.now() / 1000) + 600 });
  return `${h}.${b}.${crypto.createHmac('sha256', secret).update(`${h}.${b}`).digest('base64url')}`;
};
const env = { JWT_SECRET: 's3cret', DEV_KEY: 'k' };
const get = (chapterId) => onRequest({ request: new Request(`http://localhost:3000/api/prereq/chapter-summary?chapterId=${chapterId}`, { headers: { Authorization: 'Bearer ' + token(env.JWT_SECRET) } }), env });

describe('GET /api/prereq/chapter-summary', () => {
  it('returns the authored summary and evaluation questions', async () => {
    const res = await get('chem1-t1-c3');
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.summary.coreRule).toBe('r');
    expect(j.evaluationQuestions).toHaveLength(1);
  });
  it('answers 200 with summary:null (not 404) for a chapter with no summary yet', async () => {
    const res = await get('chem1-t1-c1');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ summary: null, evaluationQuestions: [] });
  });
});
