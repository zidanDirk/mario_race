import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const out='artifacts/techniques-v1';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-gl=angle','--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1440,height:900},hasTouch:true});
const checks=[],errors=[],samples={};page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
  window.__INPUT_TEST_PAD__={connected:true,axes:[0,0,0,0],pressed:[]};
  Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>{
    const p=window.__INPUT_TEST_PAD__;
    return p.connected?[{id:'Standard test controller',index:0,connected:true,mapping:'standard',timestamp:performance.now(),axes:p.axes,buttons:Array.from({length:17},(_,i)=>({pressed:p.pressed.includes(i),touched:p.pressed.includes(i),value:p.pressed.includes(i)?1:0}))}]:[];
  }});
});
const read=()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__);
const hook=(name,arg)=>page.evaluate(({name,arg})=>window.__THREE_GAME_TEST_HOOKS__[name](arg),{name,arg});
const pad=({buttons=[],axis=0,connected=true}={})=>page.evaluate(({buttons,axis,connected})=>Object.assign(window.__INPUT_TEST_PAD__,{pressed:buttons,axes:[axis,0,0,0],connected}),{buttons,axis,connected});
const nextFrame=async()=>{const frame=(await read()).frame;await page.waitForFunction(f=>window.__THREE_GAME_DIAGNOSTICS__.frame>f,frame);};
async function fixture(kind='ramp',speed=40){await pad({connected:kind==='ramp'});await hook('techniqueFixture',{kind,lane:3.5,speed});await nextFrame();}
async function steering(){const d=await read(),p=await hook('techniquePoint',{t:d.player.routeT+(7+Math.abs(d.player.speed)*.12)/d.trackLength,lane:3.5}),a=Math.atan2(p.x-d.player.x,p.z-d.player.z)-d.player.heading,e=Math.atan2(Math.sin(a),Math.cos(a));return Math.abs(e)>.035?(e>0?-1:1):0;}
try{
  await page.goto('http://localhost:5173/?test=1&v=techniques-inputs-v1');await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__?.frame>3);
  await fixture('horn',0);await pad();await hook('giveItem','triple-mushroom');await hook('addReserve','banana');await nextFrame();
  for(const charges of [2,1]){
    await pad({buttons:[4]});await page.waitForFunction(n=>window.__THREE_GAME_DIAGNOSTICS__.inventory[0]?.charges===n,charges);
    await page.waitForTimeout(320);assert.equal((await read()).inventory[0].charges,charges,'held shoulder must not repeat use');
    await pad();await nextFrame();
  }
  assert.equal((await read()).item,'triple-mushroom');assert.equal((await read()).inventory[1].item,'banana');
  await pad({buttons:[4]});await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__.item==='banana');await page.waitForTimeout(320);
  assert.equal((await read()).item,'banana');assert.equal((await hook('combat')).held,null,'a held shoulder must not attach or fire the reserve');await pad();await nextFrame();
  checks.push('standard gamepad shoulder consumes one triple charge per press; long holds and release preserve remaining charges and reserve');

  await fixture('horn',0);await pad();await hook('giveItem','super-horn');await hook('addReserve','banana');await nextFrame();
  await pad({buttons:[4]});await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__.techniques.horns===1);
  await page.waitForTimeout(380);assert.equal((await read()).techniques.horns,1);assert.equal((await read()).item,'banana');assert.equal((await hook('combat')).held,null);
  await pad();await nextFrame();assert.equal((await read()).techniques.horns,1);
  checks.push('same left shoulder fires horn on press exactly once, never auto-uses reserve while held');

  await fixture();let peak=0,pressedTrick=false;const padDeadline=Date.now()+15000;
  while(Date.now()<padDeadline){const d=await read();if(d.techniques.jumps>=1&&!d.techniques.ramp.airborne)break;
    const hop=d.techniques.ramp.trickReady&&!d.techniques.ramp.trick;pressedTrick ||= hop;peak=Math.max(peak,d.techniques.ramp.height);
    await pad({buttons:hop?[0,5]:[0],axis:await steering()});await page.waitForTimeout(25);
  }
  await pad();await nextFrame();const gamepadResult=await read();
  assert(pressedTrick,'right shoulder was pressed in the trick window');assert(gamepadResult.techniques.jumps>=1,JSON.stringify(gamepadResult.techniques));assert(peak>1.8);assert.equal(gamepadResult.player.recoveryFlash,0);
  samples.gamepad={jumps:gamepadResult.techniques.jumps,peak,speed:gamepadResult.player.speed};checks.push('gamepad A accelerates, axis steers and right shoulder times a real ramp trick through successful boosted landing');

  await pad({connected:false});await page.setViewportSize({width:390,height:844});await fixture();await pad({connected:false});await nextFrame();
  const cdp=await page.context().newCDPSession(page);
  const controls={};for(const [name,key,id]of [['gas','ArrowUp',1],['hop','Space',2],['left','ArrowLeft',3],['right','ArrowRight',4]]){
    const box=await page.locator(`[data-key="${key}"]`).boundingBox();assert(box,`${name} touch button visible`);controls[name]={id,x:box.x+box.width/2,y:box.y+box.height/2,radiusX:3,radiusY:3,force:1};
  }
  let contacts=[];
  async function touch(names){
    const wanted=names.map(n=>controls[n]),kept=contacts.filter(p=>wanted.some(q=>q.id===p.id)),ended=contacts.filter(p=>!wanted.some(q=>q.id===p.id));
    // CDP touchEnd identifies the contacts being released, not the surviving fingers.
    if(ended.length)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:ended});
    if(wanted.some(p=>!kept.some(q=>q.id===p.id)))await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:wanted});
    contacts=wanted;
  }
  let dualTouch=false,touchPeak=0;const touchDeadline=Date.now()+15000;
  while(Date.now()<touchDeadline){const d=await read();if(d.techniques.jumps>=1&&!d.techniques.ramp.airborne)break;
    const hop=d.techniques.ramp.trickReady&&!d.techniques.ramp.trick,axis=await steering(),names=['gas'];
    if(hop){names.push('hop');dualTouch=true;}if(axis)names.push(axis<0?'left':'right');
    touchPeak=Math.max(touchPeak,d.techniques.ramp.height);await touch(names);await page.waitForTimeout(25);
  }
  await touch([]);await nextFrame();const touchResult=await read();
  assert(dualTouch,'throttle and drift touched simultaneously');assert(touchResult.techniques.jumps>=1,JSON.stringify(touchResult.techniques));assert(touchPeak>1.8);assert.equal(touchResult.player.recoveryFlash,0);
  samples.touch={jumps:touchResult.techniques.jumps,peak:touchPeak};await hook('setPausedForScreenshot',true);const hud=await page.locator('.technique-hud').boundingBox(),trial=await page.locator('.trial-hud').boundingBox();assert(hud&&trial);assert(hud.y+hud.height<=trial.y||hud.x>=trial.x+trial.width||hud.x+hud.width<=trial.x,'technique prompt must not cover mobile trial information');await page.screenshot({path:out+'/inputs-mobile.png'});await hook('setPausedForScreenshot',false);
  checks.push('real mobile multitouch throttle plus drift times a ramp trick, with touch steering and a safe landing');

  await fixture('ramp',0);await pad({connected:false});await nextFrame();await touch(['gas']);await page.waitForTimeout(350);const beforeCancel=(await read()).player.speed;assert(beforeCancel>10);
  await touch(['gas','hop']);await page.waitForTimeout(30);await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});contacts=[];
  await page.waitForTimeout(450);assert.equal(await page.locator('.touch-button.pressed').count(),0);assert((await read()).player.speed<beforeCancel,'cancelled throttle must coast rather than keep accelerating');
  await touch(['gas']);await page.waitForTimeout(250);assert((await read()).player.speed>beforeCancel,'new touch still accelerates after cancellation');await touch([]);
  checks.push('touchCancel releases throttle and drift; pressed state clears, kart coasts, and fresh touch works');
  assert.deepEqual(errors,[]);const report={passed:true,checks,samples,errors};await fs.writeFile(out+'/inputs.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){
  const failure={error:String(error),checks,samples,errors};try{failure.last=await read();failure.techniques=await hook('techniques');await page.screenshot({path:out+'/input-failure.png'});}catch(e){failure.captureError=String(e);}
  await fs.writeFile(out+'/input-failure.json',JSON.stringify(failure,null,2));throw error;
}finally{await browser.close();}
