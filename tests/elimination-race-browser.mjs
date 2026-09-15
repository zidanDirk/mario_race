import{chromium}from'@playwright/test';import assert from'node:assert/strict';import fs from'node:fs/promises';
const out='artifacts/elimination-v1';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-gl=angle','--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],milestones=[];
page.on('pageerror',e=>errors.push(e.message));
const read=()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__),hook=(name,arg)=>page.evaluate(({name,arg})=>window.__THREE_GAME_TEST_HOOKS__[name](arg),{name,arg});
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));let lastItem=-1,rescueFrames=0,maxLap=1,lastDrop=0,maxCalls=0,maxTriangles=0;
try{
  await page.goto('http://localhost:5173/?test=1');await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__?.frame>3);
  await page.click('#elimination-select');await page.click('#start');await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__.mode==='racing');
  const deadline=Date.now()+240000;
  while(Date.now()<deadline){
    const d=await read();maxLap=Math.max(maxLap,d.lap);maxCalls=Math.max(maxCalls,d.render.calls);maxTriangles=Math.max(maxTriangles,d.render.triangles);
    if(d.player.recoveryFlash>0)rescueFrames++;
    if(d.elimination.eliminated.length!==lastDrop){lastDrop=d.elimination.eliminated.length;milestones.push({time:d.raceTime,lap:d.lap,rank:d.rank,active:d.elimination.activeIds.length,eliminated:d.elimination.eliminated.at(-1),overtakes:d.eliminationOvertakes});console.log(JSON.stringify(milestones.at(-1)));}
    if(d.mode==='finished')break;
    const p=await hook('trackPoint',d.player.routeT+(9+Math.abs(d.player.speed)*.15)/d.trackLength);
    const e=wrap(Math.atan2(p.x-d.player.x,p.z-d.player.z)-d.player.heading);
    await page.keyboard.up('KeyA');await page.keyboard.up('KeyD');if(Math.abs(e)>.05)await page.keyboard.down(e>0?'KeyA':'KeyD');
    if(Math.abs(e)>.5&&d.player.speed>30){await page.keyboard.up('KeyW');await page.keyboard.down('KeyS');}else{await page.keyboard.up('KeyS');await page.keyboard.down('KeyW');}
    if(d.item&&d.raceTime-lastItem>3){lastItem=d.raceTime;await page.keyboard.press('KeyE');}
    await page.waitForTimeout(60);
  }
  for(const key of['KeyW','KeyS','KeyA','KeyD','KeyE'])await page.keyboard.up(key);
  const final=await read();assert.equal(final.mode,'finished');assert.equal(final.elimination.playerPlace,1);assert.equal(final.raceTime,110);assert(maxLap>3);assert.equal(rescueFrames,0);
  assert.deepEqual(final.elimination.eliminated.map(e=>e.at),[30,50,70,90,110]);assert.equal(final.elimination.activeIds.length,1);assert(final.eliminationOvertakes>0);
  const combat=await hook('combat');assert(combat.stats.collected>0&&combat.stats.used>0);
  await page.screenshot({path:out+'/real-winner.png'});await page.setViewportSize({width:390,height:844});await page.screenshot({path:out+'/real-winner-mobile.png'});
  await page.locator('#resume').scrollIntoViewIfNeeded();await page.click('#resume');await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__.mode==='countdown');assert.equal((await hook('eliminationState')).state.eliminated.length,0);
  assert.deepEqual(errors,[]);const report={passed:true,milestones,maxLap,rescueFrames,maxCalls,maxTriangles,final:final.elimination,overtakes:final.eliminationOvertakes,combat,errors};
  await fs.writeFile(out+'/race.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(e){await fs.writeFile(out+'/race-failure.json',JSON.stringify({milestones,rescueFrames,maxLap,errors,last:await read()},null,2));await page.screenshot({path:out+'/race-failure.png'});throw e;}finally{await browser.close();}
