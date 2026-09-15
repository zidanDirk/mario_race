import{chromium}from'@playwright/test';
import assert from'node:assert/strict';
import{mkdtemp,rm,writeFile,readdir}from'node:fs/promises';
import{tmpdir}from'node:os';import{join}from'node:path';
import{createApplication}from'../server/app.mjs';import{readConfig}from'../server/config.mjs';
const dir=await mkdtemp(join(tmpdir(),'audio-production-'));
const config=readConfig({PUBLIC_ORIGIN:'http://127.0.0.1:5173',DATABASE_PATH:join(dir,'test.sqlite')});
const app=createApplication({config});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
config.origin=`http://127.0.0.1:${app.server.address().port}`;config.apiOrigin=config.appOrigin=config.origin;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-gl=angle','--use-angle=metal']});
const page=await browser.newPage(),errors=[],checks=[],requests=[];
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().endsWith('.mp3'))requests.push(r.url());});
await page.addInitScript(()=>{
  const loops=new Set(),start=AudioBufferSourceNode.prototype.start;
  window.__musicProbe=()=>loops.size;
  AudioBufferSourceNode.prototype.start=function(...args){
    if(this.loop){loops.add(this);this.addEventListener('ended',()=>loops.delete(this));}
    return start.apply(this,args);
  };
});
try{
  await page.goto(config.origin);await page.locator('#loading').waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>typeof window.__THREE_GAME_TEST_HOOKS__),'undefined');
  assert.equal(requests.length,0);
  const started=Date.now();await page.click('#start');
  await page.waitForFunction(()=>window.__musicProbe()===1,{},{timeout:8000});
  const startToMusicMs=Date.now()-started;assert(startToMusicMs<6000);assert.equal(requests.length,1);
  await page.keyboard.press('Escape');await page.waitForFunction(()=>window.__musicProbe()===0);
  checks.push('built ordinary URL starts audible loop within countdown, lazily requests only current track, and pauses cleanly');
  const files=(await readdir('dist/assets')).filter(f=>f.endsWith('.mp3'));
  const decoded=[];
  for(const file of files){
    const response=await page.request.get(config.origin+'/assets/'+file);
    assert.equal(response.status(),200);assert.match(response.headers()['content-type'],/audio\/mpeg/);
    const result=await page.evaluate(async url=>{
      const bytes=await(await fetch(url)).arrayBuffer(),ctx=new OfflineAudioContext(2,1,48000),b=await ctx.decodeAudioData(bytes);
      let peak=0,sum=0,boundary=0;
      for(let c=0;c<2;c++){const d=b.getChannelData(c);boundary=Math.max(boundary,Math.abs(d[0]-d[d.length-1]));for(const x of d){peak=Math.max(peak,Math.abs(x));sum+=x*x;}}
      return {duration:b.duration,peak,rms:Math.sqrt(sum/(b.length*2)),boundary};
    },config.origin+'/assets/'+file);
    const bpm=file.startsWith('castle')?152:144;
    assert(Math.abs(result.duration-128*60/bpm)<.003);assert(result.peak<.95);assert(result.rms>.05);assert(result.boundary<.025);
    decoded.push({file,...result});
  }
  checks.push('both compressed tracks decode to exact32bar loops without clipping or audible-sized boundary discontinuities');
  await page.goto(config.origin);await page.locator('#loading').waitFor({state:'detached'});
  await page.route('**/*.mp3',route=>route.abort());await page.click('#start');
  await page.waitForTimeout(4500);await page.keyboard.press('Escape');assert(await page.locator('#resume').isVisible());
  await page.unroute('**/*.mp3');await page.click('#resume');
  await page.waitForFunction(()=>window.__musicProbe()===1);
  checks.push('asset failure keeps racing/controls usable; resume gesture successfully retries');
  assert.deepEqual(errors,[]);
  await writeFile('artifacts/audio-v1/production.json',JSON.stringify({passed:true,checks,startToMusicMs,decoded,errors},null,2));
  console.log(JSON.stringify({passed:true,checks,startToMusicMs,decoded,errors},null,2));
}finally{await browser.close();await app.close();await rm(dir,{recursive:true,force:true});}
