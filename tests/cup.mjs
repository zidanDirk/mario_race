import assert from 'node:assert/strict';
import { CupSeries, CUP_POINTS, CUP_TRACKS } from '../src/cup.ts';

const roster = ['mario','luigi','peach','toad','bowser','yoshi'].map(id=>({id,name:id}));
const ids = roster.map(driver=>driver.id);
const create = (difficulty='standard') => new CupSeries(roster, 'mario', difficulty);
let passed=0;
function test(name, run) { run(); passed++; console.log(`✓ ${name}`); }

test('fixed two-station six-driver cup starts with no results or points',()=>{
  const cup=create();
  assert.deepEqual(CUP_TRACKS,['mushroom','castle']);
  assert.equal(cup.stageIndex,0);assert.equal(cup.complete,false);
  assert.equal(cup.snapshot().awaitingNext,false);
  assert.equal(cup.snapshot().playerId,'mario');
  assert.deepEqual(cup.snapshot().standings.map(driver=>driver.points),[0,0,0,0,0,0]);
  assert.deepEqual(cup.snapshot().standings.map(driver=>driver.rank),[1,1,1,1,1,1]);
});
test('valid roster player and difficulty are required',()=>{
  assert.throws(()=>new CupSeries(roster.slice(0,5),'mario','standard'));
  assert.throws(()=>new CupSeries([...roster.slice(0,5),roster[0]],'mario','standard'));
  assert.throws(()=>new CupSeries(roster,'missing','standard'));
  assert.throws(()=>new CupSeries(roster,'mario','easy'));
  assert.throws(()=>new CupSeries(roster.map((driver,index)=>index===0?{id:'',name:'bad'}:driver),'mario','standard'));
  assert.throws(()=>new CupSeries(roster.map((driver,index)=>index===0?{...driver,name:' '}:driver),'mario','standard'));
});
test('cannot advance before a completed station',()=>{
  const cup=create();assert.equal(cup.advance(),false);assert.equal(cup.stageIndex,0);
});
test('each position earns its real position points and first place records a win',()=>{
  const cup=create();assert.equal(cup.finishRound(ids),true);
  const state=cup.snapshot();
  assert.deepEqual(state.standings.map(driver=>driver.points),CUP_POINTS);
  assert.deepEqual(state.standings.map(driver=>driver.places),[[1],[2],[3],[4],[5],[6]]);
  assert.deepEqual(state.standings.map(driver=>driver.wins),[1,0,0,0,0,0]);
  assert.equal(state.awaitingNext,true);assert.equal(state.complete,false);
});
test('missing duplicate and foreign driver results are rejected without mutations',()=>{
  const cup=create(),before=cup.snapshot();
  for(const order of [ids.slice(0,5),[...ids.slice(0,5),'foreign'],[...ids.slice(0,5),'mario'],[...ids,'extra'],null]) {
    assert.equal(cup.finishRound(order),false);assert.deepEqual(cup.snapshot(),before);
  }
});
test('duplicate first-station finish cannot award more points',()=>{
  const cup=create();cup.finishRound(ids);const before=cup.snapshot();
  assert.equal(cup.finishRound([...ids].reverse()),false);
  assert.deepEqual(cup.snapshot(),before);
});
test('advance preserves first result with locked roster player and difficulty',()=>{
  const cup=create('casual');cup.finishRound(ids);
  assert.equal(cup.advance(),true);assert.equal(cup.stageIndex,1);
  assert.equal(cup.advance(),false);const state=cup.snapshot();
  assert.equal(state.awaitingNext,false);assert.equal(state.difficulty,'casual');assert.equal(state.playerId,'mario');
  assert.deepEqual(state.rounds,[{trackId:'mushroom',order:ids}]);
});
test('final standings accumulate both actual orders and break equal totals by final place',()=>{
  const cup=create();cup.finishRound(ids);cup.advance();
  assert.equal(cup.finishRound([...ids].reverse()),true);
  const state=cup.snapshot();assert.equal(cup.complete,true);assert.equal(state.awaitingNext,false);
  assert.deepEqual(state.standings.map(driver=>[driver.id,driver.points,driver.rank]),[
    ['yoshi',19,1],['mario',19,2],['bowser',18,3],['toad',18,4],['peach',18,5],['luigi',18,6],
  ]);
  assert.deepEqual(state.rounds[1],{trackId:'castle',order:[...ids].reverse()});
  assert.equal(cup.advance(),false);
});
test('a repeated final result cannot double-count or move beyond the final station',()=>{
  const cup=create();cup.finishRound(ids);cup.advance();cup.finishRound(ids);const before=cup.snapshot();
  assert.equal(cup.finishRound(ids),false);assert.equal(cup.advance(),false);
  assert.deepEqual(cup.snapshot(),before);assert.equal(cup.stageIndex,1);
});
test('retrying first round rolls back its result and accepts replacement only once',()=>{
  const cup=create();cup.finishRound(ids);assert.equal(cup.retryRound(),true);
  assert.equal(cup.snapshot().rounds.length,0);assert.equal(cup.snapshot().awaitingNext,false);
  assert.equal(cup.advance(),false);assert.equal(cup.finishRound([...ids].reverse()),true);
  assert.equal(cup.snapshot().standings[0].id,'yoshi');assert.equal(cup.snapshot().standings[0].points,15);
});
test('retrying uncommitted second round preserves first round points',()=>{
  const cup=create();cup.finishRound(ids);cup.advance();const before=cup.snapshot();
  assert.equal(cup.retryRound(),true);assert.deepEqual(cup.snapshot(),before);
});
test('retrying final result preserves first round but clears completed state',()=>{
  const cup=create();cup.finishRound(ids);cup.advance();cup.finishRound(ids);
  assert.equal(cup.retryRound(),true);assert.equal(cup.complete,false);assert.equal(cup.stageIndex,1);
  assert.deepEqual(cup.snapshot().rounds,[{trackId:'mushroom',order:ids}]);
  assert.deepEqual(cup.snapshot().standings.map(driver=>driver.points),CUP_POINTS);
  cup.finishRound([...ids].reverse());assert.equal(cup.complete,true);
  assert.equal(cup.snapshot().standings.find(driver=>driver.id==='mario').points,19);
});
test('mutating constructor data result arrays or snapshots cannot change series state',()=>{
  const source=roster.map(driver=>({...driver}));const cup=new CupSeries(source,'mario','standard');
  source[0].name='changed';source[1].id='changed';source.pop();
  const order=[...ids];cup.finishRound(order);order.reverse();
  const before=cup.snapshot(),snapshot=cup.snapshot();
  snapshot.standings[0].name='changed';snapshot.standings[0].points=1000;snapshot.standings[0].places[0]=99;
  snapshot.rounds[0].order.reverse();snapshot.rounds.pop();snapshot.stageIndex=55;snapshot.difficulty='casual';
  assert.deepEqual(cup.snapshot(),before);
});
test('creating a fresh cup clears previous progression and allows another chosen player',()=>{
  const prior=create();prior.finishRound(ids);prior.advance();prior.finishRound(ids);
  const fresh=new CupSeries(roster,'peach','casual');
  assert.equal(fresh.complete,false);assert.equal(fresh.stageIndex,0);assert.equal(fresh.snapshot().playerId,'peach');
  assert.equal(fresh.snapshot().standings.every(driver=>driver.points===0),true);
});
console.log(`${passed} cup state tests passed`);
