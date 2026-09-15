import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const out='artifacts/audio-v1';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-gl=angle','--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
  const connect=AudioNode.prototype.connect, analysers=[], loops=new Set();
  AudioNode.prototype.connect=function(destination,...args){
    if(this.context instanceof AudioContext && destination===this.context.destination){
      const analyser=this.context.createAnalyser();analyser.fftSize=2048;analysers.push(analyser);
      connect.call(this,analyser);connect.call(analyser,destination);return destination;
    }
    return connect.call(this,destination,...args);
  };
  const start=AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start=function(...args){
    if(this.context instanceof AudioContext){loops.add(this);this.addEventListener('ended',()=>loops.delete(this));}
    return start.apply(this,args);
  };
  window.__audioProbe=()=>({loops:loops.size,rms:analysers.map(a=>{const d=new Float32Array(a.fftSize);a.getFloatTimeDomainData(d);return Math.sqrt(d.reduce((s,x)=>s+x*x,0)/d.length);})});
});
const read=()=>page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__);
const hook=(name,arg)=>page.evaluate(({name,arg})=>window.__THREE_GAME_TEST_HOOKS__[name](arg),{name,arg});
const probe=()=>page.evaluate(()=>window.__audioProbe());
const waitAudio=()=>page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__?.audio.sources===1,{},{timeout:30000});
const finish=async()=>{await hook('setPausedForScreenshot',false);await hook('cupNearFinish');await page.keyboard.down('KeyW');await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__.mode==='finished');await page.keyboard.up('KeyW');};
try{
  await page.goto('http://localhost:5173/?test=1&v=music-v1');
  await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__?.frame>2);
  assert.equal((await read()).audio.context,'locked');assert.equal((await read()).audio.sources,0);
  await page.click('#cup-select');await page.click('#start');await waitAudio();await page.waitForTimeout(350);
  assert.equal((await read()).audio.track,'mushroom');assert.equal((await read()).audio.bpm,144);
  const audible=await probe();assert.equal(audible.loops,1);assert(audible.rms[0]>.003);
  checks.push('no autoplay before gesture; start plays one audible mushroom music loop at144BPM');
  await page.click('#sound');await page.waitForTimeout(250);
  assert((await read()).audio.muted);assert((await probe()).rms[0]<.0001);
  await page.click('#sound');await page.waitForTimeout(200);assert((await probe()).rms[0]>.003);
  checks.push('master mute/unmute reaches music, engine and cues without adding another loop');
  await page.keyboard.press('Escape');await page.waitForTimeout(150);const paused=(await read()).audio;
  assert.equal(paused.sources,0);assert.equal((await probe()).loops,0);assert((await probe()).rms[0]<.0001);
  await page.waitForTimeout(200);assert.equal((await read()).audio.position,paused.position);
  await page.locator('.audio-settings summary').click();
  await page.locator('#music-volume').fill('23');await page.locator('#effects-volume').fill('38');
  await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__.audio.musicVolume===.23&&window.__THREE_GAME_DIAGNOSTICS__.audio.effectsVolume===.38);
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:out+'/mobile-mix.png'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('#resume').click();await waitAudio();await page.waitForTimeout(150);
  const resumed=(await read()).audio;assert(resumed.position>=paused.position&&resumed.position<paused.position+1);
  assert.equal((await probe()).loops,1);checks.push('pause is silent, preserves phrase position; mobile music/effects sliders work independently; resume does not stack');
  await hook('cupNearFinish');await hook('setPausedForScreenshot',true);
  await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__.audio.finalLap);
  assert.equal((await read()).audio.bpm,162);assert.equal((await probe()).loops,1);
  await finish();await page.waitForTimeout(1000);assert.equal((await read()).audio.sources,0);assert.equal((await probe()).loops,0);
  await page.locator('#resume').click();await waitAudio();assert.equal((await read()).audio.track,'castle');assert.equal((await read()).audio.bpm,152);
  assert.equal((await read()).audio.finalLap,false);assert.equal((await probe()).loops,1);
  checks.push('last lap lifts tempo/key without restarting music; finish stops race loop; next cup stage plays distinct castle arrangement at152BPM');
  await page.keyboard.press('Escape');await page.locator('#restart').click();await waitAudio();
  assert.equal((await probe()).loops,1);assert((await read()).audio.position<2);
  await page.keyboard.press('Escape');await page.locator('#home').click();await page.waitForTimeout(200);
  assert.equal((await probe()).loops,0);await page.reload();await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__?.frame>2);
  await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__.audio.musicVolume===.23&&window.__THREE_GAME_DIAGNOSTICS__.audio.effectsVolume===.38);
  checks.push('restart resets arrangement; home stops music; saved mix survives reload');
  await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new DOMException('blocked','QuotaExceededError');};});
  await page.click('#sound');await page.click('#sound');await page.click('#start');await waitAudio();
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForTimeout(200);assert.equal((await read()).mode,'paused');assert.equal((await probe()).loops,0);assert((await probe()).rms[0]<.0001);
  checks.push('unavailable storage does not break audio controls; backgrounding pauses game and stops audio');
  assert.deepEqual(errors,[]);
  await fs.writeFile(out+'/browser.json',JSON.stringify({passed:true,checks,audible,errors},null,2));
  console.log(JSON.stringify({passed:true,checks,errors},null,2));
}finally{await browser.close();}
