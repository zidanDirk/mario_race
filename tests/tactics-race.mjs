import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out='artifacts/tactics-v1';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-gl=angle','--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const read=()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__),hook=(name,arg)=>page.evaluate(({name,arg})=>window.__THREE_GAME_TEST_HOOKS__[name](arg),{name,arg});
try {
 await page.goto((process.env.GAME_URL||'http://localhost:5180')+'/?test=1');await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__?.frame>3);
 await page.click('#cup-select');await page.click('#start');
 // Only the preceding mushroom stage uses a finish fixture; castle is driven for all three laps.
 await hook('cupNearFinish');await page.keyboard.down('KeyW');await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__.mode==='finished');await page.keyboard.up('KeyW');await page.click('#resume');await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__.mode==='racing');
 assert.equal((await read()).track,'castle');assert.equal((await read()).tactics.stats.bombs,0);
 const deadline=Date.now()+240000,laps=new Set(),aiSurfaces=new Set(),captures=new Set();let rescues=0,maxCalls=0,maxTriangles=0;
 while(Date.now()<deadline){
  const d=await read();laps.add(d.lap);maxCalls=Math.max(maxCalls,d.render.calls);maxTriangles=Math.max(maxTriangles,d.render.triangles);
  for(const r of d.tactics.ai)aiSurfaces.add(r.surface.kind);
  if(d.mode==='finished')break;if(d.player.recoveryFlash>0)rescues++;
  const t=(d.player.routeT%1+1)%1,phase=d.raceTime%12,forward=Math.floor(d.raceTime/12)%2===0?5:-5;
  const lane=t>.135&&t<.24?3.5:t>.265&&t<.39?(phase<8.5?forward:0):0;
  if(d.lap===1){const name=t>.18&&t<.20?'race-wet':t>.32&&t<.35?'race-belts':null;if(name&&!captures.has(name)){captures.add(name);await hook('setPausedForScreenshot',true);await page.screenshot({path:`${out}/${name}.png`});await hook('setPausedForScreenshot',false);}}
  const p=await hook('techniquePoint',{t:d.player.routeT+(8+Math.abs(d.player.speed)*.13)/d.trackLength,lane}),a=Math.atan2(p.x-d.player.x,p.z-d.player.z)-d.player.heading,e=Math.atan2(Math.sin(a),Math.cos(a));
  for(const [k,on]of [['KeyA',e>.04],['KeyD',e<-.04],['KeyW',!(Math.abs(e)>.5&&d.player.speed>30)],['KeyS',Math.abs(e)>.5&&d.player.speed>30]])await page.keyboard[on?'down':'up'](k);
  if(d.item&&!d.rolling)await page.keyboard.press('KeyE');
  await page.waitForTimeout(50);
 }
 const final=await read();for(const k of ['KeyW','KeyS','KeyA','KeyD'])await page.keyboard.up(k);
 assert.equal(final.mode,'finished');assert.deepEqual([...laps],[1,2,3]);assert.equal(rescues,0);assert(final.tactics.stats.wetSeconds>2);assert(final.tactics.stats.beltSeconds>1);assert(aiSurfaces.has('belt'));assert.equal(final.cup.rounds.length,2);assert.deepEqual(errors,[]);
 await page.screenshot({path:out+'/race-podium.png'});
 const report={passed:true,scope:'Mushroom finish fixture then castle three complete laps with keyboard steering and item use; no castle progress/time/finish injections',time:final.raceTime,laps:[...laps],rescues,maxCalls,maxTriangles,aiSurfaces:[...aiSurfaces],tactics:final.tactics.stats,interactions:final.interactions,cup:final.cup,errors};
 await page.click('#resume');await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__.mode==='countdown'&&window.__THREE_GAME_DIAGNOSTICS__.track==='mushroom');const restarted=await read();assert.equal(restarted.track,'mushroom');assert.equal(restarted.tactics.bombs.length,0);assert.deepEqual(restarted.tactics.stars,{});
 await fs.writeFile(out+'/race.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(e){await fs.writeFile(out+'/race-failure.json',JSON.stringify({error:String(e),last:await read(),errors},null,2));throw e;}finally{await browser.close();}
