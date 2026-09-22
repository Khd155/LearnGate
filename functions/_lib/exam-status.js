// Per-student exam status for the dev panel's "إدارة الاختبارات" tab — pure
// summarisers over rows the endpoint already fetched, so the rules are unit-testable
// and adding a subject means adding one entry to EXAM_SUBJECTS (plus its loader in the route).
//
// Every summary shares: { subject, state, headline, detail, at, ... subject-specific fields }
//   state: 'done' | 'partial' | 'none'  (drives the badge colour in the UI)

export const CHEM_SUBJECT_ID = 'chemistry-1';

export const EXAM_SUBJECTS = {
  chem1: { aliases: ['chem1', 'chemistry-1', 'chemistry'] },
  bio1: { aliases: ['bio1', 'biology', 'bio', 'biology-1'] },
  aptitude: { aliases: ['aptitude', 'qudrat', 'plans'] },
};

export function normalizeExamSubject(raw) {
  const s = String(raw || '').trim().toLowerCase();
  for (const [key, def] of Object.entries(EXAM_SUBJECTS)) if (def.aliases.includes(s)) return key;
  return null;
}

const iso = (v) => (v ? String(v) : '');
const byDate = (a, b) => iso(a.created_at).localeCompare(iso(b.created_at));

function parseJson(raw, fallback) {
  if (Array.isArray(raw)) return raw;
  try { const v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v : fallback; } catch { return fallback; }
}

function pct(part, total) {
  return total > 0 ? Math.round(((total - part) / total) * 100) : null;
}

/** Chemistry 1 — the prerequisite diagnostic that gates the chapters. */
export function summarizeChem({ results = [], progress = null } = {}) {
  const ordered = [...results].sort(byDate);
  const subjectRows = ordered.filter((r) => r.scope === 'subject');
  const latest = subjectRows[subjectRows.length - 1] || null;
  const chapterRows = ordered.filter((r) => r.scope === 'chapter');
  const completed = !!latest;
  const weak = latest ? parseJson(latest.weak_labels, []).map(String) : [];
  const missed = latest ? (Number(latest.weak_count) || weak.length) : 0;
  const total = latest ? Number(latest.total_count) || 0 : 0;
  const score = latest ? pct(missed, total) : null;
  const seenIntro = !!(progress && Number(progress.seen_intro) === 1);
  return {
    subject: 'chem1',
    completed,
    unlocked: completed || seenIntro,
    state: completed ? 'done' : (seenIntro || chapterRows.length ? 'partial' : 'none'),
    score,
    headline: completed ? `${score ?? '—'}%` : 'لم يبدأ',
    detail: completed
      ? (missed > 0 ? `أخفق في ${missed} من ${total}: ${weak.join('، ') || '—'}` : `أجاب عن كل المتطلبات (${total} من ${total})`)
      : (seenIntro ? 'شاهد المقدمة ولم يكمل التشخيص' : 'لا توجد محاولة'),
    weakLabels: weak,
    openAlert: !!latest && latest.branch === 'alert',
    attempts: subjectRows.length,
    chapterAttempts: chapterRows.length,
    seenIntro,
    at: latest ? iso(latest.created_at) : '',
  };
}

/** Biology — pre / post attempts (rows from listTestResults). */
export function summarizeBio({ results = [] } = {}) {
  const ordered = [...results].sort(byDate);
  const last = (t) => [...ordered].reverse().find((r) => r.test_type === t) || null;
  const pre = last('pre'); const post = last('post');
  const fmt = (r) => (r ? { id: r.id, score: Number(r.score), at: iso(r.created_at) } : null);
  const improvement = pre && post ? Number(post.score) - Number(pre.score) : null;
  const state = post ? 'done' : pre ? 'partial' : 'none';
  const parts = [];
  if (pre) parts.push(`قبلي ${Number(pre.score)}%`);
  if (post) parts.push(`بعدي ${Number(post.score)}%`);
  return {
    subject: 'bio1',
    state,
    pre: fmt(pre), post: fmt(post), improvement,
    attempts: ordered.length,
    headline: parts.join(' · ') || 'لم يبدأ',
    detail: improvement === null ? (ordered.length ? `${ordered.length} محاولة` : 'لا توجد نتائج') : `${improvement >= 0 ? '+' : ''}${improvement}% بين القبلي والبعدي`,
    items: [...ordered].reverse().map((r) => ({ id: r.id, type: r.test_type, score: Number(r.score), at: iso(r.created_at) })),
    at: ordered.length ? iso(ordered[ordered.length - 1].created_at) : '',
  };
}

/** Aptitude (اختبار القدرات) — study plans with per-skill gaps. */
export function summarizeAptitude({ plans = [] } = {}) {
  const ordered = [...plans].sort(byDate);
  const latest = ordered[ordered.length - 1] || null;
  const gaps = latest ? parseJson(latest.gaps, []) : [];
  const avg = gaps.length ? Math.round(gaps.reduce((s, g) => s + (Number(g.pct) || 0), 0) / gaps.length) : null;
  const weakest = [...gaps].sort((a, b) => (Number(a.pct) || 0) - (Number(b.pct) || 0)).slice(0, 3)
    .map((g) => ({ name: g.skillName || g.skillId || '', pct: Number(g.pct) || 0 }));
  return {
    subject: 'aptitude',
    state: !latest ? 'none' : latest.status === 'active' ? 'done' : 'partial',
    planStatus: latest ? latest.status : null,
    avg, skills: gaps.length, weakest,
    attempts: ordered.length,
    headline: latest ? `${avg ?? '—'}%` : 'لم يبدأ',
    detail: latest ? `${gaps.length} مهارة · الخطة ${latest.status === 'active' ? 'معتمدة' : 'معلّقة'}` : 'لا توجد خطة',
    items: [...ordered].reverse().map((p) => ({ id: p.id, status: p.status, skills: parseJson(p.gaps, []).length, at: iso(p.created_at) })),
    at: latest ? iso(latest.created_at) : '',
  };
}

export function summarizeExam(subject, rows) {
  if (subject === 'chem1') return summarizeChem(rows);
  if (subject === 'bio1') return summarizeBio(rows);
  if (subject === 'aptitude') return summarizeAptitude(rows);
  throw new Error('مادة غير معروفة');
}

/** "عرض الكل": group flat rows by student and summarise each group (newest activity first). */
export function buildExamRoster(subject, flat, { limit = 500 } = {}) {
  const groups = new Map();
  for (const r of flat) {
    const id = r.student_id;
    if (!id) continue;
    if (!groups.has(id)) groups.set(id, { studentId: id, name: r.student_name || '', school: r.school || '', code: r.code || '', rows: [] });
    groups.get(id).rows.push(r);
  }
  const key = subject === 'chem1' ? 'results' : subject === 'bio1' ? 'results' : 'plans';
  const rows = [...groups.values()].map((g) => {
    const s = summarizeExam(subject, { [key]: g.rows });
    return { studentId: g.studentId, name: g.name, school: g.school, code: g.code, ...s };
  }).sort((a, b) => b.at.localeCompare(a.at));
  return { rows: rows.slice(0, limit), total: rows.length, truncated: rows.length > limit };
}
