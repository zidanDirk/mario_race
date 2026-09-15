import assert from 'node:assert/strict';
import * as THREE from 'three';
import { KartDriving, wrapAngle } from '../src/driving.ts';
import { createShortcuts, projectShortcut } from '../src/routes.ts';
import { createCourseHazards, updateCourseHazards, courseContact, ventPhase } from '../src/course.ts';

// Use the authored circuit: a circle hides route/road ambiguities at junctions.
const curve = new THREE.CatmullRomCurve3([[-90,0],[-80,80],[-20,130],[65,105],[105,40],[65,-15],[110,-75],[60,-130],[-30,-130],[-95,-70]].map(([x,z])=>new THREE.Vector3(x,.14,z)),true,'catmullrom',.6);
curve.arcLengthDivisions=2400;
const track = {trackLength:curve.getLength(),sample(t,lane=0){t=((t%1)+1)%1;const position=curve.getPointAt(t),tangent=curve.getTangentAt(t).normalize(),normal=new THREE.Vector3(tangent.z,0,-tangent.x);position.addScaledVector(normal,lane);return {position,tangent,normal};}};
track.shortcuts=createShortcuts(track.sample,track.trackLength);
const idle={throttle:false,brake:false,steer:0,hop:false};
const checks=[],failures=[],evidence=[];
function test(name,fn){try{fn();checks.push(name);}catch(error){failures.push({name,error:error.stack});}}
function branchAt(t){const local=((t%1)+1)%1;return track.shortcuts.find(r=>local>=r.from&&local<=r.to);}
function sampleRace(t){const r=branchAt(t);return r?r.sample((((t%1)+1)%1-r.from)/(r.to-r.from)):track.sample(t);}

test('both shortcuts save distance and join the road with matching positions and headings',()=>{
  for(const route of track.shortcuts){
    assert(route.savedMeters>10,`${route.id} saves ${route.savedMeters} m`);
    assert(route.length>50&&route.length<(route.to-route.from)*track.trackLength);
    for(const [u,t] of [[0,route.from],[1,route.to]]){
      assert(route.sample(u).position.distanceTo(track.sample(t).position)<1e-6);
      assert(route.sample(u).tangent.dot(track.sample(t).tangent)>.999);
    }
    evidence.push({route:route.id,length:route.length,savedMeters:route.savedMeters});
  }
});

test('all branch centers remain paved, continuous and free of rescue',()=>{
  for(const route of track.shortcuts){
    const d=new KartDriving(track);d.reset(route.from,0,0);
    for(let i=0;i<=400;i++){
      const expected=route.from+(route.to-route.from)*i/400;
      d.position.copy(route.sample(i/400).position);d.project();
      assert(!d.offRoad,`${route.id} surface ${i}`);
      assert(Math.abs(d.routeT-expected)<.002,`${route.id} projection ${i}: ${d.routeT} vs ${expected}`);
      d.step(idle,0,1/60);assert(!d.recovered);assert.equal(d.recoveryTimer,0);
    }
  }
});

test('ordered checkpoints accept both branches and finish exactly three laps',()=>{
  const d=new KartDriving(track);d.reset(-.005,0,0,0);
  for(let i=0;i<=3010;i++){
    const t=-.005+i/1000,oldGate=d.nextGate;
    d.position.copy(sampleRace(t).position);d.project();
    assert(d.nextGate-oldGate<=1);assert(!d.checkpointMissed,`missed at ${t}`);
    if(t<2.999)assert(!d.finished,`early finish at ${t}`);
  }
  assert.equal(d.nextGate,25);assert.equal(d.lap,3);assert(d.finished);
});

test('reverse branch traversal never awards forward checkpoints',()=>{
  for(const route of track.shortcuts){
    const d=new KartDriving(track);d.reset(route.to,0,20,Math.floor(route.from*8)+1);const gate=d.nextGate;
    for(let i=400;i>=0;i--){const s=route.sample(i/400);d.position.copy(s.position);d.velocity.copy(s.tangent).multiplyScalar(-20);d.project();assert.equal(d.nextGate,gate);}
    assert(!d.finished);
  }
});

test('joining beyond an unpassed gate cannot skip or retroactively award it',()=>{
  for(const route of track.shortcuts){
    const gate=Math.floor(route.from*8)+1,d=new KartDriving(track);d.reset(route.from-.005,0,0,gate);
    for(let i=220;i<=400;i++){d.position.copy(route.sample(i/400).position);d.project();assert.equal(d.nextGate,gate);}
    assert(d.checkpointMissed);assert(!d.finished);
  }
});

