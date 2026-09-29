/* ═══════════════════════════════════════════════════════════════════════
   بطاقة التدرب الذاتي للقدرات — screen-self-training (/self-training)
   ─────────────────────────────────────────────────────────────────────
   1) PLAN holds all content (sections, skills, rounds, evaluation levels).
      It must stay identical to SELF_TRAINING_PLAN in
      functions/_lib/self-training.js — a test enforces it.
   2) Progress is NOT entered by the student. It is derived from what they
      actually did (GET /api/self-training -> activity):
        - foundational clip / training clips: clicks on /lessons/<slug>/
          (logged by js/telemetry.js: index 0 = foundational, N = clip N);
        - «تدرب الآن» models: clicks on /quizzes/<slug>/ practice forms;
        - evaluation levels: the in-app quizzes (skill_progress).
      progressFromActivity() turns that into state.progress, keyed
      "roundId:skillId" -> { intro, clips, models, levels }, which every
      rule below reads unchanged.
   3) Only the student's place on the card (round/section/skill) is saved
      (PUT /api/self-training, revision-checked). The card refreshes itself
      whenever the student comes back to it (tab focus / return from a lesson).
   4) Progressive unlocking (unchanged from the approved prototype):
      - a step opens only after the previous step of the same skill is done;
      - the next skill opens after the current skill's steps + the easy level;
      - the quantitative section opens after all three levels of every
        verbal skill; the next round opens after both sections are complete.
   Everything below `core` is pure and has no DOM dependency.
   ═══════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  const PLAN = {
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

  /* ───────────────────────────── core (pure) ───────────────────────────── */
  const blank = () => ({ intro: null, clips: [], models: [], levels: { easy: 0, medium: 0, advanced: 0 } });
  const roundById = (id) => PLAN.rounds.find((r) => r.id === id);
  const sectionById = (id) => PLAN.sections.find((s) => s.id === id);
  const emptyState = () => ({ ui: { round: 1, section: 'verbal', skill: PLAN.sections[0].skills[0].id }, progress: {} });

  function peek(progress, roundId, skillId) { return progress[roundId + ':' + skillId] || blank(); }
  function rec(progress, roundId, skillId) {
    const key = roundId + ':' + skillId;
    if (!progress[key]) progress[key] = blank();
    return progress[key];
  }
  function stepKeys(round) { return round.intro ? ['intro', 'clips', 'models', 'eval'] : ['clips', 'models', 'eval']; }
  function stepDone(round, r, key) {
    if (key === 'intro') return r.intro === true;
    if (key === 'clips') return r.clips.length >= round.clips.target;
    if (key === 'models') return r.models.length >= round.models.target;
    if (key === 'eval') return r.levels.easy === 2;
    return false;
  }
  function skillComplete(p, round, skillId) { const r = peek(p, round.id, skillId); return stepKeys(round).every((k) => stepDone(round, r, k)); }
  function skillFullyEvaluated(p, round, skillId) {
    const r = peek(p, round.id, skillId);
    return skillComplete(p, round, skillId) && PLAN.levels.every((l) => r.levels[l.id] === 2);
  }
  function skillPct(p, round, skillId) {
    const r = peek(p, round.id, skillId);
    let got = 0, total = 0;
    if (round.intro) { total += 1; got += r.intro === true ? 1 : 0; }
    total += round.clips.target; got += Math.min(r.clips.length, round.clips.target);
    total += round.models.target; got += Math.min(r.models.length, round.models.target);
    PLAN.levels.forEach((l) => { total += 1; got += r.levels[l.id] === 2 ? 1 : r.levels[l.id] === 1 ? 0.4 : 0; });
    return Math.round((got / total) * 100);
  }
  function sectionComplete(p, round, sec) { return sec.skills.every((k) => skillFullyEvaluated(p, round, k.id)); }
  function sectionPct(p, round, sec) { return Math.round(sec.skills.reduce((a, k) => a + skillPct(p, round, k.id), 0) / sec.skills.length); }
  function roundComplete(p, round) { return PLAN.sections.every((s) => sectionComplete(p, round, s)); }
  function roundPct(p, round) { return Math.round(PLAN.sections.reduce((a, s) => a + sectionPct(p, round, s), 0) / PLAN.sections.length); }
  function roundUnlocked(p, i) { return i === 0 || roundComplete(p, PLAN.rounds[i - 1]); }
  function sectionUnlocked(p, round, si) { return si === 0 || sectionComplete(p, round, PLAN.sections[si - 1]); }
  function skillUnlocked(p, round, sec, ki) {
    const si = PLAN.sections.indexOf(sec);
    return sectionUnlocked(p, round, si) && (ki === 0 || skillComplete(p, round, sec.skills[ki - 1].id));
  }

  /** The suggested next step for the student in a round, or null when the round is done. */
  function nextAction(p, round) {
    for (const sec of PLAN.sections) {
      for (const k of sec.skills) {
        if (skillComplete(p, round, k.id)) continue;
        const r = peek(p, round.id, k.id);
        const key = stepKeys(round).find((s) => !stepDone(round, r, s));
        const msg = {
          intro: 'استمع إلى المقطع التأسيسي',
          clips: 'شاهد مقاطع التدريبات (' + ar(r.clips.length) + ' من ' + ar(round.clips.target) + ')',
          models: 'حل نماذج «تدرب الآن» (' + ar(r.models.length) + ' من ' + ar(round.models.target) + ')',
          eval: 'أكمل المستوى السهل في الاختبارات التقويمية',
        }[key];
        return { sec: sec.id, skill: k.id, text: msg + ' — ' + k.name };
      }
      for (const lvl of PLAN.levels) {
        const k = sec.skills.find((sk) => peek(p, round.id, sk.id).levels[lvl.id] !== 2);
        if (k) return { sec: sec.id, skill: k.id, text: 'أكمل المستوى ' + lvl.name + ' في الاختبارات التقويمية — ' + k.name };
      }
    }
    return null;
  }

  function pickFirstOpenSkill(p, round, sec) {
    const nx = nextAction(p, round);
    if (nx && nx.sec === sec.id) return nx.skill;
    const open = sec.skills.find((k, ki) => skillUnlocked(p, round, sec, ki) && !skillFullyEvaluated(p, round, k.id));
    return open ? open.id : sec.skills[0].id;
  }

  /**
   * The reducer: apply one card action to the state (mutates and returns it).
   * Returns false for an action that changes nothing / isn't allowed.
   */
  function applyAction(state, a) {
    const p = state.progress;
    const round = roundById(state.ui.round);
    const r = () => rec(p, round.id, state.ui.skill);
    switch (a.type) {
      case 'round': {
        const ri = PLAN.rounds.findIndex((x) => x.id === Number(a.id));
        if (ri < 0 || !roundUnlocked(p, ri)) return false;
        state.ui.round = PLAN.rounds[ri].id;
        const nx = nextAction(p, PLAN.rounds[ri]);
        state.ui.section = nx ? nx.sec : PLAN.sections[0].id;
        state.ui.skill = nx ? nx.skill : sectionById(state.ui.section).skills[0].id;
        return true;
      }
      case 'section': {
        const si = PLAN.sections.findIndex((s) => s.id === a.id);
        if (si < 0 || !sectionUnlocked(p, round, si)) return false;
        state.ui.section = a.id;
        state.ui.skill = pickFirstOpenSkill(p, round, PLAN.sections[si]);
        return true;
      }
      case 'skill': case 'goto': {
        const sec = sectionById(a.sec || state.ui.section);
        const ki = sec ? sec.skills.findIndex((k) => k.id === a.id) : -1;
        if (ki < 0 || !skillUnlocked(p, round, sec, ki)) return false;
        state.ui.section = sec.id; state.ui.skill = a.id;
        return true;
      }
      case 'intro':
        if (!round.intro) return false;
        r().intro = !!a.value;
        return true;
      case 'clip': case 'model': {
        const range = a.type === 'clip' ? round.clips : round.models;
        const n = Number(a.n);
        if (!Number.isInteger(n) || n < range.from || n > range.to) return false;
        const list = r()[a.type === 'clip' ? 'clips' : 'models'];
        const i = list.indexOf(n);
        // `on` makes the op idempotent (safe to replay after a conflict); without it, toggle
        const want = typeof a.on === 'boolean' ? a.on : i < 0;
        if (want && i < 0) list.push(n);
        else if (!want && i >= 0) list.splice(i, 1);
        else return false;
        list.sort((x, y) => x - y);
        return true;
      }
      case 'level': {
        const idx = PLAN.levels.findIndex((l) => l.id === a.id);
        const v = Number(a.value);
        if (idx < 0 || ![0, 1, 2].includes(v)) return false;
        const lv = r().levels;
        if (idx > 0 && lv[PLAN.levels[idx - 1].id] !== 2) return false; // locked level
        lv[a.id] = v;
        // stepping a level back from «مكتملة» resets every level after it
        if (v !== 2) PLAN.levels.slice(idx + 1).forEach((l) => { lv[l.id] = 0; });
        return true;
      }
      case 'reset':
        state.progress = {};
        state.ui = emptyState().ui;
        return true;
      default:
        return false;
    }
  }

  /** Make any stored/received state safe to render (mirrors the server sanitizer's shape). */
  function normalize(input) {
    const s = input && typeof input === 'object' ? input : {};
    const out = emptyState();
    const ui = s.ui || {};
    if (roundById(Number(ui.round))) out.ui.round = Number(ui.round);
    if (sectionById(ui.section)) out.ui.section = ui.section;
    const sec = sectionById(out.ui.section);
    out.ui.skill = sec.skills.some((k) => k.id === ui.skill) ? ui.skill : sec.skills[0].id;
    const src = s.progress && typeof s.progress === 'object' ? s.progress : {};
    for (const [key, v] of Object.entries(src)) {
      if (!/^\d+:[a-z]+$/.test(key) || !v || typeof v !== 'object') continue;
      out.progress[key] = {
        intro: v.intro === true ? true : v.intro === false ? false : null,
        clips: Array.isArray(v.clips) ? v.clips.map(Number).filter(Number.isInteger) : [],
        models: Array.isArray(v.models) ? v.models.map(Number).filter(Number.isInteger) : [],
        levels: { easy: +v.levels?.easy || 0, medium: +v.levels?.medium || 0, advanced: +v.levels?.advanced || 0 },
      };
    }
    // never leave the student parked on a round/section/skill that is locked
    const p = out.progress;
    const ri = PLAN.rounds.findIndex((x) => x.id === out.ui.round);
    if (!roundUnlocked(p, ri)) { out.ui.round = 1; }
    const round = roundById(out.ui.round);
    const si = PLAN.sections.findIndex((x) => x.id === out.ui.section);
    if (!sectionUnlocked(p, round, si)) out.ui.section = 'verbal';
    const sec2 = sectionById(out.ui.section);
    const ki = sec2.skills.findIndex((k) => k.id === out.ui.skill);
    if (ki < 0 || !skillUnlocked(p, round, sec2, ki)) out.ui.skill = pickFirstOpenSkill(p, round, sec2);
    return out;
  }

  function ar(n) { return String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]); }

  /** Where each card skill's activity comes from — identical to SELF_TRAINING_SOURCES on the server. */
  const SOURCES = {
    analogy: { slug: 'analogy', code: 'v4', section: 'verbal' },
    completion: { slug: 'completion', code: 'v5', section: 'verbal' },
    contextual: { slug: 'contextual', code: 'v2', section: 'verbal' },
    odd: { slug: 'inference', code: 'v3', section: 'verbal' },
    reading: { slug: 'comprehension', code: 'v1', section: 'verbal' },
    arithmetic: { slug: 'arithmetic', code: 'q1', section: 'quantitative' },
    algebra: { slug: 'algebra', code: 'q2', section: 'quantitative' },
    geometry: { slug: 'geometry', code: 'q3', section: 'quantitative' },
    statistics: { slug: 'statistics', code: 'q5', section: 'quantitative' },
    comparison: { slug: 'comparison', code: 'q4', section: 'quantitative' },
  };

  /**
   * Activity (per skill, across the whole platform) -> card progress (per round).
   * Clip/model numbers are global on the lesson/practice pages, so each round
   * simply counts the ones inside its own range; quiz levels apply to every round.
   */
  function progressFromActivity(activity) {
    const act = activity && typeof activity === 'object' ? activity : {};
    const progress = {};
    const nums = (list, range) => (Array.isArray(list) ? list : []).map(Number)
      .filter((n) => Number.isInteger(n) && n >= range.from && n <= range.to);
    for (const round of PLAN.rounds) {
      for (const sec of PLAN.sections) {
        for (const k of sec.skills) {
          const a = act[k.id] || {};
          const lv = a.levels || {};
          const rec = {
            intro: round.intro && a.introSeen ? true : null,
            clips: [...new Set(nums(a.clips, round.clips))].sort((x, y) => x - y),
            models: [...new Set(nums(a.models, round.models))].sort((x, y) => x - y),
            levels: { easy: [1, 2].includes(+lv.easy) ? +lv.easy : 0, medium: [1, 2].includes(+lv.medium) ? +lv.medium : 0, advanced: [1, 2].includes(+lv.advanced) ? +lv.advanced : 0 },
          };
          if (rec.intro || rec.clips.length || rec.models.length || rec.levels.easy || rec.levels.medium || rec.levels.advanced) {
            progress[round.id + ':' + k.id] = rec;
          }
        }
      }
    }
    return progress;
  }

  const core = {
    PLAN, emptyState, peek, stepKeys, stepDone, skillComplete, skillFullyEvaluated, skillPct,
    sectionComplete, sectionPct, roundComplete, roundPct, roundUnlocked, sectionUnlocked, skillUnlocked,
    nextAction, pickFirstOpenSkill, applyAction, normalize, ar, SOURCES, progressFromActivity,
  };

  /* ───────────────────────────── view ───────────────────────────── */
  const ICON = {
    check: '<svg class="st-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    lock: '<svg class="st-i" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    play: '<svg class="st-i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M10 8.8v6.4l5.2-3.2z"/></svg>',
    film: '<svg class="st-i" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 9.5h18M8 5v4.5M16 5v4.5"/></svg>',
    pen: '<svg class="st-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M14 7l3 3"/></svg>',
    target: '<svg class="st-i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".9"/></svg>',
    spark: '<svg class="st-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.6 2.6M15.4 15.4 18 18M6 18l2.6-2.6M15.4 8.6 18 6"/></svg>',
    cloud: '<svg class="st-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.2 11 3.5 3.5 0 0 0 7 18z"/></svg>',
    cloudOff: '<svg class="st-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18h9M20.2 14.8A4 4 0 0 0 17.6 10 6 6 0 0 0 9 6.3M6 9.8A3.5 3.5 0 0 0 7 18M3 3l18 18"/></svg>',
    reset: '<svg class="st-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/></svg>',
    open: '<svg class="st-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/></svg>',
    quiz: '<svg class="st-i" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>',
  };
  const STEP_ICON = { intro: ICON.play, clips: ICON.film, models: ICON.pen, eval: ICON.target };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let state = emptyState();
  // pending = operations applied locally that the server hasn't acknowledged yet (persisted in the cache)
  const sync = { rev: 0, pending: [], dirty: false, inflight: false, timer: null, retry: 0, status: 'idle', studentId: null, loaded: false };
  let activity = {};          // last activity received from the server (see progressFromActivity)
  let lastRefresh = 0;
  let wired = false;
  /** Rebuild the rendered state from a saved position + the current activity. */
  const withActivity = (raw) => normalize({ ui: raw && raw.ui, progress: progressFromActivity(activity) });

  const $ = (id) => document.getElementById(id);

  function render() {
    const screen = $('screen-self-training');
    if (!screen) return;
    const p = state.progress;
    const round = roundById(state.ui.round);
    const sec = sectionById(state.ui.section);
    screen.dataset.section = sec.id;

    // hero: overall ring + rounds
    const pct = roundPct(p, round);
    const ring = $('st-overall');
    ring.style.setProperty('--p', pct);
    ring.setAttribute('aria-label', 'نسبة إنجاز ' + round.name + ' ' + pct + ' بالمئة');
    $('st-overall-pct').textContent = ar(pct) + '٪';
    $('st-overall-round').textContent = round.name;

    $('st-rounds').innerHTML = PLAN.rounds.map((r, i) => {
      const open = roundUnlocked(p, i), done = roundComplete(p, r), cur = r.id === round.id;
      return `<button type="button" class="st-round${done ? ' is-done' : ''}" data-st="round" data-id="${r.id}" aria-pressed="${cur}" ${open ? '' : 'disabled'}>
        ${done ? ICON.check : open ? '' : ICON.lock}<span>${esc(r.name)}</span><span class="st-round-pct">${open ? ar(roundPct(p, r)) + '٪' : 'مقفلة'}</span></button>`;
    }).join('');

    // next action
    const nx = nextAction(p, round);
    const ri = PLAN.rounds.indexOf(round);
    if (nx) {
      $('st-next').innerHTML = `<span class="st-next-ic">${ICON.spark}</span>
        <p><small>خطوتك التالية في ${esc(round.name)}</small><strong>${esc(nx.text)}</strong></p>
        ${nx.skill !== state.ui.skill ? `<button class="st-btn" type="button" data-st="goto" data-sec="${nx.sec}" data-id="${nx.skill}">انتقل إليها</button>` : ''}`;
    } else {
      const nr = PLAN.rounds[ri + 1];
      $('st-next').innerHTML = `<span class="st-next-ic is-done">${ICON.check}</span>
        <p><small>أحسنت</small><strong>أنهيت ${esc(round.name)} بالكامل${nr ? '، وأصبحت ' + esc(nr.name) + ' متاحة' : ''}.</strong></p>
        ${nr ? `<button class="st-btn" type="button" data-st="round" data-id="${nr.id}">ابدأ ${esc(nr.name)}</button>` : ''}`;
    }

    // sections
    $('st-sections').innerHTML = PLAN.sections.map((s, si) => {
      const open = sectionUnlocked(p, round, si), sp = sectionPct(p, round, s), done = sectionComplete(p, round, s);
      const doneSkills = s.skills.filter((k) => skillComplete(p, round, k.id)).length;
      return `<button class="st-sec" type="button" data-st="section" data-id="${s.id}" data-sid="${s.id}" aria-pressed="${s.id === sec.id}" ${open ? '' : 'disabled'}>
        <span class="st-sec-h">${open ? '' : ICON.lock}<span>${esc(s.name)}</span>${done ? '<span class="st-pill ok">مكتمل</span>' : ''}<b class="st-num">${ar(sp)}٪</b></span>
        <span class="st-bar"><i style="width:${sp}%"></i></span>
        <span class="st-sec-meta">${open ? 'المهارات المنجزة ' + ar(doneSkills) + ' من ' + ar(s.skills.length) : 'يُفتح بعد إكمال ' + esc(PLAN.sections[si - 1].name)}</span>
      </button>`;
    }).join('');

    // skills
    $('st-skills').innerHTML = sec.skills.map((k, ki) => {
      const open = skillUnlocked(p, round, sec, ki), full = skillFullyEvaluated(p, round, k.id), done = skillComplete(p, round, k.id), kp = skillPct(p, round, k.id);
      const left = PLAN.levels.filter((l) => peek(p, round.id, k.id).levels[l.id] !== 2).map((l) => l.name);
      const st = !open ? 'مقفلة' : full ? 'مكتملة بالمستويات الثلاثة' : done ? 'بقي ' + left.join(' و') : kp > 0 ? 'قيد التدرب' : 'لم تبدأ';
      const ringHtml = !open ? `<span class="st-ring is-lock">${ICON.lock}</span>`
        : full ? `<span class="st-ring is-ok">${ICON.check}</span>`
        : `<span class="st-ring" style="--p:${kp}"><span class="st-num">${ar(ki + 1)}</span></span>`;
      return `<li><button class="st-skill" type="button" data-st="skill" data-id="${k.id}" aria-current="${k.id === state.ui.skill}" ${open ? '' : 'disabled'}>
        ${ringHtml}<span class="st-skill-t"><span class="st-skill-n">${esc(k.name)}</span><span class="st-skill-s">${st}</span></span></button></li>`;
    }).join('');

    renderCard(round, sec);
    renderSync();
  }

  function renderCard(round, sec) {
    const p = state.progress;
    const ki = Math.max(0, sec.skills.findIndex((k) => k.id === state.ui.skill));
    const skill = sec.skills[ki];
    const r = peek(p, round.id, skill.id);
    const full = skillFullyEvaluated(p, round, skill.id), done = skillComplete(p, round, skill.id);
    const status = full ? '<span class="st-pill ok">مكتملة</span>' : done ? '<span class="st-pill go">مجتازة، بقيت مستويات</span>' : '<span class="st-pill">قيد التدرب</span>';
    let prevDone = true;
    const steps = stepKeys(round).map((key, i) => {
      const d = stepDone(round, r, key);
      const locked = !prevDone;
      const html = stepHTML(key, round, r, locked, i + 1, d ? 'is-done' : locked ? 'is-lock' : 'is-cur', d);
      prevDone = prevDone && d;
      return html;
    }).join('');
    $('st-card').innerHTML = `
      <header class="st-card-h">
        <div><p class="st-card-eyebrow">${esc(sec.name)} · ${esc(round.name)} · المهارة ${ar(ki + 1)} من ${ar(sec.skills.length)}</p><h2 class="st-card-t">${esc(skill.name)}</h2></div>
        ${status}
      </header>
      <ol class="st-steps">${steps}</ol>
      ${full ? `<p class="st-done-note">${ICON.check}<span>أنهيت ${esc(skill.name)} في ${esc(round.name)}. ${ki + 1 < sec.skills.length ? 'انتقل إلى المهارة التالية: ' + esc(sec.skills[ki + 1].name) + '.' : 'راجع بقية المهارات حتى يكتمل ' + esc(sec.name) + '.'}</span></p>` : ''}`;
  }

  const lessonUrl = (skillId) => '/lessons/' + SOURCES[skillId].slug + '/?from=self-training';
  const practiceUrl = (skillId) => '/quizzes/' + SOURCES[skillId].slug + '/?from=self-training';
  const LEVEL_TEXT = ['لم تبدأ', 'بدأت', 'مكتملة'];

  function stepHTML(key, round, r, locked, n, cls, d) {
    const skillId = state.ui.skill;
    const mk = `<span class="st-mk">${d ? ICON.check : STEP_ICON[key]}</span>`;
    const lockMsg = locked && !d ? `<p class="st-lockmsg">${ICON.lock}<span>يُنصح بإكمال الخطوة ${ar(n - 1)} أولًا</span></p>` : '';
    const link = (href, text, icon) => `<a class="st-act" href="${href}" target="_blank" rel="noopener">${icon}<span>${text}</span></a>`;
    let title, status, hint, ctl = '', action = '';
    if (key === 'intro') {
      title = 'المقطع التأسيسي';
      status = d ? 'شاهدت المقطع التأسيسي لهذه المهارة.' : 'لم تفتح المقطع التأسيسي بعد.';
      hint = 'يُسجَّل تلقائيًا عند فتحك مقطع «تأسيس» في صفحة شروحات المهارة.';
      if (!d) action = link(lessonUrl(skillId), 'افتح المقطع التأسيسي', ICON.play);
    } else if (key === 'clips') {
      const c = round.clips;
      title = 'مقاطع التدريبات';
      status = `المقاطع ${ar(c.from)}–${ar(c.to)} في ${esc(round.name)} — المطلوب ${ar(c.target)} على الأقل.`;
      hint = 'تُحسب تلقائيًا كل مرة تفتح فيها مقطعًا من صفحة الشروحات.';
      ctl = dots('clip', c, r.clips, 'المقطع');
      if (!d) action = link(lessonUrl(skillId), 'افتح مقاطع التدريبات', ICON.film);
    } else if (key === 'models') {
      const m = round.models;
      title = 'تدرب الآن';
      status = `النماذج ${ar(m.from)}–${ar(m.to)} — المطلوب ${ar(m.target)} على الأقل.`;
      hint = 'تُحسب تلقائيًا عند فتحك نموذجًا من صفحة «تدرب الآن». حل النموذج حتى تصل إلى ١٠/١٠، وشاهد مقاطع الحل لكل خطأ.';
      ctl = dots('model', m, r.models, 'النموذج');
      if (!d) action = link(practiceUrl(skillId), 'افتح نماذج «تدرب الآن»', ICON.pen);
    } else {
      title = 'الاختبارات التقويمية';
      status = 'تُقرأ حالتها من نتائجك الفعلية في الاختبارات القصيرة للمهارة.';
      hint = 'إكمال المستوى السهل يفتح المهارة التالية، والمتوسط والمتقدم مطلوبان لإنهاء القسم.';
      ctl = `<div class="st-levels">${PLAN.levels.map((l, i) => {
        const v = r.levels[l.id];
        return `<div class="st-lvl${v === 2 ? ' is-done' : ''}">
          <span class="st-lvl-n">${v === 2 ? ICON.check : ''}<span>المستوى ${l.name}</span>${i === 0 ? '<span class="st-tag">يفتح المهارة التالية</span>' : ''}</span>
          <span class="st-pill${v === 2 ? ' ok' : v === 1 ? ' go' : ''}">${LEVEL_TEXT[v] || LEVEL_TEXT[0]}</span></div>`;
      }).join('')}</div>`;
      const nextLevel = PLAN.levels.find((l) => r.levels[l.id] !== 2);
      if (nextLevel) {
        action = `<button type="button" class="st-act" data-st="quiz" data-level="${nextLevel.id}">${ICON.quiz}<span>ابدأ اختبار المستوى ${nextLevel.name}</span></button>`;
      }
    }
    return `<li class="st-step ${cls}">${mk}<div class="st-step-b">
      <h3>${title}${d ? ' <span class="st-pill ok">منجزة</span>' : ''}</h3>
      <p class="st-q">${status}</p>${lockMsg}
      ${ctl ? `<div class="st-ctl">${ctl}</div>` : ''}
      ${action ? `<div class="st-actions">${action}</div>` : ''}
      <p class="st-hint">${hint}</p></div></li>`;
  }

  /** Read-only indicators: a lit capsule is a clip/model the student has really opened. */
  function dots(kind, range, picked, label) {
    const verb = kind === 'clip' ? 'فتحت' : 'فتحت';
    let out = '';
    for (let n = range.from; n <= range.to; n++) {
      const on = picked.includes(n);
      out += `<span class="st-dot st-num" role="img" data-on="${on}" aria-label="${label} ${n}: ${on ? 'تم' : 'لم يُفتح بعد'}">${on ? ICON.check : ''}<span>${ar(n)}</span></span>`;
    }
    const got = picked.length, tgt = range.target;
    return `<div class="st-dots">${out}</div>
      <p class="st-count"><span>${verb} <b class="st-num">${ar(got)}</b> من ${ar(range.to - range.from + 1)}</span>
      <span class="st-count-t${got >= tgt ? ' ok' : ''}">${got >= tgt ? ICON.check + 'تحقق الحد الأدنى' : 'الحد الأدنى ' + ar(tgt)}</span></p>`;
  }

  function renderSync() {
    const el = $('st-sync');
    if (!el) return;
    const map = {
      idle: [ICON.cloud, 'يُحدَّث تلقائيًا من نشاطك في المنصة'],
      loading: [ICON.cloud, 'جارٍ تحديث تقدمك…'],
      saving: [ICON.cloud, 'جارٍ التحديث…'],
      saved: [ICON.check, 'محدَّث من نشاطك الفعلي في المنصة'],
      offline: [ICON.cloudOff, 'تعذّر الاتصال — يُعرض آخر تقدم محفوظ'],
    };
    const [ic, txt] = map[sync.status] || map.idle;
    el.className = 'st-sync is-' + sync.status;
    el.innerHTML = ic + '<span>' + txt + '</span>';
  }

  /* ───────────────────────── persistence / sync ───────────────────────── */
  const cacheKey = () => 'lg_st_v2_' + (sync.studentId || 'anon');
  function writeCache() {
    try { localStorage.setItem(cacheKey(), JSON.stringify({ ui: state.ui, activity, rev: sync.rev, pending: sync.pending.slice(-200) })); } catch (e) { /* private mode / quota */ }
  }
  function readCache() {
    try { const raw = localStorage.getItem(cacheKey()); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  // app.js globals: apiFetch/show/showToast are window functions; State and _authToken are
  // top-level const/let there, which classic scripts share by name (not via window).
  const api = (path, opts) => (typeof apiFetch === 'function' ? apiFetch(path, opts) : Promise.reject(new Error('NO_API')));
  const appState = () => (typeof State !== 'undefined' ? State : null);

  function scheduleSave(delay) {
    clearTimeout(sync.timer);
    sync.timer = setTimeout(flush, delay == null ? 700 : delay);
  }

  /**
   * The server holds a newer version (another tab/device saved first): take it as the base and
   * replay this device's unsaved operations on top. Ops are idempotent, so replaying one the
   * server already has changes nothing; ops that no longer apply (e.g. now-locked) are dropped.
   */
  function rebase(server) {
    state = withActivity(server && server.state ? server.state : null);
    sync.rev = Number(server && server.rev) || 0;
    const kept = [];
    for (const op of sync.pending) if (applyAction(state, op)) kept.push(op);
    sync.pending = kept;
    sync.dirty = kept.length > 0;
    return kept.length;
  }

  async function flush() {
    clearTimeout(sync.timer); sync.timer = null;
    if (!sync.dirty || sync.inflight) return;
    sync.inflight = true;
    const sentOps = sync.pending.length;
    sync.status = 'saving'; renderSync();
    try {
      const res = await api('/self-training', { method: 'PUT', body: JSON.stringify({ state: { ui: state.ui }, baseRev: sync.rev }) });
      sync.retry = 0;
      if (res && res.conflict) {
        const merged = rebase(res);
        sync.status = merged ? 'saving' : 'saved';
        if (typeof showToast === 'function') showToast(merged ? 'تم دمج تقدمك مع تحديث من جهاز آخر' : 'تم تحديث تقدمك من جهاز آخر');
        render();
      } else {
        sync.rev = Number(res.rev) || sync.rev + 1;
        sync.pending.splice(0, sentOps);          // acknowledged; anything newer stays queued
        sync.dirty = sync.pending.length > 0;
        sync.status = sync.dirty ? 'saving' : 'saved';
      }
    } catch (e) {
      if (e && e.status === 401) {
        sync.status = 'offline';
      } else {
        sync.status = 'offline';
        sync.retry = Math.min(sync.retry + 1, 5);
        scheduleSave([4000, 8000, 15000, 30000, 60000][sync.retry - 1]);
      }
    } finally {
      sync.inflight = false;
      writeCache(); renderSync();
      if (sync.dirty && !sync.timer && sync.status !== 'offline') scheduleSave(300);
    }
  }

  /** Best-effort save when the page is being hidden/closed (keepalive survives unload). */
  function flushOnHide() {
    if (!sync.dirty || !sync.loaded) return;
    writeCache(); // the ops stay queued: if this request lands, replaying them later is a no-op
    try {
      const token = typeof _authToken !== 'undefined' ? _authToken : null; // app.js global
      if (!token) return;
      fetch('/api/self-training', {
        method: 'PUT', keepalive: true,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ state: { ui: state.ui }, baseRev: sync.rev }),
      }).catch(() => {});
    } catch (e) { /* ignore */ }
  }

  async function load() {
    sync.status = 'loading'; renderSync();
    try {
      const res = await api('/self-training');
      lastRefresh = Date.now();
      activity = res.activity && typeof res.activity === 'object' ? res.activity : {};
      const serverRev = Number(res.rev) || 0;
      if (serverRev !== sync.rev) rebase(res);  // server moved on (or was reset): rebase local ops onto it
      else state = withActivity(state);          // same position, fresh activity
      sync.dirty = sync.pending.length > 0;
      if (sync.dirty) scheduleSave(200);
      sync.status = sync.dirty ? 'saving' : 'saved';
    } catch (e) {
      sync.status = 'offline';
    }
    sync.loaded = true;
    writeCache();
    render();
  }

  /** Apply one user operation locally, queue it for the server, repaint. */
  function commit(op, delay) {
    if (!applyAction(state, op)) return false;
    sync.pending.push(op);
    sync.dirty = true;
    writeCache();
    render();
    scheduleSave(delay);
    return true;
  }

  /* ───────────────────────────── events ───────────────────────────── */
  function wire() {
    if (wired) return;
    const screen = $('screen-self-training');
    if (!screen) return;
    wired = true;
    screen.addEventListener('click', (e) => {
      const b = e.target.closest('[data-st]');
      if (!b || b.disabled || !screen.contains(b)) return;
      const t = b.dataset.st;
      if (t === 'quiz') { openQuiz(b.dataset.level); return; }
      if (!['round', 'section', 'skill', 'goto'].includes(t)) return; // progress is never edited by hand
      if (!commit({ type: t, id: b.dataset.id, sec: b.dataset.sec }, 2000)) return;
      if (t === 'goto' || t === 'round' || t === 'section') {
        const card = $('st-card');
        if (card && window.innerWidth < 900) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
    const refreshBtn = $('st-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', () => refresh(true));
    // Coming back from a lesson / practice tab (or the same tab via its back button) re-reads the activity.
    const onReturn = () => { if (document.visibilityState === 'visible' && screen.classList.contains('active')) refresh(false); };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushOnHide(); else onReturn(); });
    window.addEventListener('focus', onReturn);
    window.addEventListener('pageshow', onReturn);
    window.addEventListener('pagehide', flushOnHide);
    window.addEventListener('online', () => { if (sync.dirty) scheduleSave(200); onReturn(); });
  }

  /** Re-read the student's activity (throttled unless forced). */
  function refresh(force) {
    if (!sync.loaded) return;
    if (!force && Date.now() - lastRefresh < 2500) return;
    lastRefresh = Date.now();
    load();
  }

  /** Evaluation step: open the in-app quiz list at this skill's section and level. */
  async function openQuiz(level) {
    const section = SOURCES[state.ui.skill].section;
    try {
      if (typeof App === 'undefined') return;
      await App.openQuizHub();
      App.openQuizLevels(section);
      App.openQuizSkills(section, level);
    } catch (e) {
      if (typeof showToast === 'function') showToast('تعذّر فتح الاختبار — حاول مرة أخرى');
    }
  }

  /** Entry point: App.openSelfTraining() / deep link /self-training. */
  async function open() {
    const st = appState();
    const student = st && st.student;
    if (!student) return false;
    wire();
    if (sync.studentId !== student.id) {
      // a different student on this device — never show someone else's cache
      sync.studentId = student.id; sync.rev = 0; sync.pending = []; sync.dirty = false; sync.loaded = false;
      const cached = readCache();
      activity = cached && cached.activity && typeof cached.activity === 'object' ? cached.activity : {};
      state = withActivity(cached ? { ui: cached.ui } : null);
      if (cached) {
        sync.rev = Number(cached.rev) || 0;
        sync.pending = Array.isArray(cached.pending) ? cached.pending.filter((op) => op && ['round', 'section', 'skill', 'goto'].includes(op.type)) : [];
        sync.dirty = sync.pending.length > 0;
      }
    }
    render();
    if (typeof show === 'function') show('screen-self-training');
    await load();
    return true;
  }

  root.SelfTraining = { open, render, flush, core, _state: () => state, _sync: () => sync };
})(typeof window !== 'undefined' ? window : globalThis);
