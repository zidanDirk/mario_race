import assert from 'node:assert/strict';import * as THREE from 'three';
import {KartDriving} from '../src/driving.ts';import{LOADOUTS,LEGACY_HANDLING,isLoadout}from'../src/loadouts.ts';import{createTrack}from'../src/tracks.ts';
const straight={trackLength:100000,sample(t,lane=0){return{position:new THREE.Vector3(lane,.14,t*100000),tangent:new THREE.Vector3(0,0,1),normal:new THREE.Vector3(1,0,0)};}};
const input={throttle:true,brake:false,steer:0,hop:false},dt=1/60,results={};
const tick=(d,n,i=input)=>{for(let k=0;k<Math.round(n/dt);k++)d.step(i,0,dt);};
for(const [id,profile]of Object.entries(LOADOUTS)){
  const d=new KartDriving(straight);d.handling=profile.handling;d.reset(0,0,0);tick(d,.8);const launch=d.speed;
  tick(d,9.2);const top=d.speed;d.speed=8;tick(d,.8);const recovery=d.speed;
  d.reset(0,0,32);d.project=()=>{d.offRoad=false;};tick(d,1.8,{...input,steer:.7,hop:true});const charge=d.charge;
  assert(d.hopHeight===0&&d.drifting);d.step({...input,hop:false},0,dt);assert(d.boost>0);
  d.reset(0,0,0);assert.equal(d.handling,profile.handling);results[id]={launch,top,recovery,charge};
}
assert(results.light.launch>results.drift.launch&&results.drift.launch>results.speed.launch);
assert(results.speed.top>results.drift.top&&results.drift.top>results.light.top);
assert(results.light.recovery>results.drift.recovery&&results.light.recovery>results.speed.recovery);
assert(results.drift.charge>results.light.charge*1.15);assert(results.speed.charge<results.light.charge);
const baseline=new KartDriving(straight);assert.equal(baseline.handling,LEGACY_HANDLING);assert(!isLoadout('legacy')&&!isLoadout('__proto__')&&isLoadout('speed'));
const laps=[];
for(const id of Object.keys(LOADOUTS)){
  const track=createTrack('mushroom'),d=new KartDriving(track);d.handling=LOADOUTS[id].handling;d.reset(0,0,0);let t=0,rescues=0;
  for(;t<100&&!d.finished;t+=dt){const p=track.sample(d.routeT+(9+Math.abs(d.speed)*.15)/track.trackLength).position;const error=Math.atan2(Math.sin(Math.atan2(p.x-d.position.x,p.z-d.position.z)-d.heading),Math.cos(Math.atan2(p.x-d.position.x,p.z-d.position.z)-d.heading));
    d.step({...input,steer:Math.abs(error)>.05?(error>0?-1:1):0,brake:Math.abs(error)>.5&&d.speed>30,throttle:!(Math.abs(error)>.5&&d.speed>30)},0,dt);if(d.recovered)rescues++;
  }
  assert(d.finished,`${id} failed three laps`);assert.equal(rescues,0);laps.push({id,time:t,rescues});
}
console.log(JSON.stringify({passed:true,checks:8,results,laps},null,2));
