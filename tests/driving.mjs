import assert from 'node:assert/strict';
import * as THREE from 'three';
import { KartDriving, wrapAngle } from '../src/driving.ts';
const R=50;const track={trackLength:Math.PI*2*R,sample(t,lane=0){const a=t*Math.PI*2;const tangent=new THREE.Vector3(-Math.sin(a),0,Math.cos(a)),normal=new THREE.Vector3(tangent.z,0,-tangent.x);return {position:new THREE.Vector3(Math.cos(a)*R,.14,Math.sin(a)*R).addScaledVector(normal,lane),tangent,normal};}};
const input={throttle:true,brake:false,steer:0,hop:false}, dt=1/60;
function tick(d,seconds,i){for(let t=0;t<seconds;t+=dt)d.step(i,0,dt);}
const results=[];
let d=new KartDriving(track);d.reset(0,0,30);const h=d.heading;tick(d,.6,input);assert.equal(d.heading,h);assert(d.position.x>49.9,'straight travel keeps world X despite curving track');results.push('straight throttle does not auto-steer');
d.reset(0,0,30);tick(d,.3,{...input,steer:1});assert(d.heading<-.2,'right input turns nose right');results.push('right input rotates heading');
d.reset(0,0,30);d.step({...input,steer:1,hop:true},0,dt);assert(d.hopHeight>0);assert.equal(d.driftDirection,1);tick(d,.4,{...input,steer:-.6,hop:true});assert.equal(d.driftDirection,1);assert.equal(d.hopHeight,0);assert(d.drifting);results.push('hop lands, countersteering retains drift side');
// Follow a 50m-radius bend during a held right drift by countersteering its radius.
for(let t=0;t<8;t+=dt){const road=track.sample(d.routeT);const tangentYaw=Math.atan2(road.tangent.x,road.tangent.z);const aim=wrapAngle(tangentYaw-.27);const error=wrapAngle(d.heading-aim);const desiredYaw= Math.abs(d.speed)/R + error*2.2 + d.lane*.055;const steer=Math.max(-1,Math.min(1,(desiredYaw-1.15)/1.35));d.step({...input,steer,hop:true},0,dt);}
assert(d.driftStage===3,`held drift charges on road (${d.charge}, lane${d.lane})`);const stage=d.driftStage;d.step({...input,hop:false},0,dt);assert.equal(d.releasedTurbo,stage);assert(d.boost>0);results.push('release charged drift grants turbo');
d.reset(0,0,0);tick(d,1,{...input,throttle:false,brake:true});assert(d.speed<-5);results.push('brake from standstill reverses');assert(d.wrongWay,'reverse triggers wrong-way alert');d.stun=1;d.speed=0;tick(d,.5,{...input,throttle:false,brake:true});assert.equal(d.speed,0,'stun blocks reverse acceleration');results.push('reverse wrong-way and stunned brake are handled');
d.reset(0,0,0);tick(d,.5,{...input,brake:true,steer:1});assert(d.heading<-.5);results.push('accelerate + brake enables spin turn');
d.reset(.99,0,30,1);d.position.copy(track.sample(1.001).position);d.project();assert.equal(d.nextGate,1,'cannot skip seven lap checkpoints');results.push('checkpoint shortcuts rejected');
d.reset(2.99,0,30,24);d.position.copy(track.sample(3.001).position);d.project();assert(d.finished);results.push('ordered third-lap finish');
d.reset(.4,0,30);const gate=d.nextGate;d.position.set(200,.14,200);tick(d,1.5,{...input,throttle:false});assert(d.roadDistance<10);assert.equal(d.nextGate,gate);results.push('off-course recovery preserves checkpoint count');
console.log(JSON.stringify({passed:true,checks:results},null,2));
