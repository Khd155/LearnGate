// Self-training card (بطاقة التدرب الذاتي للقدرات) — server-side schema + sanitizer.
//
// The student's progress is stored as one JSON document per student
// (table student_self_training). Everything that reaches the database passes
// through sanitizeSelfTraining(), so a hand-crafted request can only ever
// store values the card itself could have produced: known round/skill keys,
// clip/model numbers inside that round's range, level states 0/1/2 with the
// "a later level can't be ahead of an earlier one" rule applied, and fast-track
// keys (ui.fast) limited to known "roundId:skillId" pairs.
//
// SELF_TRAINING_PLAN must stay identical to PLAN in
// public/khaldiya/js/self-training.js (a test enforces it).

export const SELF_TRAINING_PLAN = {
  sections: [
    { id: 'verbal', name: 'القسم اللفظي', skills: [
      { id: 'analogy', name: 'التناظر اللفظي' },
      { id: 'completion', name: 'إكمال الجمل' },
      { id: 'contextual', name: 'الخطأ السياقي' },
      { id: 'odd', name: 'الارتباط والاختلاف' },
      { id: 'reading', name: 'استيعاب المقروء' },
    ] },
    { id: 'quant', name: 'القسم الكمي', skills: [
      { id: 'arithmetic', name: 'الحساب' },
      { id: 'algebra', name: 'الجبر' },
      { id: 'geometry', name: 'الهندسة' },
      { id: 'statistics', name: 'التحليل والإحصاء' },
      { id: 'comparison', name: 'المقارنات الكمية' },
    ] },
  ],
  rounds: [
    { id: 1, name: 'الجولة الأولى', intro: true, clips: { from: 1, to: 7, target: 5 }, models: { from: 1, to: 4, target: 2 } },
    { id: 2, name: 'الجولة الثانية', intro: false, clips: { from: 8, to: 14, target: 5 }, models: { from: 5, to: 7, target: 2 } },
    { id: 3, name: 'الجولة الثالثة', intro: false, clips: { from: 15, to: 21, target: 5 }, models: { from: 8, to: 10, target: 2 } },
  ],
  levels: [
    { id: 'easy', name: 'السهل' },
    { id: 'medium', name: 'المتوسط' },
    { id: 'advanced', name: 'المتقدم' },
  ],
};

/** Upper bound on the stored JSON (the full plan fits in well under 8 KB). */
export const SELF_TRAINING_MAX_BYTES = 32 * 1024;

const ROUNDS = new Map(SELF_TRAINING_PLAN.rounds.map((r) => [r.id, r]));
const SKILL_SECTION = new Map(SELF_TRAINING_PLAN.sections.flatMap((s) => s.skills.map((k) => [k.id, s.id])));
const LEVEL_IDS = SELF_TRAINING_PLAN.levels.map((l) => l.id);

