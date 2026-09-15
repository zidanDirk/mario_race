import assert from 'node:assert/strict';
import {RampMotion,MUSHROOM_RAMPS,rampSurface,rampDistance} from '../src/ramps.ts';
import {buildRampColliders,buildRampVisuals} from '../src/ramp-visuals.ts';
import {createTrack} from '../src/tracks.ts';
import {moveCircle} from '../src/collision.ts';
import * as THREE from 'three';
const ramp={id:'test',t:.2,lane:3.5,width:5,length:9,height:1.6},dt=1/60,trackLength=800;
let checks=0;
function drive({pressAt=Infinity,releaseAt=Infinity,speed=40,sideAt=Infinity,reverse=false}={}) {
 const motion=new RampMotion();let d=-2,launched=0,landed=0,tricks=0,peak=0,air=0,firstLaunch=null;
 for(let frame=0;frame<180;frame++) {
  const before=d;d+=speed*dt;
  motion.step({beforeT:ramp.t+before/trackLength,routeT:ramp.t+d/trackLength,lane:d>=sideAt?-4:3.5,speed,hop:d>=pressAt&&d<releaseAt,valid:true,dt,trackLength,ramps:[ramp]});
  if(motion.launched){launched++;firstLaunch=frame;}if(motion.landed)landed++;if(motion.trickLanded)tricks++;
  peak=Math.max(peak,motion.height);if(motion.airborne)air++;
 }
 return {motion,launched,landed,tricks,peak,air,firstLaunch};
}
const normal=drive({pressAt:8});assert.equal(normal.launched,1);assert.equal(normal.landed,1);assert.equal(normal.tricks,1);assert(normal.peak>1.6&&normal.peak<4);assert(normal.air>20);checks++;
const plain=drive();assert.equal(plain.launched,1);assert.equal(plain.tricks,0);assert.equal(plain.landed,1);checks++;
assert.equal(drive({pressAt:-2}).tricks,0,'holding long before ramp cannot count');assert.equal(drive({pressAt:20}).tricks,0,'late airborne press cannot count');assert.equal(drive({pressAt:11}).tricks,1,'new press just after lip counts');checks++;
const side=drive({pressAt:3,sideAt:6});assert.equal(side.launched,0);assert.equal(side.tricks,0);assert.equal(side.landed,1);assert(side.peak<1.6);checks++;
const slow=drive({speed:5,pressAt:8});assert.equal(slow.launched,0);assert.equal(slow.tricks,0);assert.equal(slow.landed,1);checks++;
const reverse=new RampMotion();for(let d=12;d>-5;d-=.5)reverse.step({beforeT:ramp.t+(d+.5)/800,routeT:ramp.t+d/800,lane:3.5,speed:-30,hop:true,valid:true,dt,trackLength,ramps:[ramp]});assert.equal(reverse.height,0);assert.equal(reverse.launched,false);checks++;
const motion=new RampMotion();let d=0;
const step=(hop,valid=true)=>{const before=d;d+=40*dt;motion.step({beforeT:ramp.t+before/800,routeT:ramp.t+d/800,lane:3.5,speed:40,hop,valid,dt,trackLength,ramps:[ramp]});};
while(d<5)step(false);
step(true);motion.cancelInput();let trickLands=0;for(let i=0;i<100;i++){step(true);trickLands+=Number(motion.trickLanded);}assert.equal(trickLands,0,'pause invalidates buffered press and held input');checks++;
motion.reset();d=0;while(d<10)step(false);assert(motion.airborne);const paused=JSON.stringify(motion);assert.equal(JSON.stringify(motion),paused);step(false,false);assert.equal(motion.height,0);assert.equal(motion.airborne,false);checks++;
motion.reset();d=0;let totalTricks=0;
for(let lap=0;lap<2;lap++){d=0;for(let i=0;i<100;i++){step(d>=8||lap>0);totalTricks+=Number(motion.trickLanded);}}
assert.equal(totalTricks,1,'continuously held button cannot award a second lap trick');checks++;
motion.reset();d=0;while(d<7)step(false);motion.cancelInput();step(false);while(d<9.5)step(true);
assert.equal(motion.trick,true,'release then a fresh press after cancellation can perform a trick');checks++;
const sideEntry=new RampMotion();sideEntry.step({beforeT:ramp.t+7/800,routeT:ramp.t+7.5/800,lane:3.5,speed:30,hop:true,valid:true,dt,trackLength,ramps:[ramp]});assert.equal(sideEntry.height,0,'side entry cannot snap onto high part of ramp');checks++;
const wrapped=new RampMotion(),wrappedRamp={...ramp,t:.993};let launches=0;
for(let q=-2;q<45;q+=.5){wrapped.step({beforeT:(wrappedRamp.t+(q-.5)/800)%1,routeT:(wrappedRamp.t+q/800)%1,lane:3.5,speed:30,hop:false,valid:true,dt,trackLength,ramps:[wrappedRamp]});launches+=Number(wrapped.launched);}
assert.equal(launches,1,'ramp crossing start/finish wraps continuously');checks++;
assert.equal(rampSurface(ramp,0),0);assert.equal(rampSurface(ramp,9),1.6);for(let x=0;x<9;x+=.01)assert(Math.abs(rampSurface(ramp,x+.01)-rampSurface(ramp,x))<.003);assert(Math.abs(rampDistance(.001,{...ramp,t:.999},800)-1.6)<1e-9);checks++;
for(const r of MUSHROOM_RAMPS){assert(r.lane-r.width/2>0);assert(r.lane+r.width/2<8);assert(r.height<=1.6);}assert((MUSHROOM_RAMPS[1].t-MUSHROOM_RAMPS[0].t)*814>50);checks++;
const chainResults=[];
for(const speed of [40,51,65]) {
 const m=new RampMotion();let t=MUSHROOM_RAMPS[0].t-3/814,totalLaunches=0,totalLandings=0,totalTricks=0;
 for(let frame=0;frame<240;frame++) {
  const beforeT=t;t+=speed*dt/814;
  const hop=MUSHROOM_RAMPS.some(r=>{const d=rampDistance(t,r,814);return d>r.length-speed*.09&&d<r.length+speed*.04;});
  m.step({beforeT,routeT:t,lane:3.5,speed,hop,valid:true,dt,trackLength:814,ramps:MUSHROOM_RAMPS});
  totalLaunches+=Number(m.launched);totalLandings+=Number(m.landed);totalTricks+=Number(m.trickLanded);
 }
 assert.equal(totalLaunches,2,`both ramps launch at ${speed} m/s`);assert.equal(totalLandings,2);assert.equal(totalTricks,2);
 chainResults.push({speed,totalLaunches,totalLandings,totalTricks});
}
checks++;
const track=createTrack(),walls=buildRampColliders(track,MUSHROOM_RAMPS);
assert.equal(walls.length,18);
for(const r of MUSHROOM_RAMPS) {
 const owned=walls.filter(c=>c.rampId===r.id);
 const entrance=track.sample(r.t-2/track.trackLength,r.lane),end=track.sample(r.t+2/track.trackLength,r.lane);
 assert.equal(moveCircle(entrance.position,{x:(end.position.x-entrance.position.x)/dt,z:(end.position.z-entrance.position.z)/dt},dt,1.65,owned).contacts.length,0,'low entry stays open');
 const back=track.sample(r.t+(r.length+4)/track.trackLength,r.lane),inside=track.sample(r.t+(r.length-3)/track.trackLength,r.lane);
 assert(moveCircle(back.position,{x:(inside.position.x-back.position.x)/dt,z:(inside.position.z-back.position.z)/dt},dt,1.65,owned).contacts.length>0,'ground-level rear entry collides');
 const side=track.sample(r.t+7/track.trackLength,r.lane+6),middle=track.sample(r.t+7/track.trackLength,r.lane);
 assert(moveCircle(side.position,{x:(middle.position.x-side.position.x)/dt,z:(middle.position.z-side.position.z)/dt},dt,1.65,owned).contacts.length>0,'ground-level tall side entry collides');
}
checks++;
const scene=new THREE.Scene(),view=buildRampVisuals(scene,track,MUSHROOM_RAMPS);let meshes=0;
view.root.traverse(o=>{if(o.isMesh){meshes++;const positions=o.geometry.getAttribute('position');for(let i=0;i<positions.count;i++)assert(Number.isFinite(positions.getX(i))&&Number.isFinite(positions.getY(i))&&Number.isFinite(positions.getZ(i)));}});
assert(meshes<70);assert.equal(scene.children.length,1);view.dispose();assert.equal(scene.children.length,0);checks++;
console.log(JSON.stringify({passed:true,checks,normal,plain,side,slow,chainResults,meshes},null,2));
