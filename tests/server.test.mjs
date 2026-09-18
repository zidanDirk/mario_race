import {DatabaseSync} from 'node:sqlite';
import {openStore, stats, leaderboard, rulesVersion} from '../server/store.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, mkdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createApplication} from '../server/app.mjs';
import {readConfig} from '../server/config.mjs';

const ORIGIN = 'http://localhost:5173';
const credentials = {GOOGLE_CLIENT_ID:'google-client', GOOGLE_CLIENT_SECRET:'google-private-secret', WECHAT_APP_ID:'wechat-client', WECHAT_APP_SECRET:'wechat-private-secret'};
async function fixture(t, extra = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'mario-server-test-'));
  await mkdir(join(directory, 'public'));
  await writeFile(join(directory, 'public/index.html'), '<!doctype html><title>Race test</title>');
  await writeFile(join(directory, 'public/.env'), 'PRIVATE_SECRET');
  await writeFile(join(directory, 'outside.txt'), 'OUTSIDE_SECRET');
  let time = 1_800_000_000_000;
  const calls = [];
  const fetchImpl = async (input, options) => {
    const url = new URL(input);
    calls.push({url, options});
    let data;
    if (url.hostname === 'oauth2.googleapis.com') {
      const code = options.body.get('code');
      data = code === 'fail' ? {error:'provider-private-error'} : {access_token:`google-access-${code}`};
    } else if (url.hostname === 'openidconnect.googleapis.com') {
      const subject = options.headers.Authorization.slice('Bearer google-access-'.length);
      data = {sub:subject, name:`Google ${subject}`, picture:'https://example.com/avatar.png', email:'private@example.com'};
    } else if (url.pathname.endsWith('/access_token')) {
      const code = url.searchParams.get('code');
      data = code === 'fail' ? {errcode:40029, errmsg:'private-provider-detail'} : {access_token:`wechat-access-${code}`, openid:`wechat-openid-${code}`};
    } else {
      data = {openid:url.searchParams.get('openid').endsWith('-mismatch') ? 'unexpected-openid' : url.searchParams.get('openid'), nickname:'微信车手', headimgurl:'http://insecure.example/avatar.png', unionid:'private-union-id'};
    }
    return {ok:true, json:async () => data};
  };
  const config = {...readConfig({PUBLIC_ORIGIN:ORIGIN, DEV_AUTH_ENABLED:'true', ...credentials}), dbPath:join(directory,'race.sqlite'), staticDir:join(directory,'public'), ...extra};
  let app;
  let base;
  async function start() {
    app = createApplication({config, now:() => time, fetchImpl});
    await new Promise((resolve, reject) => {app.server.once('error',reject);app.server.listen(0,'127.0.0.1',resolve);});
    base = `http://127.0.0.1:${app.server.address().port}`;
  }
  await start();
  t.after(async () => {if (app.server.listening) await app.close();await rm(directory,{recursive:true,force:true});});
  function client() {
    const jar = new Map();
    async function request(path, {method='GET', data, origin=ORIGIN, cookie, headers={}} = {}) {
      const response = await fetch(base + path, {method, redirect:'manual', headers:{...(method==='POST'?{'Content-Type':'application/json',Origin:origin}:{}), Cookie:cookie ?? [...jar].map(([k,v])=>`${k}=${v}`).join('; '), ...headers}, ...(data===undefined?{}:{body:JSON.stringify(data)})});
      for (const value of response.headers.getSetCookie()) {const pair=value.split(';')[0];const index=pair.indexOf('=');jar.set(pair.slice(0,index),pair.slice(index+1));}
      const text = await response.text();
      return {status:response.status, headers:response.headers, text, json:text.startsWith('{')?JSON.parse(text):null};
    }
    return {request,jar};
  }
  return {client, calls, config, advance:ms=>{time+=ms;}, restart:async()=>{await app.close();await start();}, get db(){return app.db;}};
}
async function login(client, provider='google', code='test-subject') {
  const begin=await client.request(`/api/auth/${provider}`);
  assert.equal(begin.status,302);
  const authorization=new URL(begin.headers.get('location'));
  const response=await client.request(`/api/auth/${provider}/callback?state=${authorization.searchParams.get('state')}&code=${code}`);
  assert.equal(response.headers.get('location'),`${ORIGIN}/?auth=success`);
  return {authorization,response};
}
const score = (timeMs=50_000, extra={}) => ({timeMs,position:1,coins:5,character:'mario',...extra});
async function beginRace(client, character='mario', mode, difficulty) {
  const response=await client.request('/api/races',{method:'POST',data:{character,rulesVersion:rulesVersion(mode),...(mode===undefined?{}:{mode}),...(difficulty===undefined?{}:{difficulty})}});
  assert.equal(response.status,201,response.text);
  return response.json.raceId;
}
const finishRace = (client,id,data=score()) => client.request(`/api/races/${id}/finish`,{method:'POST',data});

