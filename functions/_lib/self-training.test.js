import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeSelfTraining, SELF_TRAINING_PLAN, summarizeSelfTraining, buildSelfTrainingActivity, SELF_TRAINING_SOURCES } from './self-training.js';

// Load the browser module (public/khaldiya/js/self-training.js) into a sandbox: its `core`
// is pure, so the card's real unlocking/percentage logic is tested here without a DOM.
const here = path.dirname(fileURLToPath(import.meta.url));
const clientSrc = fs.readFileSync(path.join(here, '../../public/khaldiya/js/self-training.js'), 'utf8');
const sandbox = {};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(clientSrc, sandbox);
const C = sandbox.SelfTraining.core;
const R1 = C.PLAN.rounds[0];
const VERBAL = C.PLAN.sections[0];
const done = (lv = { easy: 2, medium: 2, advanced: 2 }, intro = true) => ({ intro, clips: [1, 2, 3, 4, 5], models: [1, 2], levels: lv });

describe('plan parity', () => {
  it('the browser PLAN and the server PLAN are identical', () => {
    expect(JSON.parse(JSON.stringify(C.PLAN))).toEqual(SELF_TRAINING_PLAN);
  });
  it('the browser and server agree on where each skill activity comes from', () => {
    expect(JSON.parse(JSON.stringify(C.SOURCES))).toEqual(SELF_TRAINING_SOURCES);
    const all = C.PLAN.sections.flatMap((x) => x.skills.map((k) => k.id)).sort();
    expect(Object.keys(SELF_TRAINING_SOURCES).sort()).toEqual(all);
  });
});

describe('sanitizeSelfTraining (server)', () => {
  it('keeps a valid record as is', () => {
    const s = sanitizeSelfTraining({ ui: { round: 1, section: 'verbal', skill: 'completion' }, progress: { '1:analogy': { intro: true, clips: [3, 1, 2], models: [2], levels: { easy: 2, medium: 1, advanced: 0 } } } });
    expect(s.ui).toEqual({ round: 1, section: 'verbal', skill: 'completion', fast: [] });
    expect(s.progress['1:analogy']).toEqual({ intro: true, clips: [1, 2, 3], models: [2], levels: { easy: 2, medium: 1, advanced: 0 } });
  });
  it('drops unknown rounds, skills and malformed keys', () => {
    const s = sanitizeSelfTraining({ progress: { '9:analogy': { intro: true }, '1:hacker': { intro: true }, 'x': {}, '__proto__': { intro: true }, '1:analogy;drop': { intro: true } } });
    expect(Object.keys(s.progress)).toEqual([]);
  });
  it('keeps clip/model numbers only inside that round\'s range, unique and sorted', () => {
    const s = sanitizeSelfTraining({ progress: { '2:algebra': { clips: [8, 8, 14, 7, 15, '9', 9.5, -1, 'x'], models: [4, 5, 7, 8] } } });
    expect(s.progress['2:algebra'].clips).toEqual([8, 9, 14]);
    expect(s.progress['2:algebra'].models).toEqual([5, 7]);
  });
  it('rounds without an intro never store one; intro only accepts booleans', () => {
    expect(sanitizeSelfTraining({ progress: { '2:odd': { intro: true, clips: [8] } } }).progress['2:odd'].intro).toBe(null);
    expect(sanitizeSelfTraining({ progress: { '1:odd': { intro: 'yes', clips: [1] } } }).progress['1:odd'].intro).toBe(null);
    expect(sanitizeSelfTraining({ progress: { '1:odd': { intro: false } } }).progress['1:odd'].intro).toBe(false);
  });
  it('a later level can never be ahead of an earlier one; bad values become 0', () => {
    const s = sanitizeSelfTraining({ progress: { '1:reading': { clips: [1], levels: { easy: 1, medium: 2, advanced: 2 } } } });
    expect(s.progress['1:reading'].levels).toEqual({ easy: 1, medium: 0, advanced: 0 });
    const t = sanitizeSelfTraining({ progress: { '1:reading': { clips: [1], levels: { easy: 7, medium: 'x', advanced: null } } } });
    expect(t.progress['1:reading'].levels).toEqual({ easy: 0, medium: 0, advanced: 0 });
  });
  it('drops empty records and repairs a bad ui', () => {
    const s = sanitizeSelfTraining({ ui: { round: 7, section: 'x', skill: 'geometry' }, progress: { '1:analogy': { intro: null, clips: [], models: [] } } });
    expect(s.progress).toEqual({});
    expect(s.ui).toEqual({ round: 1, section: 'verbal', skill: 'analogy', fast: [] });
    expect(sanitizeSelfTraining({ ui: { section: 'quant', skill: 'analogy' } }).ui.skill).toBe('arithmetic');
  });
  it('keeps only known fast-track keys, unique and sorted', () => {
    const s = sanitizeSelfTraining({ ui: { fast: ['1:geometry', '1:analogy', '1:analogy', '01:odd', '9:analogy', '1:hacker', '1:analogy;x', 5, null, { a: 1 }] } });
    expect(s.ui.fast).toEqual(['1:analogy', '1:geometry', '1:odd']);
    expect(sanitizeSelfTraining({ ui: { fast: 'x' } }).ui.fast).toEqual([]);
  });
  it('never throws on garbage input', () => {
    for (const bad of [null, undefined, 1, 'x', [], { progress: 5 }, { progress: [] }, { ui: 'x' }]) expect(() => sanitizeSelfTraining(bad)).not.toThrow();
  });
  it('summarizes', () => {
    expect(summarizeSelfTraining({ progress: { '1:a': {}, '2:b': {}, '1:c': {} } })).toEqual({ records: 3, rounds: [1, 2] });
  });
});

