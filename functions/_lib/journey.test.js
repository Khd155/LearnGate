import { describe, it, expect } from 'vitest';
import {
  DEFAULT_QUIZ_PASS_RATIO,
  resolveQuizPassRatio,
  computeQuizPass,
  daysSince,
  computeHealthScore,
  buildQuizTree,
  computeJourney,
  classifyProgress,
  summarizePlanAttempts,
} from './journey.js';

describe('summarizePlanAttempts', () => {
  it('returns nulls with zero attempts for an empty history', () => {
    const r = summarizePlanAttempts([]);
    expect(r).toEqual({ firstScore: null, lastScore: null, improvementPct: null, lastAttemptAt: null, attempts: 0 });
  });

  it('averages each attempt\'s gap pcts and compares oldest to newest', () => {
    const rows = [
      { gaps: JSON.stringify([{ pct: 40 }, { pct: 60 }]), created_at: '2026-01-01T00:00:00Z' }, // avg 50
      { gaps: JSON.stringify([{ pct: 70 }, { pct: 90 }]), created_at: '2026-02-01T00:00:00Z' }, // avg 80
    ];
    const r = summarizePlanAttempts(rows);
    expect(r.firstScore).toBe(50);
    expect(r.lastScore).toBe(80);
    expect(r.improvementPct).toBe(30);
    expect(r.attempts).toBe(2);
    expect(r.lastAttemptAt).toBe('2026-02-01T00:00:00Z');
  });

  it('skips attempts with unparseable or empty gaps', () => {
    const rows = [
      { gaps: 'not-json', created_at: '2026-01-01T00:00:00Z' },
      { gaps: '[]', created_at: '2026-01-02T00:00:00Z' },
      { gaps: JSON.stringify([{ pct: 55 }]), created_at: '2026-01-03T00:00:00Z' },
    ];
    const r = summarizePlanAttempts(rows);
    expect(r.attempts).toBe(1);
    expect(r.firstScore).toBe(55);
    expect(r.lastScore).toBe(55);
    expect(r.improvementPct).toBe(0);
  });
});

describe('resolveQuizPassRatio', () => {
  it('falls back to the default for missing/invalid/out-of-range values', () => {
    expect(resolveQuizPassRatio(undefined)).toBe(DEFAULT_QUIZ_PASS_RATIO);
    expect(resolveQuizPassRatio(null)).toBe(DEFAULT_QUIZ_PASS_RATIO);
    expect(resolveQuizPassRatio('not-a-number')).toBe(DEFAULT_QUIZ_PASS_RATIO);
    expect(resolveQuizPassRatio(0.1)).toBe(DEFAULT_QUIZ_PASS_RATIO);
    expect(resolveQuizPassRatio(1.5)).toBe(DEFAULT_QUIZ_PASS_RATIO);
  });

  it('accepts a valid ratio within [0.5, 1]', () => {
    expect(resolveQuizPassRatio('0.6')).toBe(0.6);
    expect(resolveQuizPassRatio(1)).toBe(1);
    expect(resolveQuizPassRatio(0.5)).toBe(0.5);
  });
});

describe('computeQuizPass — must preserve the pre-existing `correct >= 4 of 5` default exactly', () => {
  it('matches the old hardcoded rule at the default ratio', () => {
    expect(computeQuizPass(4, 5).pass).toBe(true);
    expect(computeQuizPass(3, 5).pass).toBe(false);
    expect(computeQuizPass(5, 5).pass).toBe(true);
    expect(computeQuizPass(4, 5).needed).toBe(4);
  });

  it('returns not-passing for a zero/undefined total', () => {
    expect(computeQuizPass(0, 0)).toEqual({ pass: false, needed: 0 });
  });

  it('scales the needed count with a custom ratio, never requiring less than 1 correct', () => {
    expect(computeQuizPass(1, 2, 0.6).needed).toBe(2); // ceil(1.2) = 2
    expect(computeQuizPass(0, 1, 0.5).needed).toBe(1); // max(1, ceil(0.5))
  });
});