test('configuration forbids production/public dev authentication, insecure origins and partial credentials', () => {
  for (const env of [
    {NODE_ENV:'production',PUBLIC_ORIGIN:'https://race.example',DEV_AUTH_ENABLED:'true'},
    {PUBLIC_ORIGIN:'https://race.example',DEV_AUTH_ENABLED:'true'},
    {NODE_ENV:'production',PUBLIC_ORIGIN:'http://localhost:5173'},
    {PUBLIC_ORIGIN:'http://race.example'}, {PUBLIC_ORIGIN:'https://race.example/path'},
    {PUBLIC_ORIGIN:'https://user:pass@race.example'}, {GOOGLE_CLIENT_ID:'only-id'}, {WECHAT_APP_SECRET:'only-secret'},
    {NODE_ENV:'production',APP_ORIGIN:'https://game.example',API_ORIGIN:'http://api.example'},
    {APP_ORIGIN:'https://game.example/path',API_ORIGIN:'https://api.example'},
    {APP_ORIGIN:'https://game.example',APP_RETURN_PATH:'marace/',API_ORIGIN:'https://api.example'},
    {APP_ORIGIN:'https://game.example',APP_RETURN_PATH:'/marace',API_ORIGIN:'https://api.example'},
    {APP_ORIGIN:'https://game.example',APP_RETURN_PATH:'/marace/?x=1',API_ORIGIN:'https://api.example'},
    {APP_ORIGIN:'https://game.example',API_ORIGIN:'https://api.example',COOKIE_SAME_SITE:'invalid'},
    {APP_ORIGIN:'http://localhost:5173',API_ORIGIN:'http://localhost:3001',COOKIE_SAME_SITE:'None'},
  ]) assert.throws(()=>readConfig(env));
  assert.equal(readConfig({PUBLIC_ORIGIN:'https://race.example',NODE_ENV:'production'}).devLogin,false);
});

test('guest access, CSRF, local dev login, session privacy and logout', async t => {
  const f=await fixture(t), c=f.client();
  assert.deepEqual((await c.request('/api/me')).json,{user:null,stats:null,mode:'grand-prix'});
  assert.equal((await c.request('/api/races',{method:'POST',data:{character:'mario'}})).status,401);
  for (const origin of ['https://attacker.example','null','']) assert.equal((await c.request('/api/auth/dev',{method:'POST',origin,data:{}})).status,403);
  const signed=await c.request('/api/auth/dev',{method:'POST',data:{displayName:'\u0000 本地测试 '}});
  assert.equal(signed.status,200);
  assert.match(signed.headers.get('set-cookie'),/HttpOnly; SameSite=Lax/);
  const me=await c.request('/api/me');
  assert.equal(me.json.user.displayName,'本地测试');
  assert.equal(me.json.user.provider,'dev');
  assert.deepEqual(me.json.stats,{bestTimeMs:null,rank:null,totalRaces:0});
  assert.deepEqual(Object.keys(me.json.user).sort(),['avatarUrl','displayName','id','provider']);
  const oldCookie=[...c.jar].map(([k,v])=>`${k}=${v}`).join('; ');
  assert.equal((await c.request('/api/logout',{method:'POST',origin:'https://attacker.example',data:{}})).status,403);
  assert.equal((await c.request('/api/logout',{method:'POST',data:{}})).status,200);
  assert.equal((await c.request('/api/me',{cookie:oldCookie})).json.user,null);
});

