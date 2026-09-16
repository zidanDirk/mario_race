import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApplication} from '../server/app.mjs';
import {readConfig} from '../server/config.mjs';
import {rulesVersion} from '../server/store.mjs';
import {dailyTasks,dayKey} from '../shared/progression.mjs';

async function fixture(fn){
 const dir=await mkdtemp(join(tmpdir(),'mario-growth-'));let now=Date.parse('2026-09-12T12:00:00Z');
 const config=readConfig({PUBLIC_ORIGIN:'http://127.0.0.1:5173',DEV_AUTH_ENABLED:'true',DATABASE_PATH:join(dir,'race.sqlite')});
 let app=createApplication({config,now:()=>now});
 async function listen(){await new Promise(r=>app.server.listen(0,'127.0.0.1',r));config.origin=config.appOrigin=config.apiOrigin=`http://127.0.0.1:${app.server.address().port}`;}
 await listen();
 const c={get app(){return app;},setNow:value=>now=value,advance:ms=>now+=ms,now:()=>now,
   async request(path,data,cookie=''){const res=await fetch(config.origin+path,{method:data===undefined?'GET':'POST',headers:{Origin:config.origin,'Content-Type':'application/json',Cookie:cookie},body:data===undefined?undefined:JSON.stringify(data)});return {status:res.status,json:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};},
   async login(){return (await this.request('/api/auth/dev',{displayName:'成长测试'})).cookie;},
   async start(cookie,mode='time-trial',difficulty='standard'){const response=await this.request('/api/races',{character:'mario',mode,difficulty,rulesVersion:rulesVersion(mode)},cookie);assert.equal(response.status,201);return response.json.raceId;},
   async finish(cookie,id,metrics={orangeDrifts:3,coinsCollected:10,rescues:0,shortcutClears:2}){return this.request(`/api/races/${id}/finish`,{character:'mario',timeMs:50000,position:1,coins:7,...(metrics===null?{}:{metrics})},cookie);},
   async reopen(){await app.close();app=createApplication({config,now:()=>now});await listen();},
 };
 try{await fn(c);}finally{await app.close();await rm(dir,{recursive:true,force:true});}
}
test('authenticated, origin checked growth; default equipment locked',()=>fixture(async c=>{assert.equal((await c.request('/api/progression')).status,401);const cookie=await c.login();const v=await c.request('/api/progression',undefined,cookie);assert.equal(v.json.xp,0);assert.equal(v.json.tasks.length,3);assert.equal((await c.request('/api/progression/equip',{paint:'mint',trail:'standard',title:'rookie'},cookie)).status,400);const res=await fetch(c.app.server.address().port?`http://127.0.0.1:${c.app.server.address().port}/api/progression/equip`:'',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:'{}'});assert.equal(res.status,403);}));
test('finish transaction grants once; retry and changed metrics cannot duplicate rewards',()=>fixture(async c=>{const cookie=await c.login(),id=await c.start(cookie);c.advance(55000);const first=await c.finish(cookie,id);assert.equal(first.status,200);assert.equal(first.json.progression.xp,300);assert.deepEqual((await c.finish(cookie,id)).json,first.json);assert.equal((await c.finish(cookie,id,{orangeDrifts:2,coinsCollected:10,rescues:0,shortcutClears:2})).status,409);assert.equal((await c.request('/api/progression',undefined,cookie)).json.xp,300);}));
test('bad telemetry never finishes race or grants XP',()=>fixture(async c=>{const cookie=await c.login(),id=await c.start(cookie);c.advance(55000);assert.equal((await c.finish(cookie,id,{orangeDrifts:999999,coinsCollected:10,rescues:0,shortcutClears:2})).status,400);assert.equal((await c.request('/api/progression',undefined,cookie)).json.xp,0);assert.equal(c.app.db.prepare('SELECT finished_at FROM races WHERE id=?').get(id).finished_at,null);}));
test('Beijing midnight uses ticket start day; account growth survives restart and equipment shows on boards',()=>fixture(async c=>{const cookie=await c.login();c.setNow(Date.parse('2026-09-12T15:59:40Z'));let id=await c.start(cookie);c.advance(55000);let r=await c.finish(cookie,id);assert.equal(r.json.progression.day,'2026-09-13');assert.equal(r.json.progression.xp,300);assert(r.json.progression.tasks.every(t=>t.progress===0));id=await c.start(cookie);c.advance(55000);r=await c.finish(cookie,id);assert.equal(r.json.progression.xp,600);const equipment={paint:'mint',trail:'violet',title:'star'};assert.deepEqual((await c.request('/api/progression/equip',equipment,cookie)).json.equipped,equipment);await c.reopen();assert.equal((await c.request('/api/progression',undefined,cookie)).json.xp,600);assert.deepEqual((await c.request('/api/progression',undefined,cookie)).json.equipped,equipment);const board=await c.request('/api/leaderboard?mode=time-trial');assert.equal(board.json.entries[0].title,'star');}));
test('different accounts do not share progress or equipment, missing legacy metrics do not earn clean',()=>fixture(async c=>{const a=await c.login(),b=await c.login();const d=['2026-09-12','2026-09-13','2026-09-14','2026-09-15'].find(d=>dailyTasks(d).some(t=>t.id==='clean'));c.setNow(Date.parse(d+'T12:00:00Z'));const id=await c.start(a);c.advance(55000);assert.equal((await c.finish(b,id)).status,404);const r=await c.finish(a,id,null);assert.equal(r.status,200);assert.equal(r.json.progression.tasks.find(t=>t.id==='clean').complete,false);assert.equal((await c.request('/api/progression',undefined,b)).json.xp,0);assert.equal(dayKey(c.now()),d);}));


test('casual Grand Prix earns daily growth once and retains records without affecting standard leaderboard',()=>fixture(async c=>{
 const cookie=await c.login(),id=await c.start(cookie,'grand-prix','casual');c.advance(55000);
 const first=await c.finish(cookie,id);assert.equal(first.status,200);assert.equal(first.json.difficulty,'casual');assert(first.json.progression.xp>0);
 assert.deepEqual((await c.finish(cookie,id)).json,first.json);
 assert.equal((await c.request('/api/leaderboard')).json.entries.length,0);
 assert.deepEqual((await c.request('/api/me',undefined,cookie)).json.stats,{bestTimeMs:null,rank:null,totalRaces:0});
 await c.reopen();assert.equal((await c.request('/api/progression',undefined,cookie)).json.xp,first.json.progression.xp);
 const ranked=await c.start(cookie,'grand-prix');c.advance(55000);const saved=await c.finish(cookie,ranked);assert.equal(saved.status,200);assert.equal(saved.json.rank,1);assert.equal(saved.json.totalRaces,1);
 assert.equal(c.app.db.prepare('SELECT COUNT(*) n FROM races WHERE finished_at IS NOT NULL').get().n,2);
}));
