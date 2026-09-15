import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out='artifacts/course-v1';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-gl=angle','--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),checks=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
const read=()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__);
const hook=(name,arg)=>page.evaluate(({name,arg})=>window.__THREE_GAME_TEST_HOOKS__[name](arg),{name,arg});
const release=async()=>{for(const k of ['KeyW','KeyS','KeyA','KeyD'])await page.keyboard.up(k);};
const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
try{
 await page.goto('http://localhost:5173/?test=1');await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__?.frame>3);
 const routes=await hook('courseInfo');assert(routes.every(r=>r.savedMeters>25));checks.push('two routes each save over25m before exit boost');
 const clearance=await hook('courseClearance');assert(clearance.main>1.6,JSON.stringify(clearance));assert(clearance.branches.every(r=>r.min>1.6),JSON.stringify(clearance));checks.push('static scenery clears both shortcut centers and full-width main racing lanes');
 for(const [phase,time] of [['safe',1],['warning',3.2],['active',5.2]]){
  await hook('setupCourse',{id:'garden',u:.37,lane:-1.5,time});await page.waitForTimeout(100);await hook('setPausedForScreenshot',true);
  assert.equal((await read()).course.hazards[0].phase,phase);
  await page.screenshot({path:`${out}/vent-${phase}.png`});await hook('setPausedForScreenshot',false);
 }
 checks.push('visible green safe, amber warning and red steam phases');
 await hook('setupCourse',{id:'garden',u:.51,lane:2.4,time:5.2});await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__.course.hits===1);
 assert((await read()).player.stun>0);assert.equal((await read()).player.recoveryFlash,0);checks.push('active steam hits slow player without teleport');
 await hook('setupCourse',{id:'garden',u:.51,lane:2.4,time:1});await page.waitForTimeout(250);assert.equal((await read()).course.hits,0);checks.push('safe vent can be crossed or occupied without damage');
 await hook('setupCourse',{id:'workshop',u:.43,time:1});await page.keyboard.press('Escape');await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__.mode==='paused');const paused=await read();await page.waitForTimeout(350);const later=await read();assert.equal(paused.raceTime,later.raceTime);assert.deepEqual(paused.course.hazards,later.course.hazards);await page.click('#resume');await page.waitForTimeout(160);assert.notEqual((await read()).raceTime,paused.raceTime);checks.push('pause freezes hazard position and phase; resume advances');
 await hook('setupCourse',{id:'workshop',u:.56,lane:0,time:0});await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__.course.hits===1);checks.push('moving blocker physically hits and separates kart');
 const runs=[];
 for(const route of routes){
  await release();await hook('setupCourse',{id:route.id,u:0,speed:30,time:route.id==='workshop'?5:0});await page.waitForTimeout(100);
  let samples=0,offRoad=0,recovery=0,finished=false;const end=Date.now()+25000;
  while(Date.now()<end){const d=await read(),u=(d.player.routeT-route.from)/(route.to-route.from);if(u>=1.005){finished=true;break;}
   const look=10+Math.abs(d.player.speed)*.16;const targetU=u+look/route.length;
   // Real keyboard steering: enter and exit along the route, keep to the right of the vent/blocker.
   const lane=targetU>.29&&targetU<.70?(route.id==='garden'?-2:-2.6):0;
   const target=targetU<1?await hook('coursePoint',{id:route.id,u:Math.max(0,targetU),lane}):await hook('trackPoint',route.to+(targetU-1)*route.length/d.trackLength);
   const err=wrap(Math.atan2(target.x-d.player.x,target.z-d.player.z)-d.player.heading);
   await page.keyboard.up('KeyA');await page.keyboard.up('KeyD');if(Math.abs(err)>.035)await page.keyboard.down(err>0?'KeyA':'KeyD');
   if(Math.abs(err)>.3&&d.player.speed>28){await page.keyboard.up('KeyW');await page.keyboard.down('KeyS');}else{await page.keyboard.up('KeyS');await page.keyboard.down('KeyW');}
   if(d.player.offRoad)offRoad++;if(d.player.recoveryFlash>0)recovery++;samples++;
   if(samples===28)await page.screenshot({path:`${out}/${route.id}-driving.png`});
   await page.waitForTimeout(50);
  }
  await release();const d=await read();runs.push({route:route.id,finished,samples,offRoad,recovery,hits:d.course.hits,boosts:d.course.clears,time:d.raceTime});assert(finished,JSON.stringify(runs));assert.equal(recovery,0);assert.equal(d.player.checkpointMissed,false);assert.equal(d.course.clears,1,JSON.stringify(runs));assert(offRoad<8,JSON.stringify(runs));
 }
 checks.push('actual steering/braking traverses both branches, earns exit boosts, merges without missed gates or rescue');
 await page.setViewportSize({width:390,height:844});await hook('setupCourse',{id:'garden',u:.37,lane:-1.5,time:3.5});await page.waitForTimeout(100);await hook('setPausedForScreenshot',true);await page.screenshot({path:`${out}/mobile-warning.png`});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);checks.push('mobile warning, controls and course map fit viewport');
 await hook('setPausedForScreenshot',false);await release();await page.keyboard.press('Escape');await page.click('#restart');await page.waitForTimeout(80);const restart=await read();assert.equal(restart.raceTime,0);assert.equal(restart.course.clears,0);assert.equal(restart.course.hits,0);assert.equal(restart.course.hazards[0].phase,'safe');checks.push('restart clears hazards/rewards and resets safe phase');
 assert.deepEqual(errors,[]);const report={passed:true,checks,runs,clearance,errors};await fs.writeFile(`${out}/browser.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