test('Google OAuth uses state binding, PKCE, server token exchange and private identity', async t => {
  const f=await fixture(t),c=f.client();
  const {authorization,response}=await login(c);
  assert.equal(authorization.origin,'https://accounts.google.com');
  assert.equal(authorization.searchParams.get('redirect_uri'),`${ORIGIN}/api/auth/google/callback`);
  assert.equal(authorization.searchParams.get('code_challenge_method'),'S256');
  assert.equal(authorization.searchParams.get('scope'),'openid profile');
  const exchange=f.calls[0];
  assert.equal(exchange.options.body.get('client_secret'),credentials.GOOGLE_CLIENT_SECRET);
  assert.equal(createHash('sha256').update(exchange.options.body.get('code_verifier')).digest('base64url'),authorization.searchParams.get('code_challenge'));
  assert.equal(exchange.options.redirect,'error');
  assert.equal(f.calls[1].options.headers.Authorization,'Bearer google-access-test-subject');
  const me=await c.request('/api/me');
  assert.equal(me.json.user.provider,'google');
  assert.equal(me.json.user.displayName,'Google test-subject');
  for (const value of ['google-private-secret','google-access-test-subject','private@example.com','"subject"','"hash"']) assert.ok(!me.text.includes(value));
  assert.ok(!response.headers.get('location').includes('access'));
  const id=me.json.user.id;
  const oldSession=c.jar.get('mario_session');
  await login(c);
  assert.equal((await c.request('/api/me')).json.user.id,id,'same provider identity keeps the same user');
  assert.equal((await c.request('/api/me',{cookie:`mario_session=${oldSession}`})).json.user,null,'login rotates and revokes old session');
});

test('WeChat QR OAuth verifies OpenID and never returns private provider identifiers', async t => {
  const f=await fixture(t),c=f.client();
  const {authorization}=await login(c,'wechat','wechat-person');
  assert.equal(authorization.origin,'https://open.weixin.qq.com');
  assert.equal(authorization.pathname,'/connect/qrconnect');
  assert.equal(authorization.searchParams.get('scope'),'snsapi_login');
  assert.equal(authorization.searchParams.get('appid'),credentials.WECHAT_APP_ID);
  assert.equal(f.calls[0].url.searchParams.get('secret'),credentials.WECHAT_APP_SECRET);
  const me=await c.request('/api/me');
  assert.equal(me.json.user.provider,'wechat');
  assert.equal(me.json.user.avatarUrl,'','unsafe avatar protocols are rejected');
  for (const privateValue of ['openid','unionid','wechat-private-secret','wechat-access','private-union-id']) assert.ok(!me.text.includes(privateValue));
});

test('OAuth rejects missing, wrong, cross-provider, expired and replayed state; consumes cancellation/error', async t => {
  const f=await fixture(t), c=f.client(), other=f.client();
  const start=async()=>new URL((await c.request('/api/auth/google')).headers.get('location')).searchParams.get('state');
  const callback=(client,state,query='code=person',provider='google')=>client.request(`/api/auth/${provider}/callback?state=${state}&${query}`);
  assert.equal((await callback(c,'')).headers.get('location'),`${ORIGIN}/?auth=error&reason=expired`);
  let state=await start();
  assert.equal((await callback(c,'wrong')).headers.get('location'),`${ORIGIN}/?auth=error&reason=expired`);
  assert.equal((await callback(other,state)).headers.get('location'),`${ORIGIN}/?auth=error&reason=expired`);
  assert.equal((await callback(c,state,'code=person','wechat')).headers.get('location'),`${ORIGIN}/?auth=error&reason=expired`);
  assert.equal(f.calls.length,0);
  assert.equal((await callback(c,state)).headers.get('location'),`${ORIGIN}/?auth=success`);
  assert.equal((await callback(c,state)).headers.get('location'),`${ORIGIN}/?auth=error&reason=expired`);
  state=await start(); f.advance(600_001);
  assert.equal((await callback(c,state)).headers.get('location'),`${ORIGIN}/?auth=error&reason=expired`);
  state=await start();
  assert.equal((await callback(c,state,'error=access_denied')).headers.get('location'),`${ORIGIN}/?auth=error&reason=cancelled`);
  assert.equal((await callback(c,state)).headers.get('location'),`${ORIGIN}/?auth=error&reason=expired`);
  state=await start();
  assert.equal((await callback(c,state,'code=fail')).headers.get('location'),`${ORIGIN}/?auth=error&reason=provider`);
  assert.equal((await callback(c,state)).headers.get('location'),`${ORIGIN}/?auth=error&reason=expired`);
  state=await start();
  assert.equal((await callback(c,state,'')).headers.get('location'),`${ORIGIN}/?auth=error&reason=invalid`);
});

