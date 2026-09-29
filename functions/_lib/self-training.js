// Self-training card (بطاقة التدرب الذاتي للقدرات) — server-side schema + sanitizer.
//
// The student's progress is stored as one JSON document per student
// (table student_self_training). Everything that reaches the database passes
// through sanitizeSelfTraining(), so a hand-crafted request can only ever
// store values the card itself could have produced: known round/skill keys,
// clip/model numbers inside that round's range, level states 0/1/2 with the
// "a later level can't be ahead of an earlier one" rule applied.
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
  return { round, section, skill };
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
