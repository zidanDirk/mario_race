import assert from 'node:assert/strict';
import * as THREE from 'three';
import {KartDriving,wrapAngle} from '../src/driving.ts';
import {LOADOUTS} from '../src/loadouts.ts';
import {DRY_SURFACE,surfaceAt} from '../src/surfaces.ts';

// A long straight isolates surface forces from road curvature and steering helpers.
const track={trackLength:10000,sample(t,lane=0){return {position:new THREE.Vector3(lane,.14,t*10000),tangent:new THREE.Vector3(0,0,1),normal:new THREE.Vector3(1,0,0)};}};
const wet=surfaceAt('castle',.20,3.5,0,988),forward=surfaceAt('castle',.34,5,0,988),reverse=surfaceAt('castle',.34,-5,0,988);
const idle={throttle:false,brake:false,steer:0,hop:false},gas={...idle,throttle:true},dt=1/60;
const checks=[];
function kart({speed=0,loadout='light',heading=0,colliders=[]}={}){const d=new KartDriving({...track,colliders});d.handling=LOADOUTS[loadout].handling;d.reset(.20,0,speed);d.heading=d.travelHeading=heading;return d;}
function drive(d,seconds,input=idle,surface=DRY_SURFACE,starred=false,hz=60){for(let i=0;i<Math.round(seconds*hz);i++)d.step(input,0,1/hz,surface,starred);return d;}
const close=(a,b,tolerance=1e-7)=>assert(Math.abs(a-b)<tolerance,`expected ${a} ≈ ${b} within ${tolerance}`);

for(const hz of [30,60,120]) {
 const still=kart(),moving=kart(),back=kart();
 drive(still,1);drive(moving,1,idle,forward,false,hz);drive(back,1,idle,reverse,false,hz);
 close(moving.position.z-still.position.z,9);close(back.position.z-still.position.z,-9);
 close(moving.speed,0);close(back.speed,0);close(moving.position.x,0);
}
checks.push('stationary karts travel ±9 m in one second on a belt at 30/60/120 Hz without throttle');

for(const settings of [{speed:30,heading:0,input:gas},{speed:30,heading:Math.PI,input:idle},{speed:-7,heading:0,input:{...idle,brake:true}}]) {
 const ground=kart(settings),withBelt=kart(settings),againstBelt=kart(settings);
 drive(ground,.5,settings.input);drive(withBelt,.5,settings.input,forward);drive(againstBelt,.5,settings.input,reverse);
 close(withBelt.position.z-ground.position.z,4.5);close(againstBelt.position.z-ground.position.z,-4.5);
 close(withBelt.position.x,ground.position.x);close(withBelt.speed,ground.speed);
}
checks.push('belt force remains road-forward while accelerating, facing backward, and in reverse gear');

const sideways=kart({heading:Math.PI/2});drive(sideways,.5,idle,forward);
close(sideways.position.x,0);close(sideways.position.z,2004.5);close(sideways.heading,Math.PI/2);
checks.push('belt motion does not rotate a parked sideways kart or follow its nose');

const exit=kart();drive(exit,.5,idle,forward);const end=exit.position.clone();drive(exit,1,idle);
close(exit.position.distanceTo(end),0);close(exit.velocity.length(),0);
const poweredExit=kart({speed:30}),groundExit=kart({speed:30});drive(poweredExit,.5,gas,forward);drive(groundExit,.5,gas);
const previousGap=poweredExit.position.z-groundExit.position.z;drive(poweredExit,.5,gas);drive(groundExit,.5,gas);close(poweredExit.position.z-groundExit.position.z,previousGap);
checks.push('leaving a belt removes external motion immediately without adding engine speed or lingering drift');

const stunned=kart(),stunnedGround=kart();stunned.stun=stunnedGround.stun=2;
drive(stunned,1,gas,forward);drive(stunnedGround,1,gas);close(stunned.position.z-stunnedGround.position.z,9);close(stunned.speed,0);
checks.push('stun blocks engine acceleration while the physical conveyor still carries the kart');

