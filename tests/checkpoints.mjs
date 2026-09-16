import assert from 'node:assert/strict';
import {KartDriving} from '../src/driving.ts';
import {createTrack} from '../src/tracks.ts';
import {createShortcuts} from '../src/routes.ts';
const checks=[],failures=[];
function test(name,fn){try{fn();checks.push(name);}catch(e){failures.push({name,error:e.message});}}
for(const id of ['mushroom','castle']){
 const track=createTrack(id);track.shortcuts=id==='mushroom'?createShortcuts(track.sample,track.trackLength):[];
 test(`${id}: legal road lanes pass every ordered checkpoint`,()=>{
  for(const lane of [-8,-5,0,5,8]){const d=new KartDriving(track);d.reset(-.005,lane,30,0);
   for(let i=0;i<=2020;i++){const t=-.005+i*.0005,p=track.sample(t,lane);d.position.copy(p.position);d.velocity.copy(p.tangent).multiplyScalar(30);d.project();assert(!d.checkpointMissed,`lane=${lane} t=${t} gate=${d.nextGate}`);}
   assert.equal(d.nextGate,9);
  }
 });
 test(`${id}: missed checkpoint rescue returns just before the outstanding gate`,()=>{
  const d=new KartDriving(track);d.reset(.01,0,0,1);d.position.copy(track.sample(.2).position);d.project();assert(d.checkpointMissed);
  d.recover();assert.equal(d.nextGate,1);assert(!d.checkpointMissed);const approach=(.125-d.routeT)*track.trackLength;
  assert(approach>=6&&approach<=10,`return point is ${approach.toFixed(1)}m before the gate`);
  assert.equal(d.boost,0);assert.equal(d.speed,0);assert(d.recoveryFlash>0);
  d.position.copy(track.sample(.124).position);d.project();assert.equal(d.nextGate,1);
  d.position.copy(track.sample(.126).position);d.project();assert.equal(d.nextGate,2);assert(!d.checkpointMissed);
 });
}
console.log(JSON.stringify({passed:!failures.length,checks,failures},null,2));assert.equal(failures.length,0);
