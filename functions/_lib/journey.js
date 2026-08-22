// Journey Engine — pure computation over data already fetched from Postgres.
// Kept separate from functions/api/[[route]].js so the state-machine /
// aggregation logic is unit-testable without spinning up the full
// request/response plumbing (same rationale as test-management.js).
//
// Nothing here talks to the DB — callers in functions/api/[[route]].js fetch
// rows, then hand them to these functions to turn into the shapes the
// student ("مسار الإنجاز") and admin (student profile / dashboard) UIs render.

export const DEFAULT_QUIZ_PASS_RATIO = 0.8; // == correct >= 4 when total === 5, the pre-existing hardcoded rule

// Clamp/validate a stored setting value; falls back to the documented default
// for anything missing, non-numeric, or outside a sane passing range.
export function resolveQuizPassRatio(rawSetting) {
  const n = Number(rawSetting);
  if (!Number.isFinite(n) || n < 0.5 || n > 1) return DEFAULT_QUIZ_PASS_RATIO;
  return n;
}

// Server-side pass/fail decision for a quiz-skill attempt. `ratio` defaults
// to the original hardcoded behavior (>=4 correct out of 5).
export function computeQuizPass(correct, total, ratio = DEFAULT_QUIZ_PASS_RATIO) {
  if (!total || total <= 0) return { pass: false, needed: 0 };
  const needed = Math.max(1, Math.ceil(total * ratio));
  return { pass: correct >= needed, needed };
}

export function daysSince(iso) {
  return iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : Infinity;
}

// Identical formula to the pre-existing GET /api/analytics/health inline
// scoring (30% activity + 40% performance + 30% improvement) — extracted so
// the single-student journey view and the school-wide admin aggregate can
// never drift apart.
export function computeHealthScore({ lastActive, lastScore, improvementPct }) {
  const d = daysSince(lastActive);
  const activityScore = d === Infinity ? 0 : d <= 1 ? 100 : d <= 3 ? 70 : d <= 7 ? 40 : 10;
  const performanceScore = lastScore ?? 0;
  const improvementScore =
    improvementPct === null || improvementPct === undefined ? 50 : Math.max(0, Math.min(100, 50 + improvementPct));
  const healthScore = Math.round(activityScore * 0.3 + performanceScore * 0.4 + improvementScore * 0.3);
  return { healthScore, activityScore, performanceScore, improvementScore };
}

// Turns a single student's `plans` rows (ascending by created_at, `gaps` a raw
// JSON string as stored) into a { firstScore, lastScore, improvementPct,
// lastAttemptAt } summary — the same "average pct across that attempt's
// skills, oldest vs newest" logic the admin analytics bulk loader
// (_loadStudentActivityAndScores in functions/api/[[route]].js) applies per
// student, factored out so a single-student lookup doesn't hand-roll it again.
export function summarizePlanAttempts(planRows) {
  const scored = [];
  for (const row of planRows || []) {
    let gaps = [];
    try { gaps = JSON.parse(row.gaps || '[]'); } catch {}
    const nums = gaps.map((g) => g.pct).filter((n) => typeof n === 'number');
    if (!nums.length) continue;
    scored.push({ pct: Math.round(nums.reduce((a, b) => a + b, 0) / nums.length), created_at: row.created_at });
  }
  const firstScore = scored.length ? scored[0].pct : null;
  const lastScore = scored.length ? scored[scored.length - 1].pct : null;
  const improvementPct = firstScore !== null && lastScore !== null ? lastScore - firstScore : null;
  const lastAttemptAt = scored.length ? scored[scored.length - 1].created_at : null;
  return { firstScore, lastScore, improvementPct, lastAttemptAt, attempts: scored.length };
}

export const LEVEL_ORDER = ['easy', 'medium', 'advanced'];
export const LEVEL_LABEL_AR = { easy: 'سهل', medium: 'متوسط', advanced: 'متقدم' };
export const LEVEL_ORDINAL_AR = { easy: 'الأول', medium: 'الثاني', advanced: 'الثالث' };
export const SECTION_LABEL_AR = { verbal: 'اللفظي', quantitative: 'الكمي' };

