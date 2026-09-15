import assert from 'node:assert/strict';
import { EliminationRace } from '../src/elimination.ts';

const roster = 'abcdef'.split('').map(id => ({ id, name: id.toUpperCase() }));
const race = (player = 'a') => new EliminationRace(roster, player);
const progress = (order = 'abcdef', offset = 0) => order.split('').map((id, i) => ({ id, progress: offset + 6 - i }));
let count = 0;
function check(name, run) { run(); count++; console.log(`✓ ${name}`); }

check('six unique named drivers and a valid player are required', () => {
  const sparse = [...roster]; delete sparse[5];
  for (const drivers of [[], roster.slice(1), [...roster.slice(1), roster[1]],
    sparse, roster.map((r, i) => i ? r : { ...r, name: '' }), roster.map((r, i) => i ? r : null)]) {
    assert.throws(() => new EliminationRace(drivers, 'a'));
  }
  assert.throws(() => new EliminationRace(roster, 'z'));
});
check('opening protection lasts thirty race-clock seconds; warning starts at 25', () => {
  const r = race();
  assert.equal(r.snapshot().remaining, 30);
  r.update(24.999, progress()); assert.equal(r.snapshot().warning, false);
  r.update(25, progress()); assert.equal(r.snapshot().warning, true);
  r.update(29.999, progress()); assert.equal(r.snapshot().eliminated.length, 0);
  assert.deepEqual(r.update(30, progress()), [{ id: 'f', at: 30, place: 6 }]);
  assert.equal(r.snapshot().remaining, 20);
  assert.equal(r.snapshot().warning, false);
});
check('repeated and backwards clocks cannot move order or eliminate during pause', () => {
  const r = race(); r.update(25, progress()); const before = r.snapshot();
  for (const time of [25, 24, 0, -1]) assert.deepEqual(r.update(time, progress('fedcba')), []);
  assert.deepEqual(r.snapshot(), before);
});
check('the most recent actual order decides each successive elimination', () => {
  const r = race(); r.update(29, progress('afbcde'));
  assert.equal(r.update(30, progress('aebcdf'))[0].id, 'f');
  assert.equal(r.update(50, progress('abced'))[0].id, 'd');
  assert.equal(r.update(70, progress('aebc'))[0].id, 'c');
  assert.equal(r.update(90, progress('aeb'))[0].id, 'b');
  assert.equal(r.update(110, progress('ae'))[0].id, 'e');
  assert.deepEqual(r.snapshot().eliminated.map(e => e.place), [6, 5, 4, 3, 2]);
  assert.equal(r.snapshot().winnerId, 'a');
  assert.equal(r.snapshot().playerPlace, 1);
  assert.equal(r.snapshot().complete, true);
});
check('cumulative progress stays correctly ordered across a lap boundary', () => {
  const r = race();
  r.update(29, roster.map((d, i) => ({ id: d.id, progress: [3.01, 2.99, 2.98, 2.5, 2.2, 1.999][i] })));
  assert.deepEqual(r.snapshot().order, ['a', 'b', 'c', 'd', 'e', 'f']);
  const events = r.update(30, roster.map((d, i) => ({ id: d.id, progress: [3.1, 3.02, 2.999, 2.6, 2.3, 2.001][i] })));
  assert.equal(events[0].id, 'f');
});
check('ties preserve the prior order, initially the roster order', () => {
  const r = race(); const ties = roster.map(d => ({ id: d.id, progress: 0 }));
  r.update(1, [...ties].reverse()); assert.deepEqual(r.snapshot().order, roster.map(d => d.id));
  r.update(2, progress('fcdeba'));
  r.update(3, ties); assert.deepEqual(r.snapshot().order, 'fcdeba'.split(''));
  assert.equal(r.update(30, ties)[0].id, 'a');
});
check('player elimination immediately ends the run and fixes survival time/place', () => {
  const r = race('f');
  assert.deepEqual(r.update(200, progress()), [{ id: 'f', at: 30, place: 6 }]);
  const end = r.snapshot();
  assert.equal(end.elapsed, 30); assert.equal(end.playerPlace, 6); assert.equal(end.winnerId, null);
  assert.equal(end.nextAt, null); assert.equal(end.remaining, 0); assert.equal(end.warning, false);
  assert.equal(r.isActive('f'), false); assert.equal(r.isActive('a'), true);
  assert.deepEqual(r.update(300, progress()), []); assert.deepEqual(r.snapshot(), end);
});
check('a second-place elimination identifies the other finalist as champion', () => {
  const r = race('b'); r.update(110, progress());
  assert.equal(r.snapshot().playerPlace, 2); assert.equal(r.snapshot().winnerId, 'a');
  assert.equal(r.snapshot().elapsed, 110);
});
check('large steps use the supplied order at each absolute deadline without duplicates', () => {
  const r = race(); const events = r.update(500, progress());
  assert.deepEqual(events.map(e => e.at), [30, 50, 70, 90, 110]);
  assert.equal(r.snapshot().elapsed, 110); assert.equal(r.snapshot().playerPlace, 1);
  assert.deepEqual(r.update(500, progress()), []);
});
check('invalid snapshots are rejected atomically and cannot consume a deadline', () => {
  const r = race(); r.update(29, progress()); const before = r.snapshot();
  const invalid = [null, [], progress().slice(1), [...progress().slice(1), progress()[1]],
    progress().map((p, i) => i ? p : { ...p, id: 'unknown' }),
    progress().map((p, i) => i ? p : { ...p, progress: NaN }),
    progress().map((p, i) => i ? p : { ...p, progress: Infinity }),
    progress().map((p, i) => i ? p : null)];
  for (const input of invalid) { assert.deepEqual(r.update(30, input), []); assert.deepEqual(r.snapshot(), before); }
  for (const t of [NaN, Infinity, -Infinity]) { r.update(t, progress()); assert.deepEqual(r.snapshot(), before); }
  assert.equal(r.update(30, progress()).length, 1);
});
check('active-only and full-roster updates work after eliminations, unknown IDs do not', () => {
  const r = race(); r.update(30, progress());
  r.update(31, progress('abcde')); assert.equal(r.snapshot().elapsed, 31);
  r.update(32, progress()); assert.equal(r.snapshot().elapsed, 32);
  const before = r.snapshot(); r.update(33, progress('abcdf')); assert.deepEqual(r.snapshot(), before);
});
check('negative grid progress is valid and input arrays are not mutated', () => {
  const r = race(); const input = progress('fedcba', -10); const saved = structuredClone(input);
  r.update(1, input); assert.deepEqual(input, saved); assert.deepEqual(r.snapshot().order, 'fedcba'.split(''));
});
check('snapshots, event arrays and constructor inputs cannot mutate internal state', () => {
  const source = structuredClone(roster); const r = new EliminationRace(source, 'a');
  source[0].id = 'changed'; source.reverse();
  const events = r.update(30, progress()); events[0].id = 'changed';
  const before = r.snapshot(); const external = r.snapshot();
  external.activeIds.length = 0; external.order.reverse(); external.eliminated[0].at = 0;
  external.eliminated.push({ id: 'a', at: 0, place: 1 });
  assert.deepEqual(r.snapshot(), before);
});
console.log(`${count} elimination rule checks passed.`);