const loadouts=[];
for(const [id,{handling}] of Object.entries(LOADOUTS)) {
 const dry=kart({loadout:id,speed:handling.topSpeed}),slippery=kart({loadout:id,speed:handling.topSpeed});
 drive(dry,4,gas);drive(slippery,4,gas,wet);
 assert(slippery.position.z<dry.position.z-10,`${id}: wet route costs measurable straight-line distance`);
 assert(slippery.speed<dry.speed*.92&&slippery.speed>dry.speed*.895,`${id}: wet route lowers attainable speed`);
 // Compare actual travel response at matched engine speed and nose angle after soaking the tires.
 dry.speed=slippery.speed=30;dry.heading=slippery.heading=.4;dry.travelHeading=slippery.travelHeading=0;
 dry.step(gas,0,dt);slippery.step(gas,0,dt,wet);
 const dryTravel=Math.atan2(dry.velocity.x,dry.velocity.z),wetTravel=Math.atan2(slippery.velocity.x,slippery.velocity.z);
 assert(wetTravel>0&&wetTravel<dryTravel*.8,`${id}: lower grip keeps travel lagging behind the turned nose`);
 const gripBefore=slippery.surfaceGrip;
 slippery.step(gas,0,dt);
 assert(slippery.surfaceGrip>gripBefore&&slippery.surfaceGrip<.7,`${id}: grip restoration cannot snap on the first dry frame`);
 // Resume straight driving to avoid changing the tested surface through an unrelated road exit.
 slippery.heading=slippery.travelHeading=0;slippery.position.x=0;drive(slippery,1.5,gas);
 assert(slippery.surfaceGrip>.99,`${id}: grip recovers promptly after leaving the puddle`);
 assert(slippery.speed>handling.topSpeed*.93,`${id}: engine speed recovers on dry road`);
 loadouts.push({id,wetTravel,dryTravel,restoredGrip:slippery.surfaceGrip});
}
checks.push('all three loadouts lose real speed and travel grip on wet pavement, then recover smoothly on dry road');

const star=kart();drive(star,6,idle,wet,true);
assert(star.speed>58.6&&star.speed<=59,'star accelerates toward 59 m/s even without gas');
const starStart=star.position.clone(),starHeading=star.heading;drive(star,.15,{...gas,steer:.7},wet,true);
assert(Math.abs(wrapAngle(star.heading-starHeading))>.07);assert(Math.abs(star.position.x-starStart.x)>.04);assert(star.speed>58.5);
checks.push('star sustains its speed through wet pavement and preserves responsive steering');

const wall={a:{x:-20,z:2010},b:{x:20,z:2010},radius:.3,kind:'rail'};
const charged=kart({speed:59,colliders:[wall]});let contacts=0;
for(let i=0;i<60;i++){charged.step(gas,0,dt,forward,true);if(charged.contact)contacts++;assert(charged.position.z<=2008.10001,'star and conveyor cannot tunnel through a solid guardrail');}
assert(contacts>0);assert(charged.speed<59*.8,'solid collision still slows an invincible kart');
checks.push('star plus conveyor still collides with solid guardrails and reports impact rather than crossing');

const beltAgainstWall=kart({colliders:[wall]});let beltContacts=0;
for(let i=0;i<180;i++){beltAgainstWall.step(idle,0,dt,forward);if(beltAgainstWall.contact)beltContacts++;assert(beltAgainstWall.position.z<=2008.10001);}
assert(beltContacts>0);close(beltAgainstWall.speed,0);
checks.push('a conveyor-driven parked kart cannot pass through a guardrail');

console.log(JSON.stringify({passed:true,checks,loadouts,starSpeed:star.speed,starRailContacts:contacts,parkedRailContacts:beltContacts},null,2));
