import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='artifacts/pass-2';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-gl=angle','--use-angle=metal']});
const context=await browser.newContext({viewport:{width:1440,height:960},deviceScaleFactor:1});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text()+' '+m.location().url);});
const read=()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__);
const state=name=>page.evaluate(name=>window.__THREE_GAME_TEST_HOOKS__.setState(name),name);
const freeze=()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true));
try{
 await page.goto('http://127.0.0.1:5173/?test=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__);
 await page.screenshot({path:`${out}/desktop-ready.png`});
 await page.click('#start');await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__.mode==='racing');
 await page.keyboard.down('KeyW');await page.waitForTimeout(2200);let d=await read();assert(d.player.speed>20,'acceleration');assert(d.player.t>-.028,'progress');const start=d;await page.screenshot({path:`${out}/motion-1.png`});
 await page.keyboard.down('KeyD');await page.keyboard.down('Space');await page.waitForTimeout(1100);d=await read();assert(d.player.lane<start.player.lane-3,'steering');assert(d.charge>.65,'drift charges');await page.screenshot({path:`${out}/motion-2.png`});
 await page.keyboard.up('Space');await page.keyboard.up('KeyD');await page.waitForTimeout(80);d=await read();assert(d.boost>0,'drift release boost');
 await page.screenshot({path:`${out}/desktop-drift.png`});await page.keyboard.up('KeyW');
 await page.keyboard.press('Escape');await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__.mode==='paused');assert.equal((await read()).mode,'paused');const pausedTime=(await read()).raceTime;await page.waitForTimeout(250);assert.equal((await read()).raceTime,pausedTime,'pause freezes race');await page.screenshot({path:`${out}/desktop-paused.png`});
 await page.click('#resume');await page.waitForTimeout(100);assert.equal((await read()).mode,'racing');
 await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.placeAtPickup('coin'));await page.keyboard.down('KeyW');await page.waitForTimeout(150);assert((await read()).coins>0,'coin sensor');
 await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.placeAtPickup('item'));await page.waitForTimeout(150);assert((await read()).item,'item sensor');await page.keyboard.press('KeyE');await page.waitForTimeout(80);assert.equal((await read()).item,null,'item consumed');
 await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.giveItem('mushroom'));await page.click('#item');await page.waitForTimeout(80);assert((await read()).boost>0,'mushroom boost');
 await page.keyboard.up('KeyW');
 await state('near-finish');await page.keyboard.down('KeyW');await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__.mode==='finished');await page.keyboard.up('KeyW');await page.screenshot({path:`${out}/desktop-finished.png`});assert.equal((await read()).lap,3,'three-lap finish');
 await page.click('#resume');await page.waitForTimeout(100);d=await read();assert.equal(d.mode,'countdown');assert.equal(d.coins,0);assert.equal(d.raceTime,0);assert.equal(d.boost,0);
 // Complete a fresh three-lap race by holding real acceleration and correcting the line.
 await state('ready');await page.click('#start');await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__.mode==='racing');await page.keyboard.down('KeyW');
 const laps=new Set();let samples=0;const deadline=Date.now()+100000;
 while(Date.now()<deadline){const live=await read();laps.add(live.lap);if(live.mode==='finished')break;assert.equal(live.mode,'racing');await page.keyboard.up('KeyA');await page.keyboard.up('KeyD');if(live.player.lane>1)await page.keyboard.down('KeyD');else if(live.player.lane< -1)await page.keyboard.down('KeyA');samples++;await page.waitForTimeout(220);}
 await page.keyboard.up('KeyW');await page.keyboard.up('KeyA');await page.keyboard.up('KeyD');const fullRace=await read();assert.equal(fullRace.mode,'finished','full race completes');assert.deepEqual([...laps],[1,2,3],'all three laps traversed');assert(fullRace.raceTime>30,'full race driven without progress shortcut');await page.screenshot({path:`${out}/full-race-finished.png`});await fs.writeFile(`${out}/full-race.json`,JSON.stringify({time:fullRace.raceTime,rank:fullRace.rank,laps:[...laps],inputSamples:samples},null,2));
 await state('active-play');await freeze();await page.screenshot({path:`${out}/desktop-active-play.png`});const desktop=await read();
 const gpu=await page.evaluate(()=>{const gl=document.querySelector('#world').getContext('webgl2');const ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown';});
 await page.setViewportSize({width:390,height:844});await state('ready');await freeze();await page.screenshot({path:`${out}/mobile-ready.png`});
 await state('active-play');await freeze();await page.screenshot({path:`${out}/mobile-active-play.png`});const mobile=await read();
 await state('ready');await page.click('#start');await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__.mode==='racing');
 const throttle=page.locator('[data-key="ArrowUp"]');const bb=await throttle.boundingBox();await page.mouse.move(bb.x+bb.width/2,bb.y+bb.height/2);await page.mouse.down();await page.waitForTimeout(500);assert((await read()).player.speed>10,'touch throttle uses input');await page.mouse.up();
 const touch=page.locator('[data-key="ArrowLeft"]');const tb=await touch.boundingBox();const lane=(await read()).player.lane;await page.mouse.move(tb.x+tb.width/2,tb.y+tb.height/2);await page.mouse.down();await page.waitForTimeout(500);await page.mouse.up();assert((await read()).player.lane>lane+1,'touch steer');
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false,'mobile no overflow');
 const report={passed:true,checks:['real-input start and countdown','acceleration and progress','steering','charged drift release boost','pause freezes and resumes','coin pickup','item pickup and use','mushroom speed boost','three-lap finish boundary','full three-lap race using real keyboard input','retry state reset','desktop and mobile captures','touch acceleration and steering','mobile no horizontal overflow'],fullRace:{time:fullRace.raceTime,rank:fullRace.rank,laps:[...laps],inputSamples:samples},desktop,mobile,gpu,errors};
 assert.deepEqual(errors,[],'no browser errors');await fs.writeFile(`${out}/playtest.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await context.close();await browser.close();}