// Rebuilds the { verbal:[...], quantitative:[...] } tree shape shared by
// GET /api/quiz-structure and GET /api/journey — one source for the
// section→level→skill hierarchy + level-lock logic so both endpoints agree
// by construction instead of two hand-maintained copies of the same rule.
export function buildQuizTree({ skills, progressRows, qCountMap }) {
  const qCounts = qCountMap || {};
  const progressMap = Object.fromEntries((progressRows || []).map((r) => [r.quiz_skill_id, r]));
  const bySectionLevel = {};
  for (const s of skills || []) {
    const key = `${s.section}|${s.level}`;
    (bySectionLevel[key] ||= []).push(s);
  }
  const levelPassed = (section, level) => {
    const list = bySectionLevel[`${section}|${level}`] || [];
    return list.length > 0 && list.every((s) => progressMap[s.id]?.status === 'passed');
  };

  const tree = { verbal: [], quantitative: [] };
  for (const section of ['verbal', 'quantitative']) {
    for (const level of LEVEL_ORDER) {
      const levelIdx = LEVEL_ORDER.indexOf(level);
      const locked = levelIdx > 0 && !levelPassed(section, LEVEL_ORDER[levelIdx - 1]);
      const skillList = (bySectionLevel[`${section}|${level}`] || []).map((s) => {
        const p = progressMap[s.id];
        return {
          quizSkillId: s.id,
          skillId: s.skill_id,
          skillName: s.skill_name,
          status: p?.status || 'not_started',
          bestCorrect: p?.best_correct || 0,
          bestTotal: p?.best_total || 5,
          attempts: p?.attempts || 0,
          hasQuestions: (qCounts[s.id] || 0) > 0,
        };
      });
      const passedCount = skillList.filter((s) => s.status === 'passed').length;
      tree[section].push({
        level,
        locked,
        progressPct: skillList.length ? Math.round((passedCount / skillList.length) * 100) : 0,
        skills: skillList,
      });
    }
  }
  return tree;
}

function flattenNodes(tree) {
  const nodes = [];
  for (const section of ['verbal', 'quantitative']) {
    for (const lvl of tree[section] || []) {
      for (const sk of lvl.skills) nodes.push({ ...sk, section, level: lvl.level, levelLocked: lvl.locked });
    }
  }
  return nodes;
}