test('WeChat rejects failed token exchange and mismatched profile identity without creating a session', async t => {
  const f=await fixture(t), c=f.client();
  for (const code of ['fail','mismatch']) {
    const begin=await c.request('/api/auth/wechat');
    const state=new URL(begin.headers.get('location')).searchParams.get('state');
    const callback=await c.request(`/api/auth/wechat/callback?state=${state}&code=${code}`);
    assert.equal(callback.headers.get('location'),`${ORIGIN}/?auth=error&reason=provider`);
    assert.equal((await c.request('/api/me')).json.user,null);
    assert.ok(!callback.text.includes('private-provider-detail'));
    assert.equal((await c.request(`/api/auth/wechat/callback?state=${state}&code=valid`)).headers.get('location'),`${ORIGIN}/?auth=error&reason=expired`);
  }
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM users').get().n,0);
});

test('race tickets enforce identity, session, timing, schema and idempotent immutable results', async t => {
  const f=await fixture(t),c=f.client(),other=f.client();
  await login(c,'google','one');await login(other,'google','two');
  assert.equal((await c.request('/api/races',{method:'POST',data:{character:'unknown'}})).status,400);
  const id=await beginRace(c);
  assert.equal((await finishRace(c,id)).status,400,'cannot finish before elapsed wall time');
  assert.equal((await finishRace(other,id)).status,404,'cannot write another user race');
  f.advance(60_000);
  for (const data of [score(29_999),score(1800_001),score(50_000.5),score(50_000,{position:0}),score(50_000,{position:7}),score(50_000,{coins:11}),score(50_000,{coins:-1}),score(50_000,{character:'luigi'})]) assert.equal((await finishRace(c,id,data)).status,400);
  const saved=await finishRace(c,id);
  assert(saved.json.progression && Number.isInteger(saved.json.progression.xp));
  const {progression: _progression, ...scoreReceipt}=saved.json;
  assert.deepEqual(scoreReceipt,{saved:true,mode:'grand-prix',difficulty:'standard',loadout:'light',bestTimeMs:50_000,rank:1,totalRaces:1});
  assert.deepEqual((await finishRace(c,id)).json,saved.json);
  assert.equal((await finishRace(c,id,score(51_000))).status,409);
  assert.equal((await finishRace(c,id,score(50_000,{coins:4}))).status,409);
  const oldRace=await beginRace(c);
  await login(c,'google','one'); f.advance(60_000);
  assert.equal((await finishRace(c,oldRace)).status,404,'same user new login cannot claim prior session ticket');
  const expired=await beginRace(c); f.advance(6*3600_000+1);
  assert.ok([404,410].includes((await finishRace(c,expired)).status));
});

test('leaderboard keeps ten distinct users, fastest result, stable ties, own rank outside top ten and persistence', async t => {
  const f=await fixture(t);const clients=[];
  for(let i=0;i<12;i++) {
    const c=f.client();clients.push(c);await login(c,'google',`player-${i}`);
    const id=await beginRace(c);f.advance(61_000);
    assert.equal((await finishRace(c,id,score(40_000+i*1000))).status,200);
  }
  const c=clients[0];const duplicate=await beginRace(c);f.advance(61_000);
  assert.equal((await finishRace(c,duplicate,score(60_000))).status,200);
  const tie=await beginRace(clients[2]);f.advance(61_000);
  assert.equal((await finishRace(clients[2],tie,score(41_000))).status,200);
  const leaderboard=(await c.request('/api/leaderboard')).json;
  assert.equal(leaderboard.entries.length,10);
  assert.equal(new Set(leaderboard.entries.map(e=>e.userId)).size,10);
  assert.deepEqual(leaderboard.entries.map(e=>e.rank),[1,2,3,4,5,6,7,8,9,10]);
  assert.equal(leaderboard.entries[0].bestTimeMs,40_000);
  assert.equal(leaderboard.entries[1].displayName,'Google player-1','earlier equal time wins tie');
  assert.equal(leaderboard.entries[2].displayName,'Google player-2');
  assert.deepEqual(Object.keys(leaderboard.entries[0]).sort(),['avatarUrl','bestTimeMs','character','displayName','loadout','rank','title','userId']);
  assert.equal((await clients[11].request('/api/me')).json.stats.rank,12);
  assert.equal((await c.request('/api/me')).json.stats.totalRaces,2);
  await f.restart();
  assert.deepEqual((await c.request('/api/leaderboard')).json,leaderboard);
  assert.equal((await c.request('/api/me')).json.stats.totalRaces,2,'sessions and scores survive reopening SQLite');
  f.advance(7*86400_000+1);
  assert.equal((await c.request('/api/me')).json.user,null,'sessions expire');
});

