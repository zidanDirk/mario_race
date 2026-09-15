import assert from 'node:assert/strict';
import { ItemInventory } from '../src/items.ts';

const inventory = new ItemInventory();
let checks = 0;
const check = (name, run) => { inventory.reset(); run(); checks++; console.log(`✓ ${name}`); };

check('empty inventory cannot consume', () => {
  assert.equal(inventory.item, null);
  assert.equal(inventory.consume(), null);
  assert.equal(inventory.canCollect, true);
  assert.equal(inventory.rolling, false);
});
check('box starts visible roulette, unavailable until it settles exactly once', () => {
  assert.equal(inventory.acquire(6, () => 0), true);
  assert.equal(inventory.slots[0].pending, 'mushroom');
  assert.equal(inventory.item, null);
  assert.equal(inventory.consume(), null);
  assert.deepEqual(inventory.step(1.49), []);
  assert.equal(inventory.rolling, true);
  assert.deepEqual(inventory.step(.01), ['mushroom']);
  assert.equal(inventory.item, 'mushroom');
  assert.deepEqual(inventory.step(1), []);
});
check('two slots preserve both items and a third box cannot overwrite them', () => {
  inventory.acquire(6, () => 0);
  inventory.acquire(6, () => .99);
  const before = structuredClone(inventory.slots);
  assert.equal(inventory.acquire(1, () => { throw new Error('Full inventory must not roll'); }), false);
  assert.deepEqual(inventory.slots, before);
  assert.equal(inventory.canCollect, false);
  assert.deepEqual(inventory.step(1.5), ['mushroom', 'red-shell']);
  assert.equal(inventory.consume(), 'mushroom');
  assert.equal(inventory.item, 'red-shell');
  assert.equal(inventory.canCollect, true);
  assert.equal(inventory.consume(), 'red-shell');
  assert.equal(inventory.consume(), null);
});
check('backup moves forward with its own roulette progress intact', () => {
  inventory.acquire(6, () => 0);
  inventory.step(1);
  inventory.acquire(6, () => .99);
  inventory.step(.5);
  assert.equal(inventory.consume(), 'mushroom');
  assert.equal(inventory.item, null);
  assert.equal(inventory.slots[0].remaining, 1);
  assert.equal(inventory.consume(), null);
  assert.deepEqual(inventory.step(1), ['red-shell']);
});
check('hurry never instantly grants or fires an item, repeated presses do not restart time', () => {
  inventory.acquire(1, () => .2);
  inventory.hurry();
  assert.equal(inventory.item, null);
  assert.equal(inventory.consume(), null);
  inventory.step(.1);
  inventory.hurry();
  assert.ok(inventory.slots[0].remaining < .13);
  assert.deepEqual(inventory.step(.12), ['green-shell']);
});
check('pausing without step does not advance roulette; invalid dt is ignored', () => {
  inventory.acquire(1, () => .7);
  inventory.step(.3);
  const before = structuredClone(inventory.slots);
  inventory.step(0);
  inventory.step(-1);
  inventory.step(Infinity);
  assert.deepEqual(inventory.slots, before);
  assert.equal(inventory.consume(), null);
});
check('reset clears pending reveals without delayed callbacks contaminating next race', () => {
  inventory.acquire(6, () => 0);
  inventory.step(1.3);
  inventory.reset();
  assert.deepEqual(inventory.step(20), []);
  assert.equal(inventory.slots.length, 0);
  inventory.acquire(1, () => .7);
  assert.deepEqual(inventory.step(1.5), ['banana']);
});
check('test grant clears both previous slots and can clear inventory', () => {
  inventory.acquire(1, () => 0);
  inventory.acquire(1, () => 0);
  inventory.give('green-shell');
  assert.equal(inventory.slots.length, 1);
  assert.equal(inventory.item, 'green-shell');
  assert.equal(inventory.rolling, false);
  inventory.give(null);
  assert.equal(inventory.item, null);
  assert.equal(inventory.slots.length, 0);
});
check('trailing racers receive more catch-up items with deterministic sampling', () => {
  inventory.acquire(1, () => .2);
  assert.deepEqual(inventory.step(1.5), ['green-shell']);
  inventory.reset();
  inventory.acquire(6, () => .2);
  assert.deepEqual(inventory.step(1.5), ['mushroom']);
});
check('triple mushroom has three charges and preserves slot identity and reserve roulette', () => {
  inventory.give('triple-mushroom');
  const front = inventory.slots[0];
  inventory.acquire(6, () => .99);
  const reserve = inventory.slots[1];
  assert.equal(front.charges, 3);
  assert.equal(inventory.canCollect, false);
  for (const remaining of [2, 1]) {
    assert.equal(inventory.consume(), 'triple-mushroom');
    assert.equal(inventory.slots[0], front);
    assert.equal(front.charges, remaining);
    assert.equal(inventory.slots[1], reserve);
    assert.equal(inventory.canCollect, false);
  }
  assert.equal(inventory.consume(), 'triple-mushroom');
  assert.equal(inventory.slots[0], reserve);
  assert.equal(inventory.consume(), null);
  assert.equal(inventory.canCollect, true);
  assert.deepEqual(inventory.step(1.5), ['red-shell']);
  assert.equal(inventory.consume(), 'red-shell');
});
check('six item types all appear, trailing catch-up weight rises, and leaders rarely get triples', () => {
  const sample = rank => {
    const count = {};
    for (let i = 0; i < 1000; i++) {
      inventory.reset(); inventory.acquire(rank, () => (i + .5) / 1000);
      inventory.step(1.5); const item = inventory.item;
      assert.equal(inventory.slots[0].charges, item === 'triple-mushroom' ? 3 : 1);
      count[item] = (count[item] ?? 0) + 1;
    }
    return count;
  };
  const first = sample(1), last = sample(6);
  assert.equal(Object.keys(first).length, 6); assert.equal(Object.keys(last).length, 6);
  assert.equal(first['triple-mushroom'], 30); assert.equal(last['triple-mushroom'], 290);
  assert.ok(last.mushroom + last['triple-mushroom'] > first.mushroom + first['triple-mushroom']);
  inventory.give('super-horn'); assert.equal(inventory.consume(), 'super-horn'); assert.equal(inventory.consume(), null);
});
console.log(`Item inventory: ${checks} checks passed.`);