function numbersInRange(list, range) {
  if (!Array.isArray(list)) return [];
  const out = new Set();
  for (const v of list) {
    const n = Number(v);
    if (Number.isInteger(n) && n >= range.from && n <= range.to) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

function cleanLevels(levels) {
  const src = levels && typeof levels === 'object' ? levels : {};
  const out = {};
  let earlierComplete = true;
  for (const id of LEVEL_IDS) {
    const v = Number(src[id]);
    const val = v === 1 || v === 2 ? v : 0;
    // same rule the card applies on click: a level can only be started once
    // the one before it is complete
    out[id] = earlierComplete ? val : 0;
    earlierComplete = earlierComplete && out[id] === 2;
  }
  return out;
}

function cleanRecord(round, rec) {
  const r = rec && typeof rec === 'object' ? rec : {};
  return {
    intro: round.intro ? (r.intro === true ? true : r.intro === false ? false : null) : null,
    clips: numbersInRange(r.clips, round.clips),
    models: numbersInRange(r.models, round.models),
    levels: cleanLevels(r.levels),
  };
}

function isEmptyRecord(r) {
  return r.intro === null && !r.clips.length && !r.models.length && LEVEL_IDS.every((id) => r.levels[id] === 0);
}

function cleanUi(ui) {
  const u = ui && typeof ui === 'object' ? ui : {};
  const round = ROUNDS.has(Number(u.round)) ? Number(u.round) : SELF_TRAINING_PLAN.rounds[0].id;
  const sectionIds = SELF_TRAINING_PLAN.sections.map((s) => s.id);
  const section = sectionIds.includes(u.section) ? u.section : sectionIds[0];
  const skills = SELF_TRAINING_PLAN.sections.find((s) => s.id === section).skills;
  const skill = skills.some((k) => k.id === u.skill) ? u.skill : skills[0].id;
  return { round, section, skill, fast: cleanFast(u.fast) };
}

/**
 * Fast-track choices ("تخطي للمستويات التقويمية"): "roundId:skillId" keys for the skills a
 * student trains on elsewhere. Only known round/skill pairs, unique and sorted (at most one
 * per round x skill), so the stored list stays tiny and can't carry anything else.
 */
function cleanFast(list) {
  if (!Array.isArray(list)) return [];
  const out = new Set();
  for (const v of list.slice(0, 200)) {
    const m = /^(\d+):([a-z]+)$/.exec(typeof v === 'string' ? v : '');
    if (m && ROUNDS.has(Number(m[1])) && SKILL_SECTION.has(m[2])) out.add(`${Number(m[1])}:${m[2]}`);
  }
  return [...out].sort();
}

/**
 * Normalize an untrusted card state into exactly what the card can produce.
 * Unknown keys, out-of-range numbers and malformed values are dropped, never
 * stored. Always returns a valid state (possibly empty).
 */
export function sanitizeSelfTraining(input) {
  const src = input && typeof input === 'object' ? input : {};
  const progress = {};
  const rawProgress = src.progress && typeof src.progress === 'object' ? src.progress : {};
  for (const [key, rec] of Object.entries(rawProgress)) {
    const m = /^(\d+):([a-z]+)$/.exec(key);
    if (!m) continue;
    const round = ROUNDS.get(Number(m[1]));
    if (!round || !SKILL_SECTION.has(m[2])) continue;
    const clean = cleanRecord(round, rec);
    if (!isEmptyRecord(clean)) progress[`${round.id}:${m[2]}`] = clean;
  }
  return { ui: cleanUi(src.ui), progress };
}

/** A compact summary (for logs/analytics): how many skill records exist and how many rounds have any activity. */
export function summarizeSelfTraining(state) {
  const keys = Object.keys((state && state.progress) || {});
  return { records: keys.length, rounds: [...new Set(keys.map((k) => Number(k.split(':')[0])))].sort() };
}


/* ── Automated progress: derived from what the student actually did ─────────
 * The card no longer takes self-reported input. Each card skill is tied to:
 *   - its lesson page  /lessons/<slug>/  — clicks are logged by js/telemetry.js into
 *     student_engagement_logs (resource_type 'video'; index 0 = the foundational
 *     clip, N = clip N);
 *   - its practice page /quizzes/<slug>/ — same log, resource_type 'practice_form',
 *     index N = «تدرب الآن» model N;
 *   - its quiz-skill code in the in-app quizzes (skill_progress rows keyed
 *     "<section>-<level>-<code>"): passed = complete, any attempt = started.
 */
export const SELF_TRAINING_SOURCES = {
  analogy:    { slug: 'analogy',       code: 'v4', section: 'verbal' },
  completion: { slug: 'completion',    code: 'v5', section: 'verbal' },
  contextual: { slug: 'contextual',    code: 'v2', section: 'verbal' },
  odd:        { slug: 'inference',     code: 'v3', section: 'verbal' },
  reading:    { slug: 'comprehension', code: 'v1', section: 'verbal' },
  arithmetic: { slug: 'arithmetic',    code: 'q1', section: 'quantitative' },
  algebra:    { slug: 'algebra',       code: 'q2', section: 'quantitative' },
  geometry:   { slug: 'geometry',      code: 'q3', section: 'quantitative' },
  statistics: { slug: 'statistics',    code: 'q5', section: 'quantitative' },
  comparison: { slug: 'comparison',    code: 'q4', section: 'quantitative' },
};

/**
 * Build the per-skill activity the card renders from.
 *   clicks:       rows of { skill_key, resource_type, resource_index }
 *   progressRows: rows of { quiz_skill_id, status, attempts }
 * Returns { [cardSkillId]: { introSeen, clips:[n], models:[n], levels:{easy,medium,advanced} } }
 * with levels as 0 not started / 1 started / 2 complete.
 */
export function buildSelfTrainingActivity({ clicks = [], progressRows = [] } = {}) {
  const bySlug = {};
  for (const c of clicks || []) {
    const slug = String(c.skill_key || '');
    const n = Number(c.resource_index);
    if (!slug || !Number.isInteger(n) || n < 0 || n > 500) continue;
    const b = (bySlug[slug] ||= { intro: false, clips: new Set(), models: new Set() });
    if (c.resource_type === 'video') { if (n === 0) b.intro = true; else b.clips.add(n); }
    else if (c.resource_type === 'practice_form' && n >= 1) b.models.add(n);
  }
  const prog = {};
  for (const r of progressRows || []) prog[String(r.quiz_skill_id)] = r;
  const levelState = (section, level, code) => {
    const r = prog[section + '-' + level + '-' + code];
    if (!r) return 0;
    if (r.status === 'passed') return 2;
    return Number(r.attempts) > 0 || r.status === 'failed' ? 1 : 0;
  };
  const out = {};
  for (const [skillId, src] of Object.entries(SELF_TRAINING_SOURCES)) {
    const b = bySlug[src.slug] || { intro: false, clips: new Set(), models: new Set() };
    out[skillId] = {
      introSeen: b.intro,
      clips: [...b.clips].sort((x, y) => x - y),
      models: [...b.models].sort((x, y) => x - y),
      levels: Object.fromEntries(LEVEL_IDS.map((l) => [l, levelState(src.section, l, src.code)])),
    };
  }
  return out;
}