test('production disables dev endpoint, hides legacy dev scores, and sets secure cookies', async t => {
  const f=await fixture(t),c=f.client();
  await c.request('/api/auth/dev',{method:'POST',data:{displayName:'Dev'}});
  const id=await beginRace(c);f.advance(60_000);await finishRace(c,id);
  f.config.production=true;f.config.devLogin=false;f.config.secure=true;f.config.origin='https://race.example';f.config.apiOrigin='https://race.example';f.config.appOrigin='https://race.example';
  await f.restart();
  assert.equal((await c.request('/api/me')).json.user,null);
  assert.equal((await c.request('/api/leaderboard')).json.entries.length,0);
  assert.equal((await c.request('/api/auth/dev',{method:'POST',origin:'https://race.example',data:{}})).status,404);
  const begin=await c.request('/api/auth/google');
  assert.match(begin.headers.get('set-cookie'),/__Host-mario_oauth_google=.*; Path=\/; HttpOnly; SameSite=Lax; Max-Age=600; Secure/);
  assert.ok(begin.headers.get('strict-transport-security'));
});

test('public config excludes secrets, unconfigured providers fail gracefully, static paths cannot expose dotfiles/outside files', async t => {
  const f=await fixture(t,{google:{id:'',secret:''},wechat:{id:'',secret:''}}), c=f.client();
  assert.deepEqual((await c.request('/api/config')).json,{providers:{google:false,wechat:false},devLogin:true});
  assert.equal((await c.request('/api/auth/google')).headers.get('location'),`${ORIGIN}/?auth=error&reason=unconfigured`);
  assert.equal((await c.request('/')).status,200);
  for (const path of ['/.env','/%2eenv','/..%2foutside.txt','/%2e%2e%2foutside.txt','/server/config.mjs','/data/race.sqlite']) {
    const response=await c.request(path);assert.equal(response.status,404,path);
    assert.ok(!response.text.includes('SECRET'));
  }
  assert.equal((await c.request('/api/auth/dev',{method:'POST',data:{},headers:{'Content-Type':'text/plain'}})).status,415);
  assert.equal((await c.request('/api/auth/dev',{method:'POST',data:{displayName:'x'.repeat(5000)}})).status,413);
});

test('backend-only deployment allows one exact Kodo app origin and returns OAuth callbacks to it', async t => {
  const appOrigin='https://game.example';
  const apiOrigin='https://api.example';
  const f=await fixture(t,{appOrigin,appPath:'/marace/',apiOrigin,origin:apiOrigin,secure:true,serveStatic:false}),c=f.client();
  const config=await c.request('/api/config',{headers:{Origin:appOrigin}});
  assert.equal(config.status,200);
  assert.equal(config.headers.get('access-control-allow-origin'),appOrigin);
  assert.equal(config.headers.get('access-control-allow-credentials'),'true');
  assert.equal(config.headers.get('vary'),'Origin');
  const preflight=await c.request('/api/races',{method:'OPTIONS',headers:{Origin:appOrigin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}});
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers.get('access-control-allow-origin'),appOrigin);
  assert.match(preflight.headers.get('access-control-allow-methods'),/POST/);
  assert.equal((await c.request('/api/races',{method:'OPTIONS',headers:{Origin:'https://attacker.example'}})).status,403);
  const blocked=await c.request('/api/config',{headers:{Origin:'https://attacker.example'}});
  assert.equal(blocked.headers.get('access-control-allow-origin'),null);
  assert.equal((await c.request('/')).status,404,'backend-only image does not expose a static site');
  const begin=await c.request('/api/auth/google');
  const authorization=new URL(begin.headers.get('location'));
  assert.equal(authorization.searchParams.get('redirect_uri'),`${apiOrigin}/api/auth/google/callback`);
  const callback=await c.request(`/api/auth/google/callback?state=${authorization.searchParams.get('state')}&code=split-host`);
  assert.equal(callback.headers.get('location'),`${appOrigin}/marace/?auth=success`);
});

 test('course revision isolates historical best scores and rejects stale clients/tickets',async t=>{
 const f=await fixture(t),c=f.client();await login(c);
 assert.equal((await c.request('/api/races',{method:'POST',data:{character:'mario',rulesVersion:1}})).status,409);
 assert.equal((await c.request('/api/races',{method:'POST',data:{character:'mario'}})).status,409);
 const old=await beginRace(c);f.advance(60000);await finishRace(c,old);
 f.db.prepare('UPDATE races SET rules_version=2 WHERE id=?').run(old);
 assert.equal((await c.request('/api/leaderboard')).json.entries.length,0);
 assert.equal((await c.request('/api/me')).json.stats.bestTimeMs,null);
 assert.equal((await finishRace(c,old)).status,409);
 const fresh=await beginRace(c);f.advance(65000);assert.equal((await finishRace(c,fresh,score(62000))).status,200);
 assert.equal((await c.request('/api/leaderboard')).json.entries[0].bestTimeMs,62000);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM races WHERE finished_at IS NOT NULL').get().n,2);
 });


