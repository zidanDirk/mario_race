import {chromium} from '@playwright/test';
import {build} from 'esbuild';
import {readFile,mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createApplication} from '../server/app.mjs';
import {readConfig} from '../server/config.mjs';

const out='artifacts/progression-v1/cloud';await mkdir(out,{recursive:true});
const dir=await mkdtemp(join(tmpdir(),'mario-growth-browser-'));let now=Date.parse('2026-09-12T12:00:00Z');
const config=readConfig({PUBLIC_ORIGIN:'http://127.0.0.1:5173',DEV_AUTH_ENABLED:'true',DATABASE_PATH:join(dir,'race.sqlite')});
const app=createApplication({config,now:()=>now});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));config.origin=config.appOrigin=config.apiOrigin=`http://127.0.0.1:${app.server.address().port}`;
const bundle=await build({stdin:{contents:`import {mountCloud} from './src/cloud.ts';import {mountProgression} from './src/progression.ts';window.growth=mountProgression({isTest:false,onOpen(){},onEquip(v){window.equipped=v}});window.cloud=mountCloud({isTest:false,onOpen(){},onAccount:id=>window.growth.setAccount(id),onProgress:v=>window.growth.acceptCloud(v)});`,resolveDir:resolve('.')},bundle:true,write:false,format:'esm',loader:{'.css':'empty'}});
const css=(await readFile('src/cloud.css','utf8'))+(await readFile('src/progression.css','utf8'));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/__growth.js',r=>r.fulfill({contentType:'text/javascript',body:bundle.outputFiles[0].text}));
await page.route('**/__growth',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html lang="zh"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><style>body{background:#b9e0da;font-family:sans-serif}.toolbar{display:flex;gap:12px;padding:20px}#result{margin:40px;max-width:500px}${css}</style></head><body><div id="app"><nav class="toolbar"></nav><div id="result"></div></div><script type="module" src="/__growth.js"></script></body></html>`}));
async function login(){await page.getByRole('button',{name:'用户登录与云端排行榜'}).click();await page.waitForFunction(()=>!document.querySelector('.cloud-refresh').disabled);await page.getByLabel('本地开发测试（非邮箱 / Google 登录）').fill('成长联调车手');await page.getByRole('button',{name:'测试登录',exact:true}).click();await page.getByRole('heading',{name:'成长联调车手',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('.growth-account').textContent.includes('账号成长'));await page.getByRole('button',{name:'关闭排行榜'}).click();}
async function finish(){const ticket=page.waitForResponse(r=>r.url().endsWith('/api/races')&&r.status()===201);await page.evaluate(()=>{window.growth.startRace('time-trial');window.cloud.startRace('mario','time-trial');});await ticket;now+=55000;await page.evaluate(()=>{const metrics={orangeDrifts:3,coinsCollected:10,rescues:0,shortcutClears:2};window.growth.finishRace(metrics);window.cloud.finishRace({character:'mario',timeMs:50000,position:1,coins:7,metrics});});}
try{
 await page.goto(config.origin+'/__growth');await page.waitForFunction(()=>window.cloud&&window.growth);await login();
 let failSave=true;await page.route('**/api/races/*/finish',async r=>{if(failSave){failSave=false;await r.abort();}else await r.continue();});
 await finish();await page.getByRole('button',{name:'重试保存'}).waitFor();assert.equal((await page.evaluate(()=>window.growth.getSnapshot())).xp,0);await page.getByRole('button',{name:'重试保存'}).click();await page.waitForFunction(()=>window.growth.getSnapshot().xp===300);assert.match(await page.locator('.growth-result').textContent(),/云端成长已保存/);
 assert.equal(app.db.prepare('SELECT COUNT(*) n FROM races WHERE finished_at IS NOT NULL').get().n,1);checks.push('real authenticated finish failure/retry awards once and only after server confirmation');
 now+=86400000;await finish();await page.waitForFunction(()=>window.growth.getSnapshot().xp===600);await page.getByRole('button',{name:'每日挑战与车手成长'}).click();
 let failEquip=true;await page.route('**/api/progression/equip',async r=>{if(failEquip){failEquip=false;await r.abort();}else await r.continue();});await page.getByRole('button',{name:'装备薄荷车漆',exact:true}).click();await page.locator('.growth-notice').filter({hasText:'装备未保存'}).waitFor();assert.equal(await page.evaluate(()=>window.equipped.paint),'standard');
 for(const name of ['薄荷车漆','紫色尾焰','星光车手']){await page.getByRole('button',{name:`装备${name}`,exact:true}).click();await page.getByRole('button',{name:`恢复默认${name}`,exact:true}).waitFor();}
 await page.screenshot({path:`${out}/account-rewards.png`});assert.deepEqual(await page.evaluate(()=>window.equipped),{paint:'mint',trail:'violet',title:'star'});checks.push('three rewards unlock; failed equipment stays unchanged and retry persists all cosmetics');
 await page.reload();await page.waitForFunction(()=>window.equipped?.title==='star');await page.getByRole('button',{name:'用户登录与云端排行榜'}).click();await page.getByRole('button',{name:'计时挑战榜',exact:true}).click();await page.locator('.cloud-rank-you small').filter({hasText:'星光车手'}).waitFor();await page.screenshot({path:`${out}/title-leaderboard.png`});
 await page.getByRole('button',{name:'退出登录',exact:true}).click();await page.getByRole('heading',{name:'游客车手',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.growth.getSnapshot().xp),0);assert.equal(await page.evaluate(()=>window.equipped.paint),'standard');await page.getByRole('button',{name:'关闭排行榜'}).click();checks.push('reload restores account equipment; title appears on leaderboard; logout removes account cosmetics');
 await login();await page.getByRole('button',{name:'每日挑战与车手成长'}).click();await page.waitForFunction(()=>!document.querySelector('.growth-level small').textContent.includes('正在读取'));assert.equal(await page.evaluate(()=>window.growth.getSnapshot().xp),0);await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${out}/new-account-mobile.png`});assert.equal(await page.locator('.growth-dialog').evaluate(el=>el.scrollWidth>el.clientWidth),false);checks.push('new login has separate zero progression and mobile UI fits');
 assert.deepEqual(errors,[]);const report={passed:true,checks,errors,scope:'real local HTTP and SQLite with explicit dev login; race telemetry submitted by test harness'};await writeFile(out+'/browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){await page.screenshot({path:out+'/failure.png'});console.log(await page.locator('body').innerText());throw error;}finally{await browser.close();await app.close();await rm(dir,{recursive:true,force:true});}
