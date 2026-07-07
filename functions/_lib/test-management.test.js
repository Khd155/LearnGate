import { describe, it, expect, vi } from 'vitest';
import {
  listTestResults,
  deleteSingleTestResult,
  resetStudentTestResults,
  resetSchoolTestResults,
  buildGrantRetakeQuery,
  grantRetakeForSchool,
} from './test-management.js';

// Minimal stand-in for the D1-compatible DB object (see functions/_lib/db.js):
// prepare(sql).bind(...args).first()/.all()/.run()
function makeFakeDB({ all = [], run = { meta: { changes: 0 } } } = {}) {
  const calls = [];
  const DB = {
    prepare(sql) {
      const args = { sql, params: undefined };
      return {
        bind(...params) {
          args.params = params;
          return {
            async all() {
              calls.push({ ...args, op: 'all' });
              const result = typeof all === 'function' ? all(args) : all;
              return { results: result };
            },
            async run() {
              calls.push({ ...args, op: 'run' });
              return typeof run === 'function' ? run(args) : run;
            },
            async first() {
              calls.push({ ...args, op: 'first' });
              return null;
            },
          };
        },
      };
    },
  };
  return { DB, calls };
}

describe('listTestResults', () => {
  it('queries without filters when none given', async () => {
    const { DB, calls } = makeFakeDB({ all: [{ id: '1' }] });
    const results = await listTestResults(DB, {});
    expect(results).toEqual([{ id: '1' }]);
    expect(calls[0].sql).not.toContain('WHERE');
    expect(calls[0].params).toEqual([]);
  });

  it('filters by school and studentId together', async () => {
    const { DB, calls } = makeFakeDB({ all: [] });
    await listTestResults(DB, { school: 'ثانوية أ', studentId: 'sid-1' });
    expect(calls[0].sql).toContain('WHERE school = ? AND student_id = ?');
    expect(calls[0].params).toEqual(['ثانوية أ', 'sid-1']);
  });
});

describe('deleteSingleTestResult', () => {
  it('deletes test_answers before test_results, scoped by id', async () => {
    const { DB, calls } = makeFakeDB();
    await deleteSingleTestResult(DB, 'result-1');
    expect(calls).toHaveLength(2);
    expect(calls[0].sql).toContain('DELETE FROM test_answers WHERE result_id = ?');
    expect(calls[0].params).toEqual(['result-1']);
    expect(calls[1].sql).toContain('DELETE FROM test_results WHERE id = ?');
    expect(calls[1].params).toEqual(['result-1']);
  });
});

describe('resetStudentTestResults', () => {
  it('deletes answers for every matching result then the results, returns count', async () => {
    const { DB, calls } = makeFakeDB({ all: [{ id: 'r1' }, { id: 'r2' }] });
    const deleted = await resetStudentTestResults(DB, 'student-1');
    expect(deleted).toBe(2);
    const answerDeletes = calls.filter(c => c.sql.includes('DELETE FROM test_answers'));
    expect(answerDeletes.map(c => c.params[0])).toEqual(['r1', 'r2']);
    const resultDelete = calls.find(c => c.sql.includes('DELETE FROM test_results WHERE student_id'));
    expect(resultDelete.params).toEqual(['student-1']);
  });

  it('returns 0 and still issues the bulk delete when student has no attempts', async () => {
    const { DB, calls } = makeFakeDB({ all: [] });
    const deleted = await resetStudentTestResults(DB, 'student-empty');
    expect(deleted).toBe(0);
    expect(calls.some(c => c.sql.includes('DELETE FROM test_results WHERE student_id'))).toBe(true);
  });
});

describe('resetSchoolTestResults', () => {
  it('deletes answers for every result in the school then the results, returns count', async () => {
    const { DB, calls } = makeFakeDB({ all: [{ id: 'r1' }] });
    const deleted = await resetSchoolTestResults(DB, 'ثانوية ب');
    expect(deleted).toBe(1);
    const resultDelete = calls.find(c => c.sql.includes('DELETE FROM test_results WHERE school'));
    expect(resultDelete.params).toEqual(['ثانوية ب']);
  });
});

describe('buildGrantRetakeQuery', () => {
  it('throws when neither school nor studentId is given', () => {
    expect(() => buildGrantRetakeQuery({})).toThrow();
  });

  it('scopes by school via the latest-plan-per-student window, preserving existing OVERRIDE notes', () => {
    const { sql, params } = buildGrantRetakeQuery({ school: 'ثانوية أ' });
    expect(sql).toContain('ROW_NUMBER() OVER (PARTITION BY student_id ORDER BY created_at DESC)');
    expect(sql).toContain("WHEN admin_note LIKE 'OVERRIDE:%' THEN admin_note");
    expect(sql).toContain('WHERE school = ?');
    expect(params).toEqual(['ثانوية أ']);
  });

  it('prefers studentId over school when both are given', () => {
    const { sql, params } = buildGrantRetakeQuery({ school: 'ثانوية أ', studentId: 'sid-9' });
    expect(sql).toContain('WHERE student_id = ?');
    expect(params).toEqual(['sid-9']);
  });
});

describe('grantRetakeForSchool', () => {
  it('runs the built query and returns the changed-row count from DB.run() meta', async () => {
    const { DB, calls } = makeFakeDB({ run: { meta: { changes: 7 } } });
    const updated = await grantRetakeForSchool(DB, { school: 'ثانوية أ' });
    expect(updated).toBe(7);
    expect(calls[0].params).toEqual(['ثانوية أ']);
  });

  it('returns 0 when DB.run() reports no meta', async () => {
    const { DB } = makeFakeDB({ run: {} });
    const updated = await grantRetakeForSchool(DB, { studentId: 'sid-1' });
    expect(updated).toBe(0);
  });
});