test('time trial tickets lock mode and reject invalid selectors and cross-mode submissions', async t => {
  const f=await fixture(t),c=f.client();
  for (const path of ['/api/me?mode=unknown','/api/me?mode=','/api/leaderboard?mode=unknown']) assert.equal((await c.request(path)).status,400);
  await login(c);
  for (const mode of ['unknown','',null,1,{}]) assert.equal((await c.request('/api/races',{method:'POST',data:{character:'mario',rulesVersion:2,mode}})).status,400);
  const id=await beginRace(c,'mario','time-trial');f.advance(60000);
  assert.equal(f.db.prepare('SELECT mode FROM races WHERE id=?').get(id).mode,'time-trial');
  for (const extra of [{mode:'grand-prix'},{mode:'unknown'},{mode:null},{position:2}]) assert.equal((await finishRace(c,id,score(50000,extra))).status,400);
  const saved=await finishRace(c,id,score(50000,{mode:'time-trial'}));
  assert(saved.json.progression && Number.isInteger(saved.json.progression.xp));
  const {progression: _progression, ...scoreReceipt}=saved.json;
  assert.deepEqual(scoreReceipt,{saved:true,mode:'time-trial',difficulty:'standard',loadout:'light',bestTimeMs:50000,rank:1,totalRaces:1});
  assert.deepEqual((await finishRace(c,id)).json,saved.json,'omitting optional mode still uses immutable ticket mode');
  assert.equal((await finishRace(c,id,score(50000,{mode:'grand-prix'}))).status,400,'idempotent retry cannot move scores');
  assert.deepEqual((await c.request('/api/me')).json.stats,{bestTimeMs:null,rank:null,totalRaces:0});
  assert.equal((await c.request('/api/leaderboard')).json.entries.length,0);
});

test('each mode has independent best time, race count, unique-user top ten and own ranking', async t => {
  const f=await fixture(t),clients=[];
  for(let i=0;i<12;i++) {
    const c=f.client();clients.push(c);await login(c,'google',`mode-player-${i}`);
    for (const mode of ['grand-prix','time-trial']) {
      const id=await beginRace(c,'mario',mode);f.advance(70000);
      assert.equal((await finishRace(c,id,score(mode==='grand-prix'?40000+i*1000:60000-i*1000))).status,200);
    }
  }
  const duplicate=await beginRace(clients[0],'mario','time-trial');f.advance(70000);
  await finishRace(clients[0],duplicate,score(65000));
  const gp=(await clients[0].request('/api/leaderboard')).json;
  const tt=(await clients[0].request('/api/leaderboard?mode=time-trial')).json;
  for (const board of [gp,tt]) {
    assert.equal(board.entries.length,10);
    assert.equal(new Set(board.entries.map(row=>row.userId)).size,10);
    assert.deepEqual(board.entries.map(row=>row.rank),[1,2,3,4,5,6,7,8,9,10]);
  }
  assert.equal(gp.mode,'grand-prix');assert.equal(tt.mode,'time-trial');
  assert.equal(gp.entries[0].displayName,'Google mode-player-0');assert.equal(tt.entries[0].displayName,'Google mode-player-11');
  assert.deepEqual((await clients[0].request('/api/me')).json.stats,{bestTimeMs:40000,rank:1,totalRaces:1});
  assert.deepEqual((await clients[0].request('/api/me?mode=time-trial')).json.stats,{bestTimeMs:60000,rank:12,totalRaces:2});
  await f.restart();
  assert.deepEqual((await clients[0].request('/api/leaderboard?mode=time-trial')).json,tt);
});