// The full "مسار الإنجاز" state for one student — stage, next best action,
// weighted-by-structure progress (Progress != Score, see below), strongest/
// weakest skill, and the list of skills that genuinely need review.
//
// `plan` — the student's latest diagnostic plan row with `gaps` already
//   JSON.parse()'d by the caller (or null if never taken).
// `finalMock` — { available, attempted, passed, best, title } describing the
//   test_num=1 general-test capstone, or null if that slot isn't configured.
// `health` — output of computeHealthScore(), or null if not computable.
export function computeJourney({ tree, plan, finalMock, health }) {
  const nodes = flattenNodes(tree);
  const totalNodes = nodes.length;
  const passedNodes = nodes.filter((n) => n.status === 'passed').length;
  // Progress is a count of completed structural units (skills passed), not
  // an average score — deliberately, so a student who passes 4/5 skills at
  // 80% each doesn't get an inflated "90% progress" from raw score averaging.
  const overallProgressPct = totalNodes ? Math.round((passedNodes / totalNodes) * 100) : 0;

  const sections = {};
  for (const section of ['verbal', 'quantitative']) {
    const secNodes = nodes.filter((n) => n.section === section);
    const secPassed = secNodes.filter((n) => n.status === 'passed').length;
    sections[section] = {
      passed: secPassed,
      total: secNodes.length,
      progressPct: secNodes.length ? Math.round((secPassed / secNodes.length) * 100) : 0,
    };
  }

  const diagnosticDone = !!plan;
  let stage = 'diagnostic';
  let stageLabel = 'التشخيص الذاتي';
  if (diagnosticDone) {
    stage = 'complete';
    stageLabel = 'اكتمل المسار — جاهز لاختبار القدرات';
    findStage: for (const level of LEVEL_ORDER) {
      for (const section of ['verbal', 'quantitative']) {
        const lvl = (tree[section] || []).find((l) => l.level === level);
        if (lvl && lvl.progressPct < 100) {
          stage = level;
          stageLabel = `المستوى ${LEVEL_ORDINAL_AR[level]} — ${LEVEL_LABEL_AR[level]}`;
          break findStage;
        }
      }
    }
  }

  // Only unlocked, actually-attempted-and-failed skills count as "needs
  // review" — a skill inside a still-locked level isn't a remedial target,
  // it's simply not reachable yet.
  const needsReview = nodes
    .filter((n) => n.status === 'failed' && !n.levelLocked)
    .map((n) => ({
      quizSkillId: n.quizSkillId,
      skillId: n.skillId,
      skillName: n.skillName,
      section: n.section,
      level: n.level,
      bestCorrect: n.bestCorrect,
      bestTotal: n.bestTotal,
      attempts: n.attempts,
    }))
    .sort((a, b) => a.bestCorrect / (a.bestTotal || 1) - b.bestCorrect / (b.bestTotal || 1));

  // Next best action — a single priority ladder, decided entirely server-side:
  // 1) no diagnostic yet  2) a failed-but-unlocked skill (weakest first)
  // 3) the next not-started unlocked skill  4) the final mock  5) done.
  let nextAction;
  if (!diagnosticDone) {
    nextAction = { type: 'diagnostic', label: 'ابدأ التشخيص الذاتي', detail: 'خطوتك الأولى لمعرفة نقاط قوتك وضعفك' };
  } else if (needsReview.length) {
    const worst = needsReview[0];
    nextAction = {
      type: 'retry_skill',
      label: `أعد محاولة مهارة ${worst.skillName}`,
      detail: `${worst.bestCorrect}/${worst.bestTotal} في آخر محاولة`,
      section: worst.section,
      level: worst.level,
      quizSkillId: worst.quizSkillId,
    };
  } else {
    const nextNotStarted = nodes.find((n) => !n.levelLocked && n.status === 'not_started');
    if (nextNotStarted) {
      nextAction = {
        type: 'start_skill',
        label: `ابدأ مهارة ${nextNotStarted.skillName}`,
        detail: `${SECTION_LABEL_AR[nextNotStarted.section]} — المستوى ${LEVEL_LABEL_AR[nextNotStarted.level]}`,
        section: nextNotStarted.section,
        level: nextNotStarted.level,
        quizSkillId: nextNotStarted.quizSkillId,
      };
    } else if (totalNodes > 0 && passedNodes === totalNodes) {
      if (finalMock && finalMock.available && !finalMock.attempted) {
        nextAction = { type: 'final_mock', label: 'جرّب اختبار المحاكاة الشامل', detail: finalMock.title || '' };
      } else {
        nextAction = { type: 'done', label: 'أنت جاهز لاختبار القدرات 🏆', detail: '' };
      }
    } else {
      nextAction = { type: 'none', label: 'لا توجد خطوة متاحة الآن', detail: '' };
    }
  }

  // Strongest/weakest — only among skills actually attempted, and only when
  // there are at least two to compare (one data point isn't a ranking).
  const attempted = nodes
    .filter((n) => n.attempts > 0 && n.bestTotal > 0)
    .map((n) => ({ ...n, pct: Math.round((n.bestCorrect / n.bestTotal) * 100) }));
  let strongest = null;
  let weakest = null;
  if (attempted.length >= 2) {
    const byPct = [...attempted].sort((a, b) => b.pct - a.pct);
    strongest = byPct[0];
    weakest = byPct[byPct.length - 1];
  }
  const toSkillSummary = (n) => n && { skillId: n.skillId, skillName: n.skillName, section: n.section, pct: n.pct };

  const badge = totalNodes > 0 && passedNodes === totalNodes ? { code: 'ready_for_qudrat', label: 'جاهز لاختبار القدرات' } : null;

  return {
    diagnostic: { done: diagnosticDone, gaps: diagnosticDone ? plan.gaps || [] : null },
    overallProgressPct,
    passedNodes,
    totalNodes,
    sections,
    stage,
    stageLabel,
    nextAction,
    needsReview,
    strongest: toSkillSummary(strongest),
    weakest: toSkillSummary(weakest),
    health: health || null,
    finalMock: finalMock || null,
    badge,
  };
}

// Admin "توزيع الطلاب حسب التقدم" bucketing — purely a function of the same
// overallProgressPct every student sees on their own journey, plus whether
// they've engaged with the system at all (so a brand-new account isn't
// mislabeled "متعثر"). Thresholds are a documented first cut, not
// student-facing, and can be made configurable later if needed.
export function classifyProgress({ overallProgressPct, started }) {
  if (!started) return 'not_started';
  if (overallProgressPct === 0) return 'stalled';
  if (overallProgressPct >= 70) return 'advanced';
  if (overallProgressPct >= 35) return 'on_track';
  return 'needs_support';
}

export const PROGRESS_BUCKET_LABELS_AR = {
  advanced: 'متقدمون',
  on_track: 'في المسار',
  needs_support: 'يحتاجون دعمًا',
  stalled: 'متعثرون',
  not_started: 'لم يبدأوا',
};

export const PROGRESS_BUCKET_ORDER = ['advanced', 'on_track', 'needs_support', 'stalled', 'not_started'];
