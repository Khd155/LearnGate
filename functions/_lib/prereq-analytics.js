// Prerequisite-diagnostic analytics — pure aggregation over rows already
// fetched from Postgres (student_prereq_results joined with students, plus the
// latest admin message per student). Kept out of functions/api/[[route]].js so
// the ranking / gap logic is unit-testable without the request plumbing (same
// split as journey.js and test-management.js).
//
// The four views the supervisor panel renders all come from ONE query:
//   alerts         — students whose latest result on a scope branched to 'alert'
//   topPerformers  — mean share of prerequisites answered correctly (quality)
//   mostEngaged    — number of diagnostic attempts (effort, independent of score)
//   gapsByChapter  — per scope, how many students are weak in each prerequisite

const SUBJECT_KEY = 'subject';
const TOP_N = 10;

function parseLabels(raw) {
  try {
    const v = JSON.parse(raw || '[]');
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

const keyOf = (r) => `${r.student_id}|${r.scope}|${r.chapter_id || ''}`;
const scopeKey = (r) => (r.scope === 'chapter' && r.chapter_id ? r.chapter_id : SUBJECT_KEY);

// Newest result per (student, scope, chapter) — a retake supersedes the older
// attempt, so an old alert stops showing once the student recovers.
export function latestResults(rows) {
  const sorted = [...rows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const seen = new Set();
  const out = [];
  for (const r of sorted) {
    const k = keyOf(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

export function buildPrereqAnalytics({ rows = [], chapters = [], lastAdminMessageAt = {} } = {}) {
  const chapterTitle = new Map(chapters.map((c) => [c.chapterId, c.title]));
  const latest = latestResults(rows);

  const titleFor = (r) => (r.scope === 'chapter' && r.chapter_id
    ? (chapterTitle.get(r.chapter_id) || r.chapter_id)
    : 'التشخيص العام للمادة');

  // ── alerts ────────────────────────────────────────────────────────────
  const alerts = latest
    .filter((r) => r.branch === 'alert')
    .map((r) => {
      const weakLabels = parseLabels(r.weak_labels);
      const lastMsg = lastAdminMessageAt[r.student_id];
      return {
        studentId: r.student_id,
        name: r.name || '—',
        school: r.school || '',
        code: r.code || '',
        scope: r.scope,
        chapterId: r.chapter_id || null,
        scopeTitle: titleFor(r),
        weakLabels,
        weakCount: Number(r.weak_count) || weakLabels.length,
        totalCount: Number(r.total_count) || 0,
        severity: Number(r.total_count) > 0 && Number(r.weak_count) >= Number(r.total_count) ? 'critical' : 'moderate',
        createdAt: r.created_at,
        // Followed up = support wrote to the student after the alert was raised.
        followedUp: !!lastMsg && String(lastMsg) > String(r.created_at),
      };
    })
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  // ── per-student roll-ups ──────────────────────────────────────────────
  const byStudent = new Map();
  const touch = (r) => {
    if (!byStudent.has(r.student_id)) {
      byStudent.set(r.student_id, { studentId: r.student_id, name: r.name || '—', school: r.school || '', latest: [], attempts: 0, lastAt: '' });
    }
    return byStudent.get(r.student_id);
  };
  for (const r of rows) {
    const s = touch(r);
    s.attempts += 1;
    if (String(r.created_at) > s.lastAt) s.lastAt = String(r.created_at);
  }
  for (const r of latest) touch(r).latest.push(r);

  const topPerformers = [...byStudent.values()]
    .map((s) => {
      const shares = s.latest
        .filter((r) => Number(r.total_count) > 0)
        .map((r) => (Number(r.total_count) - Number(r.weak_count)) / Number(r.total_count));
      const score = shares.length ? Math.round((shares.reduce((a, b) => a + b, 0) / shares.length) * 100) : null;
      return { studentId: s.studentId, name: s.name, school: s.school, score, assessed: shares.length };
    })
    .filter((s) => s.score !== null)
    .sort((a, b) => b.score - a.score || b.assessed - a.assessed || a.name.localeCompare(b.name, 'ar'))
    .slice(0, TOP_N);

  const mostEngaged = [...byStudent.values()]
    .map((s) => ({
      studentId: s.studentId, name: s.name, school: s.school,
      attempts: s.attempts,
      scopes: new Set(s.latest.map(scopeKey)).size,
      lastAt: s.lastAt,
    }))
    .sort((a, b) => b.attempts - a.attempts || b.scopes - a.scopes || String(b.lastAt).localeCompare(String(a.lastAt)))
    .slice(0, TOP_N);

  // ── gaps by chapter ───────────────────────────────────────────────────
  const groups = new Map();
  const ensureGroup = (key, title, order) => {
    if (!groups.has(key)) groups.set(key, { key, title, order, assessed: 0, alerts: 0, labels: new Map() });
    return groups.get(key);
  };
  ensureGroup(SUBJECT_KEY, 'التشخيص العام للمادة', 0);
  for (const c of chapters) ensureGroup(c.chapterId, c.title, Number(c.orderNum) || 99);
  for (const r of latest) {
    const g = ensureGroup(scopeKey(r), titleFor(r), 99);
    g.assessed += 1;
    if (r.branch === 'alert') g.alerts += 1;
    for (const label of new Set(parseLabels(r.weak_labels))) g.labels.set(label, (g.labels.get(label) || 0) + 1);
  }
  const gapsByChapter = [...groups.values()]
    .sort((a, b) => a.order - b.order)
    .map((g) => ({
      key: g.key,
      title: g.title,
      assessed: g.assessed,
      alerts: g.alerts,
      gaps: [...g.labels.entries()]
        .map(([label, count]) => ({ label, count, pct: g.assessed ? Math.round((count / g.assessed) * 100) : 0 }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ar')),
    }));

  return {
    totals: {
      studentsAssessed: byStudent.size,
      attempts: rows.length,
      openAlerts: alerts.filter((a) => !a.followedUp).length,
      alerts: alerts.length,
    },
    alerts,
    topPerformers,
    mostEngaged,
    gapsByChapter,
  };
}
