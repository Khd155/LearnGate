import { describe, it, expect } from 'vitest';
import { buildStudentJourney, classifyLog } from './student-journey.js';

const STUDENT = { id: 's1', name: 'طالب', code: '1000000001', school: 'م', phone: '05' };
const CH = [{ chapterId: 'c3', title: 'تركيب الذرة' }];

describe('classifyLog', () => {
  it('maps login success / failure and prereq events', () => {
    expect(classifyLog({ category: 'login', level: 'success', device: 'جوال', ip: '1.1.1.1' })).toMatchObject({ kind: 'login', level: 'success', detail: 'جوال · 1.1.1.1' });
    expect(classifyLog({ category: 'login', level: 'warn', message: 'x' }).kind).toBe('login_failed');
    expect(classifyLog({ category: 'prereq', message: 'فتح صفحة مقرر الكيمياء 1' }).kind).toBe('open_page');
    expect(classifyLog({ category: 'prereq', message: 'بدء تشخيص متطلبات المادة' }).kind).toBe('diag_start');
    expect(classifyLog({ category: 'prereq_alert', message: 'm' })).toMatchObject({ kind: 'alert', level: 'error' });
  });
  it('flags errors and suspicious behaviour, anything else is "other"', () => {
    expect(classifyLog({ category: 'error', level: 'error', message: 'TypeError' }).kind).toBe('error');
    expect(classifyLog({ category: 'suspicious', message: 'x' }).kind).toBe('suspicious');
    expect(classifyLog({ category: 'ticket', level: 'info', message: 'x' }).kind).toBe('other');
  });
});

describe('buildStudentJourney', () => {
  const logs = [
    { category: 'login', level: 'success', created_at: '2026-09-20T09:12:00.000Z', device: 'جوال', ip: '1.1.1.1' },
    { category: 'prereq', level: 'info', message: 'فتح صفحة مقرر الكيمياء 1', created_at: '2026-09-20T09:13:00.000Z' },
    { category: 'prereq', level: 'info', message: 'بدء تشخيص متطلبات المادة', created_at: '2026-09-20T09:14:00.000Z' },
    { category: 'prereq_alert', level: 'warn', message: 'فجوة', created_at: '2026-09-20T09:17:00.500Z' },
  ];
  const results = [
    { scope: 'subject', chapter_id: null, weak_labels: '["العناصر والمركبات","النسبة والتناسب"]', weak_count: 2, total_count: 3, branch: 'alert', created_at: '2026-09-20T09:17:00.000Z' },
  ];

  it('orders the whole gate story chronologically: login → open → start → result → unlock → alert', () => {
    const j = buildStudentJourney({ student: STUDENT, logs, results, progress: { seen_intro: 1 }, chapters: CH });
    expect(j.events.map((e) => e.kind)).toEqual(['login', 'open_page', 'diag_start', 'diag_result', 'unlock', 'alert']);
    expect(j.events[3]).toMatchObject({ level: 'error', title: 'نتيجة تشخيص متطلبات المادة' });
    expect(j.events[3].detail).toContain('أخفق في 2 من 3');
  });

  it('reports the gate state: unlocked, with the open alert', () => {
    const j = buildStudentJourney({ student: STUDENT, logs, results, progress: { seen_intro: 1 }, chapters: CH });
    expect(j.gate).toMatchObject({ seenIntro: true, unlockedAt: '2026-09-20T09:17:00.000Z', openAlert: true });
    expect(j.gate.latest[0]).toMatchObject({ scope: 'subject', branch: 'alert', weakCount: 2 });
  });

  it('a later clean retake clears the open alert but keeps the history', () => {
    const j = buildStudentJourney({
      student: STUDENT, logs: [], chapters: CH, progress: { seen_intro: 1 },
      results: [...results, { scope: 'subject', chapter_id: null, weak_labels: '[]', weak_count: 0, total_count: 3, branch: 'direct', created_at: '2026-09-21T10:00:00.000Z' }],
    });
    expect(j.gate.openAlert).toBe(false);
    expect(j.events.filter((e) => e.kind === 'diag_result')).toHaveLength(2);
    expect(j.events.filter((e) => e.kind === 'unlock')).toHaveLength(1);
  });

  it('names chapter results by chapter title and lists tickets', () => {
    const j = buildStudentJourney({
      student: STUDENT, chapters: CH,
      results: [{ scope: 'chapter', chapter_id: 'c3', weak_labels: '[]', weak_count: 0, total_count: 3, branch: 'direct', created_at: '2026-09-20T10:00:00.000Z' }],
      tickets: [{ subject: 'مشكلة دخول', status: 'open', created_at: '2026-09-20T11:00:00.000Z' }],
    });
    expect(j.events[0].title).toBe('نتيجة تشخيص فصل «تركيب الذرة»');
    expect(j.events[0].level).toBe('success');
    expect(j.events[1]).toMatchObject({ kind: 'ticket', level: 'warn' });
    expect(j.gate.seenIntro).toBe(false);
  });

  it('handles a student with no activity', () => {
    const j = buildStudentJourney({ student: STUDENT });
    expect(j.events).toEqual([]);
    expect(j.gate).toMatchObject({ seenIntro: false, openAlert: false, latest: [] });
  });
});