describe('card logic (browser core, same as the approved prototype)', () => {
  it('a skill is complete after intro + 5 clips + 2 models + easy level', () => {
    const p = { '1:analogy': { intro: true, clips: [1, 2, 3, 4, 5], models: [1, 2], levels: { easy: 2, medium: 0, advanced: 0 } } };
    expect(C.skillComplete(p, R1, 'analogy')).toBe(true);
    expect(C.skillFullyEvaluated(p, R1, 'analogy')).toBe(false);
    p['1:analogy'].clips.pop();
    expect(C.skillComplete(p, R1, 'analogy')).toBe(false);
  });

  it('flexible access: every skill of both sections is open from the start', () => {
    const p = {};
    C.PLAN.sections.forEach((sec, si) => {
      expect(C.sectionUnlocked(p, R1, si)).toBe(true);
      sec.skills.forEach((k, ki) => expect(C.skillUnlocked(p, R1, sec, ki)).toBe(true));
    });
    expect(C.skillUnlocked(p, R1, VERBAL, 99)).toBe(false);
  });

  it('the suggested path still points at the first unfinished skill', () => {
    const p = { '1:analogy': done({ easy: 2, medium: 0, advanced: 0 }) };
    expect(C.nextAction(p, R1)).toMatchObject({ sec: 'verbal', skill: 'completion' });
  });

  it('round 2 opens only after both sections of round 1 are complete', () => {
    const p = {};
    C.PLAN.sections.forEach((s) => s.skills.forEach((k) => { p['1:' + k.id] = done(); }));
    expect(C.roundUnlocked(p, 1)).toBe(true);
    expect(C.roundPct(p, R1)).toBe(100);
    delete p['1:comparison'];
    expect(C.roundUnlocked(p, 1)).toBe(false);
  });

  it('skill percentage counts a started level as 0.4 and caps extra clips', () => {
    // intro 1 + clips 5 + models 2 + 3 levels = 11 units
    const p = { '1:analogy': { intro: true, clips: [1, 2, 3, 4, 5, 6, 7], models: [1], levels: { easy: 1, medium: 0, advanced: 0 } } };
    expect(C.skillPct(p, R1, 'analogy')).toBe(Math.round((1 + 5 + 1 + 0.4) / 11 * 100));
  });

  it('nextAction points at the first unfinished step, then at the remaining levels', () => {
    expect(C.nextAction({}, R1)).toMatchObject({ sec: 'verbal', skill: 'analogy' });
    expect(C.nextAction({}, R1).text).toContain('المقطع التأسيسي');
    const p = {};
    VERBAL.skills.forEach((k) => { p['1:' + k.id] = done({ easy: 2, medium: 0, advanced: 0 }); });
    const nx = C.nextAction(p, R1);
    expect(nx).toMatchObject({ sec: 'verbal', skill: 'analogy' });
    expect(nx.text).toContain('المتوسط');
  });

  it('applyAction: toggles clips in range only, and stepping a level back resets later ones', () => {
    const s = C.emptyState();
    expect(C.applyAction(s, { type: 'clip', n: '3' })).toBe(true);
    expect(C.applyAction(s, { type: 'clip', n: '1' })).toBe(true);
    expect(s.progress['1:analogy'].clips).toEqual([1, 3]);
    expect(C.applyAction(s, { type: 'clip', n: '3' })).toBe(true);
    expect(s.progress['1:analogy'].clips).toEqual([1]);
    expect(C.applyAction(s, { type: 'clip', n: '99' })).toBe(false);
    expect(C.applyAction(s, { type: 'level', id: 'medium', value: '2' })).toBe(false); // locked behind easy
    C.applyAction(s, { type: 'level', id: 'easy', value: '2' });
    C.applyAction(s, { type: 'level', id: 'medium', value: '2' });
    C.applyAction(s, { type: 'level', id: 'advanced', value: '1' });
    C.applyAction(s, { type: 'level', id: 'easy', value: '1' });
    expect(s.progress['1:analogy'].levels).toEqual({ easy: 1, medium: 0, advanced: 0 });
  });

  it('explicit on/off ops are idempotent, so replaying them after a conflict never flips a value back', () => {
    // another device already recorded clip 3; this device's queued "clip 3 on" + "clip 4 on" replayed on top
    const server = C.normalize({ progress: { '1:analogy': { clips: [3] } } });
    expect(C.applyAction(server, { type: 'clip', n: '3', on: true })).toBe(false); // already there: no change
    expect(C.applyAction(server, { type: 'clip', n: '4', on: true })).toBe(true);
    expect(server.progress['1:analogy'].clips).toEqual([3, 4]);
    expect(C.applyAction(server, { type: 'clip', n: '4', on: false })).toBe(true);
    expect(C.applyAction(server, { type: 'clip', n: '4', on: false })).toBe(false);
    expect(server.progress['1:analogy'].clips).toEqual([3]);
  });

  it('a reset op clears progress and position', () => {
    const s = C.normalize({ ui: { skill: 'analogy' }, progress: { '1:analogy': { intro: true, clips: [1] } } });
    expect(C.applyAction(s, { type: 'reset' })).toBe(true);
    expect(s).toEqual(C.emptyState());
  });

  it('applyAction lets the student pick any skill or section, but rounds stay in order', () => {
    const s = C.emptyState();
    expect(C.applyAction(s, { type: 'skill', id: 'reading' })).toBe(true);
    expect(C.applyAction(s, { type: 'skill', id: 'geometry', sec: 'quant' })).toBe(true);
    expect(s.ui).toMatchObject({ section: 'quant', skill: 'geometry' });
    expect(C.applyAction(s, { type: 'section', id: 'verbal' })).toBe(true);
    expect(C.applyAction(s, { type: 'round', id: '2' })).toBe(false);
    expect(C.applyAction(s, { type: 'skill', id: 'nope' })).toBe(false);
  });

  it('normalize keeps any section/skill but moves off a locked round', () => {
    const n = C.normalize({ ui: { round: 3, section: 'quant', skill: 'geometry' }, progress: {} });
    expect(n.ui).toEqual({ round: 1, section: 'quant', skill: 'geometry', fast: [] });
  });
});

