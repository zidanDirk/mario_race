import assert from 'node:assert/strict';
import { createTrack, TRACKS, castleBoundarySegments } from '../src/tracks.ts';
import { KartDriving, wrapAngle } from '../src/driving.ts';
const checks=[];
const mushroom=createTrack('mushroom'),castle=createTrack('castle');
assert(Math.abs(mushroom.trackLength-814.0587092787521)<1e-7);
assert.deepEqual(TRACKS.mushroom.itemTs,[.11,.34,.6,.85]);
assert.equal(mushroom.widthAt(.5),9);checks.push('original mushroom geometry, pickup cadence and width preserved');
assert(castle.trackLength>=850&&castle.trackLength<=1050);
let minRadius=Infinity;
for(let i=0;i<3000;i++){
  const t=i/3000,a=castle.sample(t-.0001),b=castle.sample(t+.0001);
  minRadius=Math.min(minRadius,castle.trackLength*.0002/a.tangent.angleTo(b.tangent));
  assert(Math.abs(a.position.y-.14)<1e-12);
  assert(a.position.distanceTo(b.position)<.201,'no sampling jumps');
}
assert(minRadius>24,`turns remain broad: ${minRadius}`);
assert(castle.sample(-.00001).position.distanceTo(castle.sample(.99999).position)<1e-8);
checks.push('987m continuous level loop, broad corners and seamless start/finish');
// Compare all road strips farther than 35m along the route; no folded adjacent ribbons or crossing roads.
const samples=Array.from({length:400},(_,i)=>castle.sample(i/400).position);
for(let i=0;i<400;i++)for(let j=i+1;j<400;j++){
  const arc=Math.min(j-i,400-j+i)/400*castle.trackLength;
  if(arc>35)assert(samples[i].distanceTo(samples[j])>23,'separate road sections retain clearance');
}
checks.push('nonadjacent road sections do not overlap');
const {from,to,halfWidth}=TRACKS.castle.bridge;
assert.equal(castle.widthAt((from+to)/2),halfWidth);
assert.equal(castle.widthAt(from),9);assert.equal(castle.widthAt(to),9);
for(let i=0;i<1000;i++)assert(Math.abs(castle.widthAt(i/1000)-castle.widthAt((i+1)/1000))<.31,'bridge taper is smooth');
const rails=castleBoundarySegments(castle);
assert.equal(rails.length,660);
for(let i=0;i<rails.length;i++){
  const s=rails[i];assert(s.a.distanceTo(s.b)<4.5);
  const next=rails[(i+2)%rails.length];assert(s.b.distanceTo(next.a)<1e-7,'rails have no endpoint gaps');
  const d=new KartDriving(castle);d.position.copy(s.a);d.project();
  assert(d.roadDistance>=castle.widthAt(d.routeT)+.43,'visible rails remain outside the paved road');
}
checks.push('continuous physical parapets match bridge narrowing without hidden lane blockers');
for(const t of TRACKS.castle.itemTs)assert(castle.widthAt(t)>7,'three-wide boxes avoid bridge');
for(const t of TRACKS.castle.coinTs)for(let k=0;k<3;k++)assert(castle.widthAt(t+k*.007)-4.3>.8,'coins stay on pavement');
for(const pad of TRACKS.castle.boostPads)assert(Math.abs(pad.lane)+2.4<castle.widthAt(pad.t),'boost pads fit safe straights');
checks.push('coins, item boxes and boost pads remain safely on the road');
const drive=new KartDriving({...castle,colliders:rails});drive.reset(-.028,-3,0);
let seconds=0,hits=0,rescues=0,maxLane=0;
while(!drive.finished&&seconds<160){
  const target=castle.sample(drive.routeT+(9+drive.speed*.15)/castle.trackLength).position;
  const error=wrapAngle(Math.atan2(target.x-drive.position.x,target.z-drive.position.z)-drive.heading);
  drive.step({throttle:true,brake:Math.abs(error)>.5&&drive.speed>30,steer:Math.max(-1,Math.min(1,-error*2.7)),hop:false},0,1/60);
  if(drive.contact)hits++;if(drive.recovered)rescues++;maxLane=Math.max(maxLane,Math.abs(drive.lane));seconds+=1/60;
}
assert(drive.finished,`real driving should finish all checkpoints: ${drive.routeT}`);
assert.equal(rescues,0);assert.equal(hits,0);
checks.push('actual driving model finishes three laps with all gates, no rail collisions or rescue');
console.log(JSON.stringify({passed:true,checks,castle:{length:castle.trackLength,minRadius,seconds,hits,rescues,maxLane}},null,2));
