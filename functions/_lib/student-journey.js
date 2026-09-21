// Student journey — pure assembly of one student's timeline from rows the dev
// endpoint already fetched (logs, prereq results/progress, tickets). Kept out of
// functions/api/[[route]].js so the ordering / classification rules are unit-testable.
//
// Every event: { at, kind, level, title, detail }
//   kind  : login | login_failed | open_page | diag_start | diag_result | unlock
//           | alert | ticket | error | suspicious | test | other
//   level : success | info | warn | error   (drives the colour in the UI)

const GATE_SCOPE = 'subject';

function parseLabels(raw) {
  try { const v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
}

function iso(v) { return v ? String(v) : ''; }

export function classifyLog(l) {
  const cat = String(l.category || '');
  const lvl = String(l.level || 'info');
  const msg = String(l.message || '');
  const meta = [l.device, l.ip].filter(Boolean).join(' · ');
  if (cat === 'login') {
    if (lvl === 'warn' || lvl === 'error') return { kind: 'login_failed', level: 'warn', title: 'محاولة دخول فاشلة', detail: meta || msg };
    return { kind: 'login', level: 'success', title: 'تسجيل الدخول', detail: meta || msg };
  }
  if (cat === 'prereq_alert') return { kind: 'alert', level: 'error', title: 'صدر تنبيه فجوات تراكمية للمشرف', detail: msg };
  if (cat === 'prereq') {
    if (msg.startsWith('فتح صفحة')) return { kind: 'open_page', level: 'info', title: msg, detail: meta };
    if (msg.startsWith('بدء تشخيص')) return { kind: 'diag_start', level: 'info', title: msg, detail: '' };
    return { kind: 'other', level: lvl === 'error' ? 'error' : 'info', title: msg, detail: meta };
  }
  if (cat === 'suspicious') return { kind: 'suspicious', level: 'warn', title: 'سلوك مشبوه', detail: msg };
  if (lvl === 'error' || cat === 'error') return { kind: 'error', level: 'error', title: 'خطأ برمجي', detail: msg + (meta ? ` — ${meta}` : '') };
  if (cat === 'test' || cat === 'plan' || cat === 'verbal' || cat === 'quantitative') return { kind: 'test', level: lvl === 'warn' ? 'warn' : 'info', title: msg, detail: '' };
  return { kind: 'other', level: lvl === 'warn' ? 'warn' : lvl === 'success' ? 'success' : 'info', title: msg, detail: meta };
}

export function buildStudentJourney({ student, logs = [], results = [], progress = null, tickets = [], chapters = [] } = {}) {
  const chapterTitle = new Map(chapters.map((c) => [c.chapterId, c.title]));
  const events = [];

  for (const l of logs) events.push({ at: iso(l.created_at), ...classifyLog(l) });

  // diagnostic outcomes come from the results table (the durable record)
  const ordered = [...results].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  let unlockedAt = null;
  for (const r of ordered) {
    const weak = parseLabels(r.weak_labels);
    const scope = r.scope === 'chapter' && r.chapter_id
      ? `تشخيص فصل «${chapterTitle.get(r.chapter_id) || r.chapter_id}»`
      : 'تشخيص متطلبات المادة';
    const missed = Number(r.weak_count) || weak.length;
    const total = Number(r.total_count) || 0;
    const level = r.branch === 'alert' ? 'error' : missed > 0 ? 'warn' : 'success';
    events.push({
      at: iso(r.created_at), kind: 'diag_result', level, title: `نتيجة ${scope}`,
      detail: missed > 0 ? `أخفق في ${missed} من ${total}: ${weak.join('، ') || '—'}` : `أجاب عن كل المتطلبات (${total} من ${total}) بنجاح`,
    });
    if (r.scope === GATE_SCOPE && !unlockedAt) {
      unlockedAt = iso(r.created_at);
      // one millisecond later so the timeline reads: result → unlock
      const t = new Date(unlockedAt).getTime();
      events.push({ at: Number.isFinite(t) ? new Date(t + 1).toISOString() : unlockedAt, kind: 'unlock', level: 'success', title: 'فُتحت الفصول الدراسية', detail: 'تحرّر القفل تلقائيًا بعد إنهاء التشخيص العام' });
    }
  }

  for (const t of tickets) {
    events.push({ at: iso(t.created_at), kind: 'ticket', level: t.status === 'resolved' ? 'success' : 'warn', title: `تذكرة دعم: ${t.subject || t.category || ''}`.trim(), detail: t.status === 'resolved' ? 'تم الحل' : 'تحتاج رد' });
  }

  events.sort((a, b) => a.at.localeCompare(b.at));

  const latestByScope = new Map();
  for (const r of ordered) latestByScope.set(`${r.scope}|${r.chapter_id || ''}`, r);
  const latest = [...latestByScope.values()].map((r) => ({
    scope: r.scope, chapterId: r.chapter_id || null,
    title: r.scope === 'chapter' ? (chapterTitle.get(r.chapter_id) || r.chapter_id) : 'المادة العامة',
    branch: r.branch, weakCount: Number(r.weak_count) || 0, totalCount: Number(r.total_count) || 0, at: iso(r.created_at),
  }));

  return {
    student: student ? { id: student.id, name: student.name, code: student.code, school: student.school || '', phone: student.phone || '' } : null,
    gate: {
      seenIntro: !!(progress && Number(progress.seen_intro) === 1) || !!unlockedAt,
      unlockedAt,
      openAlert: latest.some((x) => x.branch === 'alert'),
      latest,
    },
    events,
  };
}
