import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out='artifacts/checkpoint-assist';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-gl=angle','--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1280,height:800},hasTouch:true}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{window.__CHECKPOINT_PAD__={connected:false,pressed:[]};Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>{const p=window.__CHECKPOINT_PAD__;return p.connected?[{id:'Standard test controller',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},(_,i)=>({pressed:p.pressed.includes(i),value:p.pressed.includes(i)?1:0}))}]:[];}});});
const pad=(pressed=[],connected=true)=>page.evaluate(({pressed,connected})=>Object.assign(window.__CHECKPOINT_PAD__,{pressed,connected}),{pressed,connected});
const nextFrame=async()=>{const frame=(await read()).frame;await page.waitForFunction(f=>window.__THREE_GAME_DIAGNOSTICS__.frame>f,frame);};
async function fixture(){await pad([],false);await page.keyboard.up('KeyW');await hook('setState','active-play');await hook('setupDetour','missed');await hook('setCoins',7);await hook('setPausedForScreenshot',false);await page.getByRole('button',{name:'回到检查点前',exact:true}).waitFor();await nextFrame();}
async function capture(name){await hook('setPausedForScreenshot',true);await page.screenshot({path:`${out}/${name}.png`});await hook('setPausedForScreenshot',false);}

const read=()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__);
const hook=(name,arg)=>page.evaluate(({name,arg})=>window.__THREE_GAME_TEST_HOOKS__[name](arg),{name,arg});
try{
 await page.goto('http://127.0.0.1:5173/?test=1');await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__?.frame>3);
 await fixture();
 const recover=page.getByRole('button',{name:'回到检查点前',exact:true});
 assert.equal(await recover.isVisible(),true,'missed checkpoint must offer an actionable recovery, including touch');
 assert.match(await page.locator('#minimap').getAttribute('aria-label'),/橙色圆圈/);
 const before=await read();await page.waitForFunction(t=>window.__THREE_GAME_DIAGNOSTICS__.raceTime>t+2.1,before.raceTime);
 const waiting=await read();assert.equal(waiting.player.nextGate,1);assert.equal(waiting.player.recoveryFlash,0);assert(Math.hypot(waiting.player.x-before.player.x,waiting.player.z-before.player.z)<.1);
 checks.push('missed checkpoint shows explicit help and map target, keeps timer running, and never auto-teleports');await capture('desktop');
 const rescues=(await hook('growth')).metrics.rescues;await recover.click();await nextFrame();const returned=await read();
 assert.equal(returned.player.nextGate,1);assert.equal(returned.coins,4);assert.equal((await hook('growth')).metrics.rescues,rescues+1);assert(!returned.player.checkpointMissed);assert(returned.player.recoveryFlash>0);assert.equal(returned.player.speed,0);assert(await recover.isHidden());
 const distance=(.125-returned.player.routeT)*returned.trackLength;assert(distance>=6&&distance<=10);
 await page.keyboard.down('KeyW');await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__.player.nextGate===2);await page.keyboard.up('KeyW');assert.equal((await read()).lap,1);checks.push('click returns 8m before missed gate, charges once and actual throttle must cross it to restore scoring');await capture('recovered');
 await fixture();await page.keyboard.down('Backspace');await page.keyboard.down('Backspace');await page.keyboard.up('Backspace');await nextFrame();assert.equal((await read()).coins,4);assert.equal((await hook('growth')).metrics.rescues,1);checks.push('Backspace shares recovery and repeated keydown does not double-charge');
 for(const viewport of [{width:390,height:664},{width:844,height:390}]){
  await page.setViewportSize(viewport);await fixture();await hook('setCoins',2);await nextFrame();
  const box=await recover.boundingBox(),panel=await page.locator('.checkpoint-assist').boundingBox();assert(box.height>=44);assert(panel.x>=0&&panel.x+panel.width<=viewport.width&&panel.y+panel.height<viewport.height-70);const timer=await page.locator('.race-clock').boundingBox();assert(panel.y>=timer.y+timer.height,'help must not cover timer');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await capture(viewport.width===390?'mobile':'landscape');await recover.tap();await nextFrame();assert.equal((await read()).coins,0);assert(!(await read()).player.checkpointMissed);assert.equal(await page.locator('.touch-button.pressed').count(),0);
 }
 checks.push('portrait/landscape touch recovery stays visible, preserves steering controls and handles fewer than 3 coins');
 await page.setViewportSize({width:1280,height:800});await fixture();await pad([8]);await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__.player.recoveryFlash>0);await page.waitForTimeout(1500);assert.equal((await hook('growth')).metrics.rescues,1);assert.equal((await read()).coins,4);await pad([]);checks.push('standard gamepad Select recovers once even when held beyond protection');
 await fixture();await page.keyboard.press('Escape');await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__.mode==='paused');assert(await recover.isHidden());const paused=await read();await page.keyboard.press('Backspace');await pad([8]);await page.waitForTimeout(200);assert.equal((await read()).player.routeT,paused.player.routeT);assert.equal((await read()).coins,7);await pad([],false);await page.click('#resume');await recover.waitFor();await page.keyboard.press('Escape');await page.click('#home');await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__.mode==='ready');assert(await recover.isHidden());assert.equal(await page.locator('#app').evaluate(e=>e.classList.contains('checkpoint-missed')),false);checks.push('pause blocks recovery and home clears the prompt');
 assert.deepEqual(errors,[]);const report={passed:true,checks,errors};await fs.writeFile(out+'/browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){await fs.writeFile(out+'/failure.json',JSON.stringify({error:String(error),last:await read(),errors},null,2));throw error;}
finally{await browser.close();}