test('real steering traverses each shortcut at road speed without repositioning or rescue',()=>{
  for(const route of track.shortcuts){
    const d=new KartDriving(track);d.reset(route.from-.008,0,32);let entered=false,offRoadFrames=0,maxSpeed=0,finished=false;
    for(let frame=0;frame<1200;frame++){
      const current=projectShortcut(route,d.position),lead=8+Math.abs(d.speed)*.14;
      const target=d.routeT<route.from?route.sample(Math.max(0,(lead-(route.from-d.routeT)*track.trackLength)/route.length)):current.u+lead/route.length<1?route.sample(current.u+lead/route.length):track.sample(route.to+(current.u+lead/route.length-1)*route.length/track.trackLength);
      const error=wrapAngle(Math.atan2(target.position.x-d.position.x,target.position.z-d.position.z)-d.heading);
      const braking=Math.abs(error)>.3&&d.speed>30;
      d.step({...idle,throttle:!braking,brake:braking,steer:THREE.MathUtils.clamp(-error*2.4,-1,1)},0,1/60);
      assert(!d.recovered,`${route.id} rescue`);
      if(d.shortcutId===route.id){entered=true;maxSpeed=Math.max(maxSpeed,d.speed);}
      if(d.offRoad)offRoadFrames++;
      if(entered&&d.routeT>route.to+.006){finished=true;break;}
    }
    assert(entered&&finished,`${route.id}: entered=${entered}, t=${d.routeT}`);
    assert(offRoadFrames<5,`${route.id}: ${offRoadFrames} off-road frames`);
    assert(maxSpeed>40,`${route.id} should retain road acceleration: ${maxSpeed}`);
    assert(!d.checkpointMissed,`${route.id}: gate ${d.nextGate}, t ${d.routeT}`);
    evidence.push({route:route.id,physicalTraversal:true,maxSpeed,offRoadFrames});
  }
});

test('vents give two seconds warning then return safely at every cycle boundary',()=>{
  assert.equal(ventPhase(0).phase,'safe');assert.equal(ventPhase(2.999).phase,'safe');
  assert.deepEqual(ventPhase(3),{phase:'warning',seconds:2});assert.equal(ventPhase(4.999).phase,'warning');
  assert.deepEqual(ventPhase(5),{phase:'active',seconds:3});assert.equal(ventPhase(7.999).phase,'active');
  assert.deepEqual(ventPhase(8),{phase:'safe',seconds:3});assert.deepEqual(ventPhase(19),ventPhase(3));
});

test('vents only hit while active; sweeps catch fast crossings with both endpoints outside',()=>{
  const hazards=createCourseHazards(track.shortcuts),vent=hazards.find(h=>h.kind==='vent');
  const before={x:vent.position.x-15,z:vent.position.z},after={x:vent.position.x+15,z:vent.position.z};
  for(const time of [0,3,4.99]){updateCourseHazards(hazards,time);assert(!courseContact(vent,before,after));}
  updateCourseHazards(hazards,5);assert(courseContact(vent,before,after));
  assert(!courseContact(vent,{x:before.x,z:before.z+10},{x:after.x,z:after.z+10}));
});

test('moving barriers hit stopped karts via relative sweep and keep their collider aligned',()=>{
  const hazards=createCourseHazards(track.shortcuts),barrier=hazards.find(h=>h.kind==='barrier');
  updateCourseHazards(hazards,Math.PI/.9*1.5);updateCourseHazards(hazards,Math.PI/.9*2.5);
  const point=barrier.route.sample(barrier.u),stationary=point.position.addScaledVector(point.tangent,2);
  assert(stationary.distanceTo(barrier.previous)>barrier.radius+1.65);
  assert(stationary.distanceTo(barrier.position)>barrier.radius+1.65);
  assert(courseContact(barrier,stationary,stationary));
  assert.equal(barrier.collider.a.x,barrier.position.x);assert.equal(barrier.collider.b.z,barrier.position.z);
});

test('the same race clock freezes all hazards and reset reproduces their initial positions',()=>{
  const hazards=createCourseHazards(track.shortcuts),fresh=createCourseHazards(track.shortcuts);
  const snapshot=list=>list.map(h=>({position:h.position.toArray(),phase:h.phase,seconds:h.seconds}));
  updateCourseHazards(hazards,5.7);const paused=snapshot(hazards);
  for(let frame=0;frame<60;frame++)updateCourseHazards(hazards,5.7);
  assert.deepEqual(snapshot(hazards),paused);
  updateCourseHazards(hazards,0);updateCourseHazards(fresh,0);assert.deepEqual(snapshot(hazards),snapshot(fresh));
});

console.log(JSON.stringify({passed:!failures.length,checks,evidence,failures},null,2));
assert.equal(failures.length,0);