describe('fast track (external training)', () => {
  it('skipping marks the preparation steps as satisfied, never the evaluation', () => {
    const s = C.emptyState();
    expect(C.applyAction(s, { type: 'fast', key: '1:completion', on: true })).toBe(true);
    const r = C.peek(s.progress, 1, 'completion');
    expect(r.ext).toBe(true);
    expect(['intro', 'clips', 'models'].every((k) => C.stepDone(R1, r, k) && C.isSkipped(R1, r, k))).toBe(true);
    expect(C.stepDone(R1, r, 'eval')).toBe(false);
    expect(C.skillComplete(s.progress, R1, 'completion')).toBe(false);
    expect(C.nextAction(s.progress, R1).skill).toBe('analogy'); // the suggested path is unchanged
  });
  it('a fast-tracked skill completes with its evaluation levels, measured by them only', () => {
    const s = C.normalize({ ui: { fast: ['1:completion'] }, progress: { '1:completion': { levels: { easy: 2, medium: 1, advanced: 0 } } } });
    expect(C.skillComplete(s.progress, R1, 'completion')).toBe(true);
    expect(C.skillPct(s.progress, R1, 'completion')).toBe(Math.round((1 + 0.4) / 3 * 100));
    s.progress['1:completion'].levels = { easy: 2, medium: 2, advanced: 2 };
    expect(C.skillFullyEvaluated(s.progress, R1, 'completion')).toBe(true);
    expect(C.skillPct(s.progress, R1, 'completion')).toBe(100);
  });
  it('steps the student really did are shown as done, not skipped', () => {
    const s = C.normalize({ ui: { fast: ['1:analogy'] }, progress: { '1:analogy': { intro: true, clips: [1] } } });
    const r = C.peek(s.progress, 1, 'analogy');
    expect(C.isSkipped(R1, r, 'intro')).toBe(false);
    expect(C.isSkipped(R1, r, 'clips')).toBe(true);
  });
  it('the op is idempotent, can be undone, and rejects unknown keys', () => {
    const s = C.emptyState();
    expect(C.applyAction(s, { type: 'fast', key: '1:odd', on: true })).toBe(true);
    expect(C.applyAction(s, { type: 'fast', key: '1:odd', on: true })).toBe(false);
    expect(JSON.parse(JSON.stringify(s.ui.fast))).toEqual(['1:odd']);
    expect(C.applyAction(s, { type: 'fast', key: '1:odd', on: false })).toBe(true);
    expect(s.ui.fast.length).toBe(0);
    expect(C.peek(s.progress, 1, 'odd').ext).toBeUndefined();
    expect(C.applyAction(s, { type: 'fast', key: '9:odd', on: true })).toBe(false);
    expect(C.applyAction(s, { type: 'fast', key: '1:hacker', on: true })).toBe(false);
    expect(C.applyAction(s, { type: 'fast', key: '1:odd' })).toBe(false);
  });
  it('the client and server agree on the stored fast-track list', () => {
    const raw = { ui: { fast: ['1:geometry', '01:odd', 'x', '1:geometry', '3:reading'] } };
    expect(JSON.parse(JSON.stringify(C.normalize(raw).ui.fast))).toEqual(sanitizeSelfTraining(raw).ui.fast);
  });
});


