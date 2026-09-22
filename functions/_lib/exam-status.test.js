import { describe, it, expect } from 'vitest';
import { normalizeExamSubject, summarizeChem, summarizeBio, summarizeAptitude, buildExamRoster } from './exam-status.js';

describe('normalizeExamSubject', () => {
  it('accepts the short keys and the stored ids, rejects the unknown', () => {
    expect(normalizeExamSubject('chem1')).toBe('chem1');
    expect(normalizeExamSubject('chemistry-1')).toBe('chem1');
    expect(normalizeExamSubject('BIO')).toBe('bio1');
    expect(normalizeExamSubject('aptitude')).toBe('aptitude');
    expect(normalizeExamSubject('physics')).toBeNull();
    expect(normalizeExamSubject('')).toBeNull();
  });
});

describe('summarizeChem', () => {
  const subject = { scope: 'subject', weak_labels: '["النسبة والتناسب"]', weak_count: 1, total_count: 4, branch: 'alert', created_at: '2026-09-20T10:00:00Z' };
  it('no attempt = not started, chapters still locked', () => {
    expect(summarizeChem({})).toMatchObject({ completed: false, unlocked: false, state: 'none', score: null, headline: 'لم يبدأ' });
  });
  it('an intro view without a result is "partial" and counts as unlocked-intro', () => {
    expect(summarizeChem({ progress: { seen_intro: 1 } })).toMatchObject({ completed: false, unlocked: true, state: 'partial' });
  });
  it('a subject result completes it: score is the share answered right, alert flag follows the branch', () => {
    const s = summarizeChem({ results: [subject] });
    expect(s).toMatchObject({ completed: true, unlocked: true, state: 'done', score: 75, headline: '75%', openAlert: true, attempts: 1 });
    expect(s.weakLabels).toEqual(['النسبة والتناسب']);
    expect(s.detail).toContain('أخفق في 1 من 4');
  });
  it('uses the newest subject result and counts chapter attempts separately', () => {
    const later = { ...subject, weak_labels: '[]', weak_count: 0, branch: 'direct', created_at: '2026-09-21T10:00:00Z' };
    const chap = { scope: 'chapter', chapter_id: 'c1', weak_count: 0, total_count: 3, created_at: '2026-09-21T11:00:00Z' };
    const s = summarizeChem({ results: [later, subject, chap] });
    expect(s).toMatchObject({ score: 100, openAlert: false, attempts: 2, chapterAttempts: 1 });
  });
});

describe('summarizeBio', () => {
  it('reports pre/post and the improvement between them', () => {
    const s = summarizeBio({ results: [
      { id: 'a', test_type: 'pre', score: 40, created_at: '2026-09-01T00:00:00Z' },
      { id: 'b', test_type: 'post', score: 70, created_at: '2026-09-10T00:00:00Z' },
    ] });
    expect(s).toMatchObject({ state: 'done', improvement: 30, headline: 'قبلي 40% · بعدي 70%', attempts: 2 });
    expect(s.items[0].id).toBe('b');
  });
  it('only a pre-test is partial; nothing is none', () => {
    expect(summarizeBio({ results: [{ id: 'a', test_type: 'pre', score: 50, created_at: '2026-09-01T00:00:00Z' }] }).state).toBe('partial');
    expect(summarizeBio({})).toMatchObject({ state: 'none', headline: 'لم يبدأ' });
  });
});

describe('summarizeAptitude', () => {
  it('averages the newest plan and lists its weakest skills; accepts gaps as a JSON string', () => {
    const s = summarizeAptitude({ plans: [
      { id: 'p1', status: 'pending', gaps: '[{"skillName":"أ","pct":20}]', created_at: '2026-09-01T00:00:00Z' },
      { id: 'p2', status: 'active', gaps: [{ skillName: 'س', pct: 80 }, { skillName: 'ص', pct: 40 }, { skillName: 'ع', pct: 60 }], created_at: '2026-09-05T00:00:00Z' },
    ] });
    expect(s).toMatchObject({ state: 'done', avg: 60, skills: 3, attempts: 2 });
    expect(s.weakest.map((w) => w.name)).toEqual(['ص', 'ع', 'س']);
  });
  it('a pending plan is partial; none is none', () => {
    expect(summarizeAptitude({ plans: [{ id: 'p', status: 'pending', gaps: '[]', created_at: '2026-09-01T00:00:00Z' }] }).state).toBe('partial');
    expect(summarizeAptitude({}).state).toBe('none');
  });
});

describe('buildExamRoster', () => {
  it('groups rows per student, newest activity first, and reports truncation', () => {
    const flat = [
      { student_id: 'a', student_name: 'أ', school: 'م', test_type: 'pre', score: 50, created_at: '2026-09-01T00:00:00Z' },
      { student_id: 'b', student_name: 'ب', school: 'م', test_type: 'post', score: 90, created_at: '2026-09-09T00:00:00Z' },
      { student_id: 'a', student_name: 'أ', school: 'م', test_type: 'post', score: 60, created_at: '2026-09-03T00:00:00Z' },
    ];
    const r = buildExamRoster('bio1', flat);
    expect(r.rows.map((x) => x.studentId)).toEqual(['b', 'a']);
    expect(r.rows[1]).toMatchObject({ attempts: 2, improvement: 10 });
    expect(buildExamRoster('bio1', flat, { limit: 1 })).toMatchObject({ total: 2, truncated: true });
  });
  it('works for chemistry rows carrying student metadata', () => {
    const r = buildExamRoster('chem1', [{ student_id: 's', student_name: 'س', school: 'م', code: '1', scope: 'subject', weak_labels: '[]', weak_count: 0, total_count: 3, branch: 'direct', created_at: '2026-09-01T00:00:00Z' }]);
    expect(r.rows[0]).toMatchObject({ studentId: 's', code: '1', score: 100, state: 'done' });
  });
});
