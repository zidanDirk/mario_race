import {chromium} from '@playwright/test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
const out='artifacts/techniques-v1';const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-gl=angle','--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),runs=[],errors=[],pressed=new Set();page.on('pageerror',e=>errors.push(e.message));
const read=()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__),hook=(name,arg)=>page.evaluate(({name,arg})=>window.__THREE_GAME_TEST_HOOKS__[name](arg),{name,arg});
async function key(code,down){if(down===pressed.has(code))return;if(down){await page.keyboard.down(code);pressed.add(code);}else{await page.keyboard.up(code);pressed.delete(code);}}
async function release(){for(const code of [...pressed])await key(code,false);}
async function race(id){
 const deadline=Date.now()+170000,laps=new Set();let rescues=0,airFrames=0,maxCalls=0,maxTriangles=0,lastUse=-1;const captured=new Set();
 while(Date.now()<deadline){const d=await read();laps.add(d.lap);maxCalls=Math.max(maxCalls,d.drawCalls);maxTriangles=Math.max(maxTriangles,d.triangles);if(d.mode==='finished'){await release();return {id,time:d.raceTime,laps:[...laps],rescues,airFrames,maxCalls,maxTriangles,techniques:d.techniques,combat:await hook('combat'),tricks:await hook('tricks')};}
  if(d.player.recoveryFlash>0)rescues++;if(d.techniques.ramp.airborne)airFrames++;
  const local=(d.player.routeT%1+1)%1,lane=local>.675&&local<.85?3.5:0;
  const p=await hook('techniquePoint',{t:d.player.routeT+(8+Math.abs(d.player.speed)*.13)/d.trackLength,lane});const a=Math.atan2(p.x-d.player.x,p.z-d.player.z)-d.player.heading,e=Math.atan2(Math.sin(a),Math.cos(a));
  await key('KeyA',e>.04);await key('KeyD',e<-.04);const brake=Math.abs(e)>.5&&d.player.speed>30;await key('KeyS',brake);await key('KeyW',!brake);
  await key('Space',d.techniques.ramp.trickReady&&!d.techniques.ramp.trick);
  if(d.item&&d.raceTime-lastUse>1){await page.keyboard.press('KeyE');lastUse=d.raceTime;}
  if(id==='light'&&d.techniques.ramp.airborne&&d.techniques.ramp.trick&&!captured.has('jump')){captured.add('jump');await page.screenshot({path:out+'/real-jump.png'});}
  await page.waitForTimeout(25);
 }
 throw new Error('Three-lap keyboard race timed out: '+JSON.stringify(await read()));
}
try{
 await page.goto('http://localhost:5173/?test=1&v=techniques-v1');await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__?.frame>3);
 for(const id of ['light','speed','drift']){
  await page.click('#loadout-open');await page.click(`[data-loadout=${id}]`);await page.keyboard.press('Escape');await page.click('#start');await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__.mode==='racing');
  const run=await race(id);runs.push(run);assert.deepEqual(run.laps,[1,2,3]);assert.equal(run.rescues,0);assert(run.techniques.jumps>=2,JSON.stringify(run.techniques));assert(run.techniques.aiJumps>0);assert.equal(run.tricks.counts.jump,run.techniques.jumps);assert(run.combat.stats.collected>0&&run.combat.stats.used>0);
  await page.screenshot({path:`${out}/${id}-three-laps.png`});await page.click('#home');
 }
 assert.deepEqual(errors,[]);const report={passed:true,method:'Actual keyboard throttle, steering, brake, jump and item buttons from race start to finish. Read-only geometry and diagnostics; no state, position or time injection.',runs,errors};await fs.writeFile(out+'/races.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,runs:runs.map(r=>({id:r.id,time:r.time,rescues:r.rescues,techniques:r.techniques})),errors},null,2));
}catch(e){await fs.writeFile(out+'/race-failure.json',JSON.stringify({runs,errors,last:await read()},null,2));await page.screenshot({path:out+'/race-failure.png'});throw e;}finally{await browser.close();}