describe('daysSince', () => {
  it('returns Infinity for a missing timestamp', () => {
    expect(daysSince(null)).toBe(Infinity);
    expect(daysSince(undefined)).toBe(Infinity);
  });

  it('computes whole days elapsed', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
    expect(daysSince(twoDaysAgo)).toBe(2);
  });
});

describe('computeHealthScore — must match the pre-existing analytics/health formula', () => {
  it('scores a fully-inactive, no-history student at the floor', () => {
    const r = computeHealthScore({ lastActive: null, lastScore: null, improvementPct: null });
    expect(r.activityScore).toBe(0);
    expect(r.performanceScore).toBe(0);
    expect(r.improvementScore).toBe(50); // neutral, no history yet
    expect(r.healthScore).toBe(Math.round(0 * 0.3 + 0 * 0.4 + 50 * 0.3));
  });

  it('scores an active, high-performing, improving student near the ceiling', () => {
    const today = new Date().toISOString();
    const r = computeHealthScore({ lastActive: today, lastScore: 90, improvementPct: 20 });
    expect(r.activityScore).toBe(100);
    expect(r.performanceScore).toBe(90);
    expect(r.improvementScore).toBe(70);
    expect(r.healthScore).toBe(Math.round(100 * 0.3 + 90 * 0.4 + 70 * 0.3));
  });

  it('clamps improvementScore into [0, 100]', () => {
    const r = computeHealthScore({ lastActive: null, lastScore: 0, improvementPct: -80 });
    expect(r.improvementScore).toBe(0);
  });
});

function makeSkills() {
  const skills = [];
  const SKILLS = { verbal: ['v1', 'v2', 'v3', 'v4', 'v5'], quantitative: ['q1', 'q2', 'q3', 'q4', 'q5'] };
  for (const [section, ids] of Object.entries(SKILLS)) {
    for (const level of ['easy', 'medium', 'advanced']) {
      for (const skillId of ids) skills.push({ id: `${section}-${level}-${skillId}`, section, level, skill_id: skillId, skill_name: skillId.toUpperCase() });
    }
  }
  return skills;
}

describe('buildQuizTree', () => {
  it('marks medium/advanced locked when the prior level is not fully passed', () => {
    const skills = makeSkills();
    const tree = buildQuizTree({ skills, progressRows: [], qCountMap: {} });
    expect(tree.verbal.find((l) => l.level === 'easy').locked).toBe(false);
    expect(tree.verbal.find((l) => l.level === 'medium').locked).toBe(true);
    expect(tree.verbal.find((l) => l.level === 'advanced').locked).toBe(true);
  });

  it('unlocks the next level only once every skill in the current level is passed', () => {
    const skills = makeSkills();
    const easyVerbalIds = skills.filter((s) => s.section === 'verbal' && s.level === 'easy').map((s) => s.id);
    const progressRows = easyVerbalIds.map((id) => ({ quiz_skill_id: id, status: 'passed', best_correct: 4, best_total: 5, attempts: 1 }));
    const tree = buildQuizTree({ skills, progressRows, qCountMap: {} });
    expect(tree.verbal.find((l) => l.level === 'medium').locked).toBe(false);
    expect(tree.quantitative.find((l) => l.level === 'medium').locked).toBe(true); // sections are independent tracks
  });

  it('reports 0% progress and not_started status with no progress rows', () => {
    const tree = buildQuizTree({ skills: makeSkills(), progressRows: [], qCountMap: {} });
    const easy = tree.verbal.find((l) => l.level === 'easy');
    expect(easy.progressPct).toBe(0);
    expect(easy.skills.every((s) => s.status === 'not_started')).toBe(true);
  });
});