test('legacy SQLite schema gains mode without discarding users, sessions or scores', async t => {
  const directory=await mkdtemp(join(tmpdir(),'mario-legacy-mode-'));const path=join(directory,'legacy.sqlite');
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const legacy=new DatabaseSync(path);
  legacy.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,provider TEXT,subject TEXT,display_name TEXT,avatar_url TEXT,created_at INTEGER,UNIQUE(provider,subject));
    CREATE TABLE sessions(hash TEXT PRIMARY KEY,user_id TEXT,expires_at INTEGER);
    CREATE TABLE races(id TEXT PRIMARY KEY,user_id TEXT,session_hash TEXT,track TEXT,rules_version INTEGER,character TEXT,started_at INTEGER,expires_at INTEGER,finished_at INTEGER,time_ms INTEGER,position INTEGER,coins INTEGER);
    INSERT INTO users VALUES('u','google','subject','Legacy Racer','',0);
    INSERT INTO sessions VALUES('hash','u',9999999999999);
    INSERT INTO races VALUES('r','u','hash','mushroom-circuit',2,'mario',0,999999,60000,50000,1,5);
    PRAGMA user_version=1;`);
  legacy.close();
  for(let attempt=0;attempt<2;attempt++) {
    const db=openStore(path);
    try {
      assert.equal(db.prepare('SELECT mode FROM races WHERE id=?').get('r').mode,'grand-prix');
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n,1);
      assert.equal(db.prepare('PRAGMA user_version').get().user_version,5);
      assert.equal(db.prepare('SELECT difficulty FROM races WHERE id=?').get('r').difficulty,'standard');
      assert.equal(db.prepare('SELECT time_ms FROM races WHERE id=?').get('r').time_ms,50000);
      assert.deepEqual(stats(db,'u',false),{bestTimeMs:null,rank:null,totalRaces:0});
      assert.deepEqual(stats(db,'u',false,'time-trial'),{bestTimeMs:null,rank:null,totalRaces:0});
      assert.equal(leaderboard(db,false).length,0);
      assert.equal(db.prepare('SELECT display_name FROM users WHERE id=?').get('u').display_name,'Legacy Racer');
    } finally {db.close();}
  }
});


test('combat difficulty is bound to tickets, validated on retries and never changes time trials', async t => {
  const f=await fixture(t),c=f.client();await login(c);
  const start=data=>c.request('/api/races',{method:'POST',data:{character:'mario',rulesVersion:rulesVersion(data.mode),...data}});
  for (const difficulty of ['easy','',null,1,{}]) assert.equal((await start({difficulty})).status,400);
  assert.equal((await start({mode:'grand-prix',rulesVersion:2})).status,409);
  assert.equal((await start({mode:'time-trial',rulesVersion:2})).status,409);
  assert.equal((await start({mode:'time-trial',rulesVersion:rulesVersion('time-trial'),difficulty:'casual'})).status,400);
  const id=await beginRace(c,'mario','grand-prix','casual');f.advance(60000);
  assert.equal(f.db.prepare('SELECT difficulty FROM races WHERE id=?').get(id).difficulty,'casual');
  for (const difficulty of ['standard','unknown',null]) assert.equal((await finishRace(c,id,score(50000,{difficulty}))).status,400);
  const saved=await finishRace(c,id);assert.equal(saved.status,200);assert.equal(saved.json.difficulty,'casual');
  assert.equal(saved.json.rank,null);assert.equal(saved.json.bestTimeMs,null);assert.equal(saved.json.totalRaces,1);
  assert.deepEqual((await finishRace(c,id,score(50000,{difficulty:'casual'}))).json,saved.json);
  assert.equal((await finishRace(c,id,score(50000,{difficulty:'standard'}))).status,400);
  assert.deepEqual((await c.request('/api/me')).json.stats,{bestTimeMs:null,rank:null,totalRaces:0});
  assert.equal((await c.request('/api/leaderboard?difficulty=casual')).json.entries.length,0);
  const tt=await beginRace(c,'mario','time-trial');f.advance(60000);assert.equal((await finishRace(c,tt)).status,200);
  await f.restart();
  const board=(await c.request('/api/leaderboard?mode=time-trial')).json;
  assert.equal(board.rulesVersion,rulesVersion('time-trial'));assert.equal(board.entries[0].bestTimeMs,50000);
  assert.equal((await c.request('/api/leaderboard')).json.rulesVersion,rulesVersion('grand-prix'));
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM races WHERE finished_at IS NOT NULL').get().n,2);
});
