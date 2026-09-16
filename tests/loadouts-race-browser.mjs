import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const out='artifacts/loadouts-v1';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-gl=angle','--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],runs=[];
page.on('pageerror',e=>errors.push(e.message));
const read=()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__);
const hook=(name,arg)=>page.evaluate(({name,arg})=>window.__THREE_GAME_TEST_HOOKS__[name](arg),{name,arg});
async function release(){for(const key of ['KeyW','KeyS','KeyA','KeyD'])await page.keyboard.up(key);}
async function drive(){
 const deadline=Date.now()+170000;let rescues=0;const laps=new Set();
 while(Date.now()<deadline){
  const d=await read();laps.add(d.lap);
  if(d.mode==='finished'){await release();return {loadout:d.loadout,time:d.raceTime,laps:[...laps],rescues,practice:d.practice,trial:d.trial};}
  if(d.player.recoveryFlash>0)rescues++;
  const target=await hook('trackPoint',d.player.routeT+(9+Math.abs(d.player.speed)*.15)/d.trackLength);
  const angle=Math.atan2(target.x-d.player.x,target.z-d.player.z)-d.player.heading;
  const error=Math.atan2(Math.sin(angle),Math.cos(angle));
  await page.keyboard.up('KeyA');await page.keyboard.up('KeyD');
  if(Math.abs(error)>.05)await page.keyboard.down(error>0?'KeyA':'KeyD');
  if(Math.abs(error)>.5&&d.player.speed>30){await page.keyboard.up('KeyW');await page.keyboard.down('KeyS');}
  else{await page.keyboard.up('KeyS');await page.keyboard.down('KeyW');}
  await page.waitForTimeout(60);
 }
 throw new Error('Real keyboard drive did not finish: '+JSON.stringify(await read()));
}
try{
 await page.goto('http://localhost:5173/?test=1&v=loadouts-v1');await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__?.frame>3);
 await page.click('#loadout-open');
 for(const id of ['light','speed','drift']){
  await page.click(`[data-loadout=${id}]`);const selected=await hook('loadout');
  const before=await page.evaluate(()=>({...localStorage}));await page.click('#loadout-test-drive');
  await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__.mode==='racing');
  const run=await drive();runs.push(run);assert.equal(run.time,20);assert.equal(run.rescues,0);
  assert(run.practice.distance>300);assert(run.practice.peak>selected.handling.topSpeed-2);assert(run.practice.peak<=selected.handling.topSpeed+.01);
  assert.deepEqual(await page.evaluate(()=>({...localStorage})),before);
  await page.screenshot({path:`${out}/practice-${id}.png`});await page.click('#home');
 }
 await page.click('[data-loadout=drift]');await page.keyboard.press('Escape');await page.click('[data-race-mode=time-trial]');await page.click('#start');
 await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__.mode==='racing');const race=await drive();runs.push(race);
 assert.deepEqual(race.laps,[1,2,3]);assert.equal(race.rescues,0);assert(race.trial.bestMs>0);
 const selected=await hook('loadout');assert.match(selected.ghostKey,/handling1-techniques1-tactics1-drift-qa/);
 assert(await page.evaluate(key=>Boolean(localStorage.getItem(key)),selected.ghostKey));
 await page.screenshot({path:out+'/drift-three-laps.png'});assert.deepEqual(errors,[]);
 const report={passed:true,method:'Real keyboard input only; diagnostics and track geometry are read-only. No time, position or finish injection.',runs,errors};
 await fs.writeFile(out+'/races.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){await fs.writeFile(out+'/race-failure.json',JSON.stringify({runs,errors,last:await read()},null,2));await page.screenshot({path:out+'/race-failure.png'});throw error;}
finally{await browser.close();}