describe('automated progress (activity -> card)', () => {
  const clicks = [
    { skill_key: 'analogy', resource_type: 'video', resource_index: 0 },
    ...[1, 2, 3, 4, 5, 9].map((n) => ({ skill_key: 'analogy', resource_type: 'video', resource_index: n })),
    { skill_key: 'analogy', resource_type: 'practice_form', resource_index: 1 },
    { skill_key: 'analogy', resource_type: 'practice_form', resource_index: 2 },
    { skill_key: 'analogy', resource_type: 'practice_form', resource_index: 0 },   // not a model
    { skill_key: 'inference', resource_type: 'video', resource_index: 3 },       // odd-word lesson folder
    { skill_key: 'nonsense', resource_type: 'video', resource_index: 1 },
    { skill_key: 'analogy', resource_type: 'video', resource_index: 'x' },
  ];
  const progressRows = [
    { quiz_skill_id: 'verbal-easy-v4', status: 'passed', attempts: 2 },
    { quiz_skill_id: 'verbal-medium-v4', status: 'failed', attempts: 1 },
    { quiz_skill_id: 'quantitative-easy-q5', status: 'passed', attempts: 1 },
  ];
  const act = buildSelfTrainingActivity({ clicks, progressRows });

  it('reads the foundational clip, training clips and practice models from the click log', () => {
    expect(act.analogy).toMatchObject({ introSeen: true, clips: [1, 2, 3, 4, 5, 9], models: [1, 2] });
    expect(act.odd.clips).toEqual([3]);                 // inference folder -> odd skill
    expect(act.completion).toMatchObject({ introSeen: false, clips: [], models: [] });
  });
  it('reads the evaluation levels from the real quiz results', () => {
    expect(act.analogy.levels).toEqual({ easy: 2, medium: 1, advanced: 0 });
    expect(act.statistics.levels.easy).toBe(2);         // q5
    expect(act.comparison.levels.easy).toBe(0);         // q4 untouched
  });
  it('is empty-safe', () => {
    expect(buildSelfTrainingActivity().analogy).toEqual({ introSeen: false, clips: [], models: [], levels: { easy: 0, medium: 0, advanced: 0 } });
  });

  it('the card splits global clip numbers into each round and completes the skill without any manual input', () => {
    const p = C.progressFromActivity(JSON.parse(JSON.stringify(act)));
    expect(p['1:analogy']).toEqual({ intro: true, clips: [1, 2, 3, 4, 5], models: [1, 2], levels: { easy: 2, medium: 1, advanced: 0 } });
    expect(p['2:analogy'].clips).toEqual([9]);          // clip 9 belongs to round 2 (8-14)
    expect(p['2:analogy'].intro).toBe(null);            // round 2 has no foundational step
    expect(C.skillComplete(p, R1, 'analogy')).toBe(true);
    expect(C.skillUnlocked(p, R1, VERBAL, 1)).toBe(true);
    expect(C.skillComplete(p, R1, 'completion')).toBe(false);
  });
  it('ignores garbage activity', () => {
    expect(C.progressFromActivity(null)).toEqual({});
    expect(C.progressFromActivity({ analogy: { clips: ['a', 99, -1], levels: { easy: 7 } } })).toEqual({});
  });
});