describe('computeJourney', () => {
  const emptyTree = { verbal: [], quantitative: [] };

  it('starts at the diagnostic stage when no plan exists yet', () => {
    const j = computeJourney({ tree: emptyTree, plan: null, finalMock: null, health: null });
    expect(j.diagnostic.done).toBe(false);
    expect(j.stage).toBe('diagnostic');
    expect(j.nextAction.type).toBe('diagnostic');
    expect(j.overallProgressPct).toBe(0);
    expect(j.badge).toBeNull();
  });

  it('computes progress as passed/total nodes, not a score average', () => {
    const skills = makeSkills();
    // Pass exactly the 5 verbal-easy skills (out of 30 total nodes).
    const easyVerbalIds = skills.filter((s) => s.section === 'verbal' && s.level === 'easy').map((s) => s.id);
    const progressRows = easyVerbalIds.map((id) => ({ quiz_skill_id: id, status: 'passed', best_correct: 5, best_total: 5, attempts: 1 }));
    const tree = buildQuizTree({ skills, progressRows, qCountMap: {} });
    const j = computeJourney({ tree, plan: { gaps: [] }, finalMock: null, health: null });
    expect(j.totalNodes).toBe(30);
    expect(j.passedNodes).toBe(5);
    expect(j.overallProgressPct).toBe(Math.round((5 / 30) * 100));
    expect(j.sections.verbal.progressPct).toBe(Math.round((5 / 15) * 100));
    expect(j.sections.quantitative.progressPct).toBe(0);
  });

  it('recommends retrying the weakest failed-but-unlocked skill before starting new ones', () => {
    const skills = makeSkills();
    const progressRows = [
      { quiz_skill_id: 'verbal-easy-v1', status: 'failed', best_correct: 1, best_total: 5, attempts: 2 },
      { quiz_skill_id: 'verbal-easy-v2', status: 'failed', best_correct: 3, best_total: 5, attempts: 1 },
    ];
    const tree = buildQuizTree({ skills, progressRows, qCountMap: {} });
    const j = computeJourney({ tree, plan: { gaps: [] }, finalMock: null, health: null });
    expect(j.nextAction.type).toBe('retry_skill');
    expect(j.nextAction.quizSkillId).toBe('verbal-easy-v1'); // 1/5 is worse than 3/5
    expect(j.needsReview).toHaveLength(2);
  });

  it('never flags a skill inside a still-locked level as needing review', () => {
    const skills = makeSkills();
    // A "failed" row on a medium-level skill while easy isn't fully passed yet
    // shouldn't happen via the real submit flow (it's gated), but the engine
    // must not surface it as an actionable review item regardless.
    const progressRows = [{ quiz_skill_id: 'verbal-medium-v1', status: 'failed', best_correct: 1, best_total: 5, attempts: 1 }];
    const tree = buildQuizTree({ skills, progressRows, qCountMap: {} });
    const j = computeJourney({ tree, plan: { gaps: [] }, finalMock: null, health: null });
    expect(j.needsReview).toHaveLength(0);
  });

  it('suggests the final mock once every skill node is passed and it has not been attempted', () => {
    const skills = makeSkills();
    const progressRows = skills.map((s) => ({ quiz_skill_id: s.id, status: 'passed', best_correct: 5, best_total: 5, attempts: 1 }));
    const tree = buildQuizTree({ skills, progressRows, qCountMap: {} });
    const j = computeJourney({ tree, plan: { gaps: [] }, finalMock: { available: true, attempted: false, title: 'محاكاة' }, health: null });
    expect(j.overallProgressPct).toBe(100);
    expect(j.badge).toEqual({ code: 'ready_for_qudrat', label: 'جاهز لاختبار القدرات' });
    expect(j.nextAction.type).toBe('final_mock');
  });

  it('reports done once everything, including the final mock, is finished', () => {
    const skills = makeSkills();
    const progressRows = skills.map((s) => ({ quiz_skill_id: s.id, status: 'passed', best_correct: 5, best_total: 5, attempts: 1 }));
    const tree = buildQuizTree({ skills, progressRows, qCountMap: {} });
    const j = computeJourney({ tree, plan: { gaps: [] }, finalMock: { available: true, attempted: true }, health: null });
    expect(j.nextAction.type).toBe('done');
  });

  it('reports a strongest skill from a single genuine pass — no "at least two" gate needed', () => {
    const skills = makeSkills();
    const oneAttempt = [{ quiz_skill_id: 'verbal-easy-v1', status: 'passed', best_correct: 5, best_total: 5, attempts: 1 }];
    const tree = buildQuizTree({ skills, progressRows: oneAttempt, qCountMap: {} });
    const j = computeJourney({ tree, plan: { gaps: [] }, finalMock: null, health: null });
    expect(j.strongest.skillId).toBe('v1');
    expect(j.strongest.pct).toBe(100);
    expect(j.weakest).toBeNull(); // nothing failed yet — no "needs focus" to report
  });

  it('picks strongest from passes and weakest from fails — independent pools', () => {
    const skills = makeSkills();
    const rows = [
      { quiz_skill_id: 'verbal-easy-v1', status: 'passed', best_correct: 5, best_total: 5, attempts: 1 },
      { quiz_skill_id: 'quantitative-easy-q3', status: 'failed', best_correct: 1, best_total: 5, attempts: 1 },
    ];
    const tree = buildQuizTree({ skills, progressRows: rows, qCountMap: {} });
    const j = computeJourney({ tree, plan: { gaps: [] }, finalMock: null, health: null });
    expect(j.strongest.skillId).toBe('v1');
    expect(j.weakest.skillId).toBe('q3');
  });

  // Regression test for the reported bug: two different 100%-scoring skills
  // (both passed, nothing failed) must never produce a "needs focus" card —
  // the old "lowest of the attempted set" logic showed the second 100% skill
  // as "weakest" purely because it was second in a sorted list of two passes.
  it('never reports a "needs focus" skill when nothing has actually been failed', () => {
    const skills = makeSkills();
    const rows = [
      { quiz_skill_id: 'verbal-easy-v1', status: 'passed', best_correct: 5, best_total: 5, attempts: 1 },
      { quiz_skill_id: 'verbal-easy-v5', status: 'passed', best_correct: 5, best_total: 5, attempts: 1 },
    ];
    const tree = buildQuizTree({ skills, progressRows: rows, qCountMap: {} });
    const j = computeJourney({ tree, plan: { gaps: [] }, finalMock: null, health: null });
    expect(j.weakest).toBeNull();
    expect(j.strongest.pct).toBe(100);
  });

  it('picks the worst-scoring failed skill as weakest when several are failed', () => {
    const skills = makeSkills();
    const rows = [
      { quiz_skill_id: 'verbal-easy-v1', status: 'failed', best_correct: 3, best_total: 5, attempts: 1 },
      { quiz_skill_id: 'verbal-easy-v2', status: 'failed', best_correct: 1, best_total: 5, attempts: 1 },
    ];
    const tree = buildQuizTree({ skills, progressRows: rows, qCountMap: {} });
    const j = computeJourney({ tree, plan: { gaps: [] }, finalMock: null, health: null });
    expect(j.weakest.skillId).toBe('v2');
    expect(j.weakest.pct).toBe(20);
  });
});

describe('classifyProgress', () => {
  it('labels a never-touched account as not_started, not stalled', () => {
    expect(classifyProgress({ overallProgressPct: 0, started: false })).toBe('not_started');
  });

  it('labels an engaged-but-stuck-at-zero student as stalled', () => {
    expect(classifyProgress({ overallProgressPct: 0, started: true })).toBe('stalled');
  });

  it('buckets by progress thresholds once started', () => {
    expect(classifyProgress({ overallProgressPct: 10, started: true })).toBe('needs_support');
    expect(classifyProgress({ overallProgressPct: 50, started: true })).toBe('on_track');
    expect(classifyProgress({ overallProgressPct: 90, started: true })).toBe('advanced');
  });
});
