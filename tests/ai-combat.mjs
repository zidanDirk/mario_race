import assert from 'node:assert/strict';
import { AiCombat, boxLane } from '../src/ai-combat.ts';

const racer = (id, t = 0, lane = 0) => ({ id, t, lane, speed: 30, stun: 0, immune: 0, finished: false });
const context = (time = 30, racers = [racer('ai'), racer('player', .04)], extra = {}) => ({
  time, racers, difficulty: 'standard', playerId: 'player', trackLength: 1000,
  playerProtected: false, playerRedThreat: false, ...extra,
});
let checks = 0;
function check(name, run) { run(); checks++; console.log(`✓ ${name}`); }
function armed(item, racers = [racer('ai'), racer('player', .04)], extra = {}) {
  const ai = new AiCombat(); ai.reset(racers.filter(r => r.id !== 'player').map(r => r.id));
  ai.inventory('ai').give(item); ai.plan(1 / 60, context(0, racers, extra));
  return ai;
}

check('actual collection uses two-slot roulette and waits for visible reveal and opening', () => {
  const ai = new AiCombat(); ai.reset(['ai']);
  assert.equal(ai.collect('ai', 6, () => 0, 0), true);
  assert.equal(ai.collect('ai', 6, () => .99, 0), true);
  assert.equal(ai.collect('ai', 6, () => { throw new Error('No roll for full inventory'); }, 0), false);
  assert.equal(ai.inventory('ai').item, null);
  assert.deepEqual(ai.plan(1.49, context(1.49)), []);
  assert.equal(ai.inventory('ai').rolling, true);
  assert.deepEqual(ai.plan(.01, context(1.5)), []);
  assert.equal(ai.inventory('ai').item, 'mushroom');
  assert.deepEqual(ai.plan(1 / 60, context(6.99)), []);
  assert.deepEqual(ai.plan(1 / 60, context(7)), [{ racerId: 'ai', item: 'mushroom', targetId: null, rear: false }]);
  assert.equal(ai.inventory('ai').item, 'red-shell');
  assert.deepEqual(ai.stats, { collected: 2, used: 1, playerAttacks: 0 });
});
check('red shell targets nearest forward kart including AI, without skipping close or immune racers', () => {
  const racers = [racer('ai'), racer('rival', .035), racer('player', .06)];
  const ai = armed('red-shell', racers);
  assert.equal(ai.plan(1 / 60, context(30, racers))[0].targetId, 'rival');
  racers[1].t = .02;
  assert.deepEqual(armed('red-shell', racers).plan(1 / 60, context(30, racers)), []);
  racers[1].t = .035; racers[1].immune = 1;
  assert.deepEqual(armed('red-shell', racers).plan(1 / 60, context(30, racers)), []);
});
check('green shell requires a near forward target in the same lane', () => {
  const racers = [racer('ai'), racer('player', .04, 4)]; const ai = armed('green-shell', racers);
  assert.deepEqual(ai.plan(1 / 60, context(30, racers)), []);
  racers[1].lane = 1.5;
  assert.equal(ai.plan(1 / 60, context(31, racers))[0].item, 'green-shell');
  racers[1].t = .06;
  assert.deepEqual(armed('green-shell', racers).plan(1 / 60, context(30, racers)), []);
});
check('banana requires a trailing target with safe minimum distance, not a kart touching the rear', () => {
  const racers = [racer('ai', .1), racer('player', .07)]; const ai = armed('banana', racers);
  assert.deepEqual(ai.plan(1 / 60, context(30, racers)), [{ racerId: 'ai', item: 'banana', targetId: 'player', rear: true }]);
  racers[1].t = .09;
  assert.deepEqual(armed('banana', racers).plan(1 / 60, context(30, racers)), []);
});
check('mushroom catches up but does not fire while stunned, stationary, or already leading', () => {
  const racers = [racer('ai'), racer('player', .04)]; const ai = armed('mushroom', racers);
  racers[0].stun = 1; assert.deepEqual(ai.plan(1 / 60, context(30, racers)), []);
  racers[0].stun = 0; racers[0].speed = 0; assert.deepEqual(ai.plan(1 / 60, context(31, racers)), []);
  racers[0].speed = 30; racers[0].t = .05; assert.deepEqual(ai.plan(1 / 60, context(32, racers)), []);
  racers[0].t = 0; assert.equal(ai.plan(1 / 60, context(33, racers))[0].item, 'mushroom');
});
check('player protection and an existing red threat hold the item without spending it', () => {
  const ai = armed('red-shell');
  assert.deepEqual(ai.plan(1 / 60, context(30, undefined, { playerProtected: true })), []);
  assert.deepEqual(ai.plan(1 / 60, context(31, undefined, { playerRedThreat: true })), []);
  assert.equal(ai.inventory('ai').item, 'red-shell');
  assert.equal(ai.plan(1 / 60, context(32))[0].targetId, 'player');
});
check('multiple AIs share the eight-second player attack interval across different items', () => {
  const racers = [racer('ai'), racer('ai2'), racer('player', .04)]; const ai = armed('red-shell', racers);
  ai.inventory('ai2').give('green-shell'); ai.plan(1 / 60, context(0, racers));
  const first = ai.plan(1 / 60, context(30, racers));
  assert.equal(first.length, 1); assert.equal(first[0].item, 'red-shell');
  assert.deepEqual(ai.plan(1 / 60, context(37.99, racers)), []);
  assert.equal(ai.plan(1 / 60, context(38, racers))[0].item, 'green-shell');
  assert.equal(ai.stats.playerAttacks, 2);
});
check('casual grants a longer opening and fourteen seconds between player attacks', () => {
  const racers = [racer('ai'), racer('ai2'), racer('player', .04)]; const options = { difficulty: 'casual' };
  const ai = armed('red-shell', racers, options); ai.inventory('ai2').give('green-shell');
  ai.plan(1 / 60, context(0, racers, options));
  assert.deepEqual(ai.plan(1 / 60, context(10.99, racers, options)), []);
  assert.equal(ai.plan(1 / 60, context(11, racers, options)).length, 1);
  assert.deepEqual(ai.plan(1 / 60, context(24.99, racers, options)), []);
  assert.equal(ai.plan(1 / 60, context(25, racers, options)).length, 1);
});
check('individual cooldown applies to non-player attacks and mushrooms', () => {
  for (const [difficulty, gap] of [['standard', 6], ['casual', 9]]) {
    const ai = armed('mushroom', undefined, { difficulty });
    assert.equal(ai.plan(1 / 60, context(30, undefined, { difficulty })).length, 1);
    ai.inventory('ai').give('mushroom'); ai.plan(1 / 60, context(30.1, undefined, { difficulty }));
    assert.deepEqual(ai.plan(1 / 60, context(30 + gap - .01, undefined, { difficulty })), []);
    assert.equal(ai.plan(1 / 60, context(30 + gap, undefined, { difficulty })).length, 1);
  }
});
check('stable ID ordering staggers first use and remains unchanged when reset input order changes', () => {
  const racers = [racer('a'), racer('b'), racer('c'), racer('player', .04)];
  for (const ids of [['a', 'b', 'c'], ['c', 'a', 'b']]) {
    const ai = new AiCombat(); ai.reset(ids); ids.forEach(id => ai.inventory(id).give('mushroom'));
    ai.plan(1 / 60, context(0, racers));
    assert.deepEqual(ai.plan(1 / 60, context(7, racers)).map(a => a.racerId), ['a']);
    assert.deepEqual(ai.plan(1 / 60, context(7.45, racers)).map(a => a.racerId), ['b']);
    assert.deepEqual(ai.plan(1 / 60, context(7.9, racers)).map(a => a.racerId), ['c']);
  }
});
check('zero-time pauses do not advance roulette or launch; reset clears inventory, stats and cooldowns', () => {
  const ai = new AiCombat(); ai.reset(['ai']); ai.collect('ai', 6, () => .99, 0);
  const slots = structuredClone(ai.inventory('ai').slots);
  assert.deepEqual(ai.plan(0, context(30)), []); assert.deepEqual(ai.inventory('ai').slots, slots);
  ai.plan(1.5, context(30)); assert.deepEqual(ai.plan(0, context(31)), []);
  assert.equal(ai.plan(1 / 60, context(31)).length, 1);
  ai.reset(['ai']); assert.equal(ai.inventory('ai').slots.length, 0);
  assert.deepEqual(ai.stats, { collected: 0, used: 0, playerAttacks: 0 });
  ai.inventory('ai').give('red-shell'); ai.plan(1 / 60, context(0));
  assert.equal(ai.plan(1 / 60, context(7)).length, 1);
});
check('race finish/removed racers are inert; wrapping targets and box lanes cross the start correctly', () => {
  const racers = [racer('ai', .98), racer('player', 1.02)];
  assert.equal(armed('red-shell', racers).plan(1 / 60, context(30, racers))[0].targetId, 'player');
  racers[0].finished = true;
  assert.deepEqual(armed('red-shell', racers).plan(1 / 60, context(30, racers)), []);
  racers[0].finished = false;
  const boxes = [{ t: .99, lane: 1, available: false }, { t: .995, lane: 3, available: true }, { t: .01, lane: -3, available: true }];
  assert.equal(boxLane(racers[0], boxes, 1000), 3);
  boxes[1].available = false; assert.equal(boxLane(racers[0], boxes, 1000), -3);
  assert.equal(boxLane(racer('ai', .97), [{ t: .971, lane: 1, available: true }, { t: .04, lane: 2, available: true }], 1000), null);
  assert.deepEqual(armed('red-shell').plan(1 / 60, context(30, [racer('player')])), []);
});
check('physical launch rejection preserves inventory, personal cooldown and global player attack budget', () => {
  const ai = armed('red-shell'); const denied = [];
  assert.deepEqual(ai.plan(1 / 60, context(30, undefined, { canFire: action => { denied.push(action); return false; } })), []);
  assert.equal(denied[0].targetId, 'player');
  assert.equal(ai.inventory('ai').item, 'red-shell');
  assert.deepEqual(ai.stats, { collected: 0, used: 0, playerAttacks: 0 });
  assert.equal(ai.plan(1 / 60, context(30.01, undefined, { canFire: () => true })).length, 1);
  assert.equal(ai.inventory('ai').item, null);
  assert.equal(ai.stats.playerAttacks, 1);
});
check('offensive targets use absolute race progress and never wrap to racers one lap away', () => {
  for (const item of ['red-shell', 'green-shell']) {
    const racers = [racer('ai', 1), racer('lapped', .035), racer('player', 1.04)];
    assert.equal(armed(item, racers).plan(1 / 60, context(30, racers))[0].targetId, 'player');
    racers[2].t = .04;
    assert.deepEqual(armed(item, racers).plan(1 / 60, context(30, racers)), []);
  }
  const racers = [racer('ai', 1.04), racer('player', 2.01)];
  assert.deepEqual(armed('banana', racers).plan(1 / 60, context(30, racers)), []);
  racers[1].t = 1.01;
  assert.equal(armed('banana', racers).plan(1 / 60, context(30, racers))[0].targetId, 'player');
});
check('triple mushroom uses its three charges at two-second gaps, without shortening the reserve cooldown', () => {
  const ai = armed('triple-mushroom'); const first = ai.inventory('ai').slots[0];
  ai.inventory('ai').acquire(6, () => 0);
  assert.equal(ai.plan(1.5, context(30))[0].item, 'triple-mushroom');
  assert.equal(first.charges, 2); assert.equal(ai.inventory('ai').slots[0], first);
  assert.deepEqual(ai.plan(.01, context(31.99)), []);
  assert.equal(ai.plan(.01, context(32))[0].item, 'triple-mushroom');
  assert.equal(first.charges, 1);
  assert.deepEqual(ai.plan(.01, context(33.99)), []);
  assert.equal(ai.plan(.01, context(34))[0].item, 'triple-mushroom');
  assert.equal(ai.inventory('ai').item, 'mushroom');
  assert.deepEqual(ai.plan(.01, context(35)), []);
  assert.deepEqual(ai.plan(.01, context(39.99)), []);
  assert.equal(ai.plan(.01, context(40))[0].item, 'mushroom');
});
check('horn attacks nearby karts in either direction, or consumes for a specific incoming threat', () => {
  for (const t of [-.008, .008, 1.008]) {
    const racers = [racer('ai'), racer('player', t)];
    assert.deepEqual(armed('super-horn', racers).plan(.01, context(30, racers)), [{ racerId: 'ai', item: 'super-horn', targetId: 'player', rear: false }]);
  }
  const distant = [racer('ai'), racer('player', .04)];
  const ai = armed('super-horn', distant);
  assert.deepEqual(ai.plan(.01, context(30, distant)), []);
  assert.deepEqual(ai.plan(.01, context(30, distant, {hornThreatIds:['other']})), []);
  assert.deepEqual(ai.plan(.01, context(30, distant, {hornThreatIds:['ai']})), [{ racerId:'ai', item:'super-horn', targetId:null, rear:false }]);
});
check('horn splash cannot evade player protection by targeting a nearer AI or an incoming shell', () => {
  const racers = [racer('ai'), racer('rival', .003), racer('player', .008)];
  const ai = armed('super-horn', racers);
  assert.deepEqual(ai.plan(.01, context(30, racers, {playerProtected:true,hornThreatIds:['ai']})), []);
  assert.equal(ai.inventory('ai').item, 'super-horn');
  racers[2].immune = 1; assert.deepEqual(ai.plan(.01, context(31, racers)), []);
  racers[2].immune = 0;
  assert.equal(ai.plan(.01, context(32, racers))[0].targetId, 'player');
  ai.inventory('rival').give('super-horn'); ai.plan(.01, context(33, racers));
  assert.deepEqual(ai.plan(.01, context(39.99, racers, {hornThreatIds:['rival']})), []);
  assert.equal(ai.plan(.01, context(40, racers))[0].racerId, 'rival');
  assert.equal(ai.stats.playerAttacks, 2);
});
check('horn physical rejection never spends the item or attack interval', () => {
  const racers = [racer('ai'), racer('player', .005)]; const ai = armed('super-horn', racers);
  assert.deepEqual(ai.plan(.01, context(30, racers, {canFire:()=>false})), []);
  assert.equal(ai.inventory('ai').item, 'super-horn'); assert.equal(ai.stats.used, 0);
  assert.equal(ai.plan(.01, context(30.01, racers, {canFire:()=>true})).length, 1);
});
check('star activates once while chasing or threatened, with no target and no redundant active-star use', () => {
  const racers = [racer('ai'), racer('player', .04)];
  const ai = armed('star', racers);
  racers[0].starred = true;
  assert.deepEqual(ai.plan(.01, context(30, racers)), []);
  assert.equal(ai.inventory('ai').item, 'star');
  racers[0].starred = false;
  assert.deepEqual(ai.plan(.01, context(31, racers)), [{racerId:'ai',item:'star',targetId:null,rear:false}]);
  assert.equal(ai.inventory('ai').item, null); assert.equal(ai.stats.playerAttacks, 0);
  const leader = [racer('ai', .1), racer('player', 0)];
  const defense = armed('star', leader);
  assert.deepEqual(defense.plan(.01, context(30, leader)), []);
  assert.equal(defense.plan(.01, context(31, leader, {hornThreatIds:['ai']}))[0].item, 'star');
});
check('bomb chooses a forward or rear target within its safe launch range and lane', () => {
  for (const [t,rear] of [[.04,false],[-.03,true]]) {
    const racers = [racer('ai'),racer('player',t,1)];
    assert.deepEqual(armed('bomb',racers).plan(.01,context(30,racers)), [{racerId:'ai',item:'bomb',targetId:'player',rear}]);
  }
  for (const [t,lane] of [[.01,0],[.08,0],[-.01,0],[-.06,0],[.04,5],[-.03,4],[1.04,0]]) {
    const racers=[racer('ai'),racer('player',t,lane)];
    assert.deepEqual(armed('bomb',racers).plan(.01,context(30,racers)), []);
  }
});
check('bomb splash budgets player attacks even when another AI is the nominal target', () => {
  const racers = [racer('ai'),racer('ai2'),racer('rival',.035),racer('player',.045)];
  const ai=armed('bomb',racers); ai.inventory('ai2').give('bomb'); ai.plan(.01,context(0,racers));
  assert.deepEqual(ai.plan(.01,context(30,racers,{playerProtected:true})), []);
  racers[3].starred=true; assert.deepEqual(ai.plan(.01,context(30,racers)), []); racers[3].starred=false;
  const first=ai.plan(.01,context(30,racers));
  assert.equal(first.length,1); assert.equal(first[0].targetId,'rival'); assert.equal(ai.stats.playerAttacks,1);
  assert.deepEqual(ai.plan(.01,context(37.99,racers)), []);
  assert.equal(ai.plan(.01,context(38,racers)).length,1); assert.equal(ai.stats.playerAttacks,2);
});
check('blocked bomb trajectory preserves the item and player budget, and starred targets are not attacked', () => {
  const racers=[racer('ai'),racer('player',.04)]; const ai=armed('bomb',racers);
  assert.deepEqual(ai.plan(.01,context(30,racers,{canFire:()=>false})),[]);
  assert.equal(ai.inventory('ai').item,'bomb'); assert.equal(ai.stats.playerAttacks,0);
  racers[1].starred=true; assert.deepEqual(ai.plan(.01,context(30,racers)),[]);
  racers[1].starred=false; assert.equal(ai.plan(.01,context(30,racers,{canFire:()=>true})).length,1);
  for (const item of ['green-shell','red-shell','super-horn']) {
    const target=[racer('ai'),{...racer('player',item==='super-horn'?.005:.04),starred:true}];
    assert.deepEqual(armed(item,target).plan(.01,context(30,target)),[]);
  }
});
check('AI collects with the same gap-sensitive strong-item cooldown as the player', () => {
  const ai=new AiCombat(); ai.reset(['ai']);
  assert.equal(ai.collect('ai',6,()=>.84,20,50),true);
  assert.equal(ai.inventory('ai').slots[0].pending,'star');
  assert.equal(ai.collect('ai',6,()=>.84,20,50),true);
  assert.notEqual(ai.inventory('ai').slots[1].pending,'star');
});
console.log(`\n${checks} AI combat checks passed.`);
