import { describe, it, expect } from 'vitest';
import { buildPrereqAnalytics, latestResults } from './prereq-analytics.js';

const CHAPTERS = [
  { chapterId: 'c2', orderNum: 2, title: 'المادة: الخواص والتغيرات' },
  { chapterId: 'c3', orderNum: 3, title: 'تركيب الذرة' },
];

const row = (o) => ({
  student_id: 's1', name: 'طالب', school: 'م', code: '1', scope: 'subject', chapter_id: null,
  weak_labels: '[]', weak_count: 0, total_count: 3, branch: 'direct', created_at: '2026-09-01T10:00:00.000Z', ...o,
});

describe('latestResults', () => {
  it('keeps only the newest attempt per student + scope + chapter', () => {
    const rows = [
      row({ created_at: '2026-09-01T10:00:00.000Z', branch: 'alert', weak_count: 3 }),
      row({ created_at: '2026-09-02T10:00:00.000Z', branch: 'direct' }),
      row({ scope: 'chapter', chapter_id: 'c3', created_at: '2026-09-01T09:00:00.000Z' }),
    ];
    const out = latestResults(rows);
    expect(out).toHaveLength(2);
    expect(out.find((r) => r.scope === 'subject').branch).toBe('direct');
  });
});

describe('buildPrereqAnalytics — alerts', () => {
  it('lists only latest alerts, newest first, with severity and parsed labels', () => {
    const rows = [
      row({ student_id: 'a', name: 'سعد', branch: 'alert', weak_count: 3, weak_labels: '["الأس العلمي","الشحنة الكهربائية","تعريف العنصر"]', scope: 'chapter', chapter_id: 'c3', created_at: '2026-09-03T08:00:00.000Z' }),
      row({ student_id: 'b', name: 'نورة', branch: 'alert', weak_count: 2, weak_labels: '["النسبة والتناسب","التركيب الذري الأولي"]', created_at: '2026-09-04T08:00:00.000Z' }),
      // recovered: old alert superseded by a clean retake → must not appear
      row({ student_id: 'c', name: 'فهد', branch: 'alert', weak_count: 2, created_at: '2026-09-01T08:00:00.000Z' }),
      row({ student_id: 'c', name: 'فهد', branch: 'direct', created_at: '2026-09-02T08:00:00.000Z' }),
    ];
    const { alerts } = buildPrereqAnalytics({ rows, chapters: CHAPTERS });
    expect(alerts.map((a) => a.studentId)).toEqual(['b', 'a']);
    expect(alerts[0].severity).toBe('moderate');
    expect(alerts[1].severity).toBe('critical');
    expect(alerts[1].scopeTitle).toBe('تركيب الذرة');
    expect(alerts[0].scopeTitle).toBe('التشخيص العام للمادة');
    expect(alerts[1].weakLabels).toHaveLength(3);
  });

  it('marks an alert followed-up only when support wrote AFTER it was raised', () => {
    const rows = [
      row({ student_id: 'a', branch: 'alert', weak_count: 2, created_at: '2026-09-03T08:00:00.000Z' }),
      row({ student_id: 'b', branch: 'alert', weak_count: 2, created_at: '2026-09-03T08:00:00.000Z' }),
    ];
    const res = buildPrereqAnalytics({
      rows,
      lastAdminMessageAt: { a: '2026-09-03T09:00:00.000Z', b: '2026-09-03T07:00:00.000Z' },
    });
    const byId = Object.fromEntries(res.alerts.map((a) => [a.studentId, a.followedUp]));
    expect(byId).toEqual({ a: true, b: false });
    expect(res.totals.openAlerts).toBe(1);
  });

  it('tolerates malformed weak_labels JSON', () => {
    const { alerts } = buildPrereqAnalytics({ rows: [row({ branch: 'alert', weak_count: 2, weak_labels: '{oops' })] });
    expect(alerts[0].weakLabels).toEqual([]);
    expect(alerts[0].weakCount).toBe(2);
  });
});

describe('buildPrereqAnalytics — rankings', () => {
  const rows = [
    row({ student_id: 'a', name: 'أ', weak_count: 0, created_at: '2026-09-01T10:00:00.000Z' }),
    row({ student_id: 'b', name: 'ب', weak_count: 1, created_at: '2026-09-01T10:00:00.000Z' }),
    row({ student_id: 'b', name: 'ب', scope: 'chapter', chapter_id: 'c3', weak_count: 0, created_at: '2026-09-02T10:00:00.000Z' }),
    row({ student_id: 'b', name: 'ب', scope: 'chapter', chapter_id: 'c3', weak_count: 3, branch: 'alert', created_at: '2026-09-01T12:00:00.000Z' }),
  ];

  it('scores top performers on latest results only', () => {
    const { topPerformers } = buildPrereqAnalytics({ rows, chapters: CHAPTERS });
    // a: 100% on 1 scope. b: subject 67% + chapter latest 100% → 83%.
    expect(topPerformers.map((s) => [s.studentId, s.score])).toEqual([['a', 100], ['b', 83]]);
  });

  it('ranks engagement by attempt count, independent of score', () => {
    const { mostEngaged } = buildPrereqAnalytics({ rows, chapters: CHAPTERS });
    expect(mostEngaged.map((s) => [s.studentId, s.attempts])).toEqual([['b', 3], ['a', 1]]);
    expect(mostEngaged[0].scopes).toBe(2);
  });
});

describe('buildPrereqAnalytics — gaps by chapter', () => {
  it('counts weak students per prerequisite and includes scopes with no data', () => {
    const rows = [
      row({ student_id: 'a', scope: 'chapter', chapter_id: 'c3', branch: 'alert', weak_count: 2, weak_labels: '["الأس العلمي","تعريف العنصر"]' }),
      row({ student_id: 'b', scope: 'chapter', chapter_id: 'c3', branch: 'capsule', weak_count: 1, weak_labels: '["الأس العلمي"]' }),
      row({ student_id: 'c', scope: 'chapter', chapter_id: 'c3', branch: 'direct', weak_count: 0 }),
    ];
    const { gapsByChapter } = buildPrereqAnalytics({ rows, chapters: CHAPTERS });
    expect(gapsByChapter.map((g) => g.key)).toEqual(['subject', 'c2', 'c3']);
    const c3 = gapsByChapter.find((g) => g.key === 'c3');
    expect(c3.assessed).toBe(3);
    expect(c3.alerts).toBe(1);
    expect(c3.gaps[0]).toEqual({ label: 'الأس العلمي', count: 2, pct: 67 });
    expect(gapsByChapter.find((g) => g.key === 'c2').assessed).toBe(0);
  });

  it('returns an empty-but-valid shape with no rows', () => {
    const res = buildPrereqAnalytics();
    expect(res.alerts).toEqual([]);
    expect(res.topPerformers).toEqual([]);
    expect(res.totals).toEqual({ studentsAssessed: 0, attempts: 0, openAlerts: 0, alerts: 0 });
    expect(res.gapsByChapter).toHaveLength(1);
  });
});
