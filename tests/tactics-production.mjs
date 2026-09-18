import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApplication} from '../server/app.mjs';
import {readConfig} from '../server/config.mjs';

const dir=await mkdtemp(join(tmpdir(),'tactics-production-'));
const config=readConfig({PUBLIC_ORIGIN:'http://127.0.0.1:5173',DATABASE_PATH:join(dir,'test.sqlite'),DEV_AUTH_ENABLED:'true'});
let now=Date.now();const app=createApplication({config,now:()=>now});
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));config.origin=`http://127.0.0.1:${app.server.address().port}`;config.apiOrigin=config.appOrigin=config.origin;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-gl=angle','--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],starts=[],finishes=[];
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()!=='POST')return;if(r.url().endsWith('/api/races'))starts.push(r.postDataJSON());if(r.url().includes('/finish'))finishes.push(r.postDataJSON());});
async function start(){const res=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/api/races'));await page.click('#start');const response=await res;assert.equal(response.status(),201);return response.json();}
try{
 await page.goto(config.origin);await page.locator('#loading').waitFor({state:'detached'});assert.equal(await page.evaluate(()=>typeof window.__THREE_GAME_TEST_HOOKS__),'undefined');
 await page.getByRole('button',{name:'用户登录与云端排行榜'}).click();await page.getByLabel('本地开发测试（非邮箱 / Google 登录）').fill('配置联调车手');await page.getByRole('button',{name:'测试登录',exact:true}).click();await page.getByRole('heading',{name:'配置联调车手',exact:true}).waitFor();await page.getByRole('button',{name:'关闭排行榜'}).click();
 await page.click('#loadout-open');await page.click('[data-loadout=speed]');await page.keyboard.press('Escape');const ticket=await start();assert.equal(ticket.loadout,'speed');assert.equal(starts[0].rulesVersion,6);assert.equal(starts[0].loadout,'speed');
 await page.keyboard.press('Escape');await page.click('#home');await page.click('#loadout-open');const before=await page.evaluate(()=>({...localStorage}));await page.click('#tactics-practice');
 // Let production practice expire without test hooks, input or clock injection.
 await page.getByRole('heading',{name:'极速型 · 试驾完成'}).waitFor({timeout:50000});
 assert.equal(starts.length,1);assert.equal(finishes.length,0);assert.deepEqual(await page.evaluate(()=>({...localStorage})),before);
 assert.equal(app.db.prepare('SELECT COUNT(*) n FROM races').get().n,1);assert.equal(app.db.prepare('SELECT COUNT(*) n FROM races WHERE finished_at IS NOT NULL').get().n,0);
 await page.screenshot({path:'artifacts/tactics-v1/production-practice.png'});await page.click('#home');await page.click('[data-loadout=drift]');await page.keyboard.press('Escape');await page.click('[data-race-mode=time-trial]');await start();assert.equal(starts[1].rulesVersion,5);assert.equal(starts[1].loadout,'drift');
 await page.keyboard.press('Escape');await page.click('#home');
 // Explicit server-time fixture creates a leaderboard entry through the real HTTP finish endpoint.
 // Actual driving/finish recording is verified separately by tactics-race.mjs.
 now+=60000;const finish=await page.request.post(config.origin+`/api/races/${ticket.raceId}/finish`,{headers:{Origin:config.origin},data:{character:'mario',timeMs:50000,position:1,coins:4,loadout:'speed'}});assert.equal(finish.status(),200);assert.equal((await finish.json()).loadout,'speed');
 await page.click('[data-race-mode=grand-prix]');await page.getByRole('button',{name:'用户登录与云端排行榜'}).click();await page.locator('.cloud-board').getByText('极速型',{exact:false}).waitFor();await page.screenshot({path:'artifacts/tactics-v1/cloud-loadout.png'});
 assert.deepEqual(errors,[]);const report={passed:true,checks:['production build has no QA hooks','signed-in GP binds speed/rules6; TT binds drift/rules5','20 seconds of production practice writes no local or cloud results','HTTP finish fixture preserves bound loadout and rendered leaderboard identifies it'],starts,errors};await writeFile('artifacts/tactics-v1/production.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await app.close();await rm(dir,{recursive:true,force:true});}
