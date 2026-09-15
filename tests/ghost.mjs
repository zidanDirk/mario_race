import assert from 'node:assert/strict';
import { GhostRecorder, sampleGhost, loadGhost, saveGhost, DEFAULT_GHOST_KEY } from '../src/ghost.ts';

const checks = [];
function test(name, run) { run(); checks.push(name); }
const origin = { x: 0, y: .1, z: 0, heading: 0 };
function finish(recorder, durationMs = 30_025, pose = origin) {
  for (let i = 1; i <= 12; i++) recorder.split(durationMs * i / 12);
  return recorder.finish(durationMs, pose);
}
function validRun() { const recorder = new GhostRecorder('mario'); recorder.capture(0, origin); return finish(recorder); }
function load(value) { return loadGhost({ getItem: () => JSON.stringify(value) }, DEFAULT_GHOST_KEY); }

test('fixed 50 ms samples interpolate uneven simulation frames and preserve exact finish', () => {
  const recorder = new GhostRecorder('mario');
  recorder.capture(0, origin);
  recorder.capture(30, { ...origin, x: 3 });
  recorder.capture(60, { ...origin, x: 6 });
  recorder.capture(110, { ...origin, x: 11 });
  const run = finish(recorder, 30_025, { ...origin, x: 11 });
  assert(run);
  assert.deepEqual(run.frames[1], [50, 5, .1, 0, 0]);
  assert.deepEqual(run.frames[2], [100, 10, .1, 0, 0]);
  assert.deepEqual(run.frames.at(-1), [30_025, 11, .1, 0, 0]);
  assert.equal(run.frames.length, 602);
  assert.equal(sampleGhost(run, 75).x, 7.5);
  assert.equal(recorder.finish(30_025, origin), null, 'a recorder can only be finished once');
});

test('headings interpolate through the short arc across ±pi', () => {
  const recorder = new GhostRecorder('luigi');
  recorder.capture(0, { ...origin, heading: Math.PI - .1 });
  recorder.capture(50, { ...origin, heading: -Math.PI + .1 });
  const run = finish(recorder);
  assert(Math.abs(sampleGhost(run, 25).heading - Math.PI) < 1e-12);
});

test('a recovery cuts at the next pose without drawing a ghost through scenery', () => {
  const recorder = new GhostRecorder('peach');
  recorder.capture(0, origin);
  recorder.capture(50, { ...origin, x: 100 });
  const run = finish(recorder, 30_000, { ...origin, x: 100 });
  assert.equal(sampleGhost(run, 49).x, 0);
  assert.equal(sampleGhost(run, 50).x, 100);
});

test('ghost is visible at exact finish only and never loops or extrapolates', () => {
  const run = validRun();
  assert(sampleGhost(run, 0));
  assert(sampleGhost(run, run.durationMs));
  for (const time of [-1, run.durationMs + .001, NaN, Infinity]) assert.equal(sampleGhost(run, time), null);
});

test('recordings require all twelve ordered splits and a matching finish', () => {
  const incomplete = new GhostRecorder('mario'); incomplete.capture(0, origin);
  assert.equal(incomplete.finish(30_000, origin), null);
  const unordered = new GhostRecorder('mario'); unordered.capture(0, origin); unordered.split(5000); unordered.split(4000);
  assert.equal(unordered.finish(30_000, origin), null);
  const mismatched = new GhostRecorder('mario'); mismatched.capture(0, origin);
  for (let i = 1; i <= 12; i++) mismatched.split(i * 2500);
  assert.equal(mismatched.finish(31_000, origin), null);
});

test('recording rejects invalid data and backward time, and retains its own pose copy', () => {
  for (const pose of [{ ...origin, x: NaN }, { ...origin, heading: Infinity }, { ...origin, z: 10001 }]) {
    const recorder = new GhostRecorder('mario'); recorder.capture(0, pose); assert.equal(finish(recorder), null);
  }
  const reverse = new GhostRecorder('mario'); reverse.capture(100, origin); reverse.capture(90, origin); assert.equal(finish(reverse), null);
  const invalidCharacter = new GhostRecorder('browser-injected-character'); assert.equal(finish(invalidCharacter), null);
  const recorder = new GhostRecorder('toad'); const pose = { ...origin }; recorder.capture(0, pose); pose.x = 500;
  assert.equal(finish(recorder).frames[0][1], 0);
  assert.equal(finish(new GhostRecorder('mario'), 29_999), null);
  assert.equal(finish(new GhostRecorder('mario'), 1_800_001), null);
});

test('maximum thirty-minute recording is bounded and round trips through storage', () => {
  const run = finish(new GhostRecorder('wario'), 1_800_000);
  assert(run); assert.equal(run.frames.length, 36_001);
  let saved;
  assert.equal(saveGhost({ setItem: (key, value) => { assert.equal(key, DEFAULT_GHOST_KEY); saved = value; } }, DEFAULT_GHOST_KEY, run), true);
  assert(saved.length < 6 * 1024 * 1024);
  assert.deepEqual(loadGhost({ getItem: () => saved }, DEFAULT_GHOST_KEY), run);
});

test('storage rejects incompatible versions, malformed tuples, gaps, times and coordinates', () => {
  const mutations = [
    run => { run.version = 2; }, run => { run.rulesVersion = 1; }, run => { run.character = 'constructor'; },
    run => { run.durationMs = -1; }, run => { run.splits.pop(); }, run => { run.splits[1] = run.splits[0]; },
    run => { run.splits[11] -= .5; }, run => { run.frames[0][0] = 1; }, run => { run.frames[1][0] = 0; },
    run => { run.frames[1].push(2); }, run => { run.frames[1][1] = 10001; }, run => { run.frames[1][4] = '0'; },
    run => { run.frames.splice(1, 1); }, run => { run.frames.at(-1)[0] -= 1; },
    run => { run.frames = Array(36_003).fill([0, 0, 0, 0, 0]); },
  ];
  for (const mutate of mutations) { const run = validRun(); mutate(run); assert.equal(load(run), null); }
  for (const value of [null, [], {}, true, 'x']) assert.equal(load(value), null);
  assert.equal(loadGhost({ getItem: () => '{bad json' }, DEFAULT_GHOST_KEY), null);
  assert.equal(loadGhost({ getItem: () => ' '.repeat(6 * 1024 * 1024 + 1) }, DEFAULT_GHOST_KEY), null);
});

test('disabled storage and full quota never throw or erase a previous best', () => {
  const run = validRun();
  assert.equal(loadGhost({ getItem: () => { throw new Error('SecurityError'); } }, DEFAULT_GHOST_KEY), null);
  assert.equal(saveGhost({ setItem: () => { throw new Error('QuotaExceededError'); } }, DEFAULT_GHOST_KEY, run), false);
  let called = false;
  run.durationMs = 0;
  assert.equal(saveGhost({ setItem: () => { called = true; } }, DEFAULT_GHOST_KEY, run), false);
  assert.equal(called, false);
});
console.log(JSON.stringify({ passed: true, checks }, null, 2));
