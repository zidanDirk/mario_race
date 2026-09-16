import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createApplication} from '../server/app.mjs';
import {readConfig} from '../server/config.mjs';
import {openStore, rulesVersion, LOADOUTS} from '../server/store.mjs';

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'mario-loadout-'));
  let now = Date.parse('2026-09-14T12:00:00Z');
  const origin = 'http://localhost:5173';
  const config = readConfig({PUBLIC_ORIGIN: origin, DEV_AUTH_ENABLED: 'true', DATABASE_PATH: join(dir, 'race.sqlite')});
  let app, base;
  async function open() {
    app = createApplication({config, now: () => now});
    await new Promise((resolve, reject) => {app.server.once('error', reject); app.server.listen(0, '127.0.0.1', resolve);});
    base = `http://127.0.0.1:${app.server.address().port}`;
  }
  await open();
  t.after(async () => {await app.close(); await rm(dir, {recursive: true, force: true});});
  async function request(path, data, cookie = '') {
    const res = await fetch(base + path, {method: data === undefined ? 'GET' : 'POST', headers: {Origin: origin, 'Content-Type': 'application/json', Cookie: cookie}, ...(data === undefined ? {} : {body: JSON.stringify(data)})});
    return {status: res.status, json: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0]};
  }
  return {
    request, get db() {return app.db;}, advance: ms => now += ms,
    login: async name => (await request('/api/auth/dev', {displayName: name})).cookie,
    start: (cookie, loadout, mode = 'grand-prix', overrides = {}) => request('/api/races', {character: 'mario', mode, rulesVersion: rulesVersion(mode), ...(loadout === undefined ? {} : {loadout}), ...overrides}, cookie),
    finish: (cookie, id, loadout, overrides = {}) => request(`/api/races/${id}/finish`, {character: 'mario', timeMs: 50_000, position: 1, coins: 5, ...(loadout === undefined ? {} : {loadout}), ...overrides}, cookie),
    reopen: async () => {await app.close(); await open();},
  };
}

test('version 4 SQLite migration preserves all historical data and marks legacy loadouts on repeat opens', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'mario-loadout-migration-')), path = join(dir, 'race.sqlite');
  t.after(() => rm(dir, {recursive: true, force: true}));
  const legacy = new DatabaseSync(path);
  legacy.exec(`
    CREATE TABLE users(id TEXT PRIMARY KEY, provider TEXT, subject TEXT, display_name TEXT, avatar_url TEXT, created_at INTEGER, UNIQUE(provider,subject));
    CREATE TABLE sessions(hash TEXT PRIMARY KEY, user_id TEXT, expires_at INTEGER);
    CREATE TABLE races(id TEXT PRIMARY KEY,user_id TEXT,session_hash TEXT,track TEXT,rules_version INTEGER,character TEXT,started_at INTEGER,expires_at INTEGER,finished_at INTEGER,time_ms INTEGER,position INTEGER,coins INTEGER,mode TEXT,difficulty TEXT,metrics TEXT);
    CREATE TABLE user_progression(user_id TEXT PRIMARY KEY,state TEXT);
    INSERT INTO users VALUES('u','google','subject','老车手','',0);
    INSERT INTO sessions VALUES('hash','u',9999999999999);
    INSERT INTO races VALUES('gp','u','hash','mushroom-circuit',3,'mario',0,999999,60000,50000,1,5,'grand-prix','standard','{"coinsCollected":7}');
    INSERT INTO races VALUES('tt','u','hash','mushroom-circuit',2,'peach',0,999999,65000,55000,1,3,'time-trial','standard',NULL);
    INSERT INTO user_progression VALUES('u','{"xp":300}');
    PRAGMA user_version=4;`);
  const before = legacy.prepare('SELECT * FROM races ORDER BY id').all();
  legacy.close();
  for (let i = 0; i < 2; i++) {
    const db = openStore(path);
    try {
      assert.equal(db.prepare('PRAGMA user_version').get().user_version, 5);
      const after = db.prepare('SELECT * FROM races ORDER BY id').all();
      assert.deepEqual(after.map(({loadout, ...race}) => race), before.map(row => ({...row})));
      assert.deepEqual(after.map(row => row.loadout), ['legacy', 'legacy']);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions').get().n, 1);
      assert.equal(db.prepare('SELECT state FROM user_progression').get().state, '{"xp":300}');
    } finally {db.close();}
  }
});

test('new tickets default to light, allow every unlocked configuration, and reject invalid selectors without writes', async t => {
  const f = await fixture(t), cookie = await f.login('配置测试');
  for (const loadout of [null, '', 'legacy', 'LIGHT', 'unknown', 1, {}, ['light']]) {
    assert.equal((await f.start(cookie, loadout)).status, 400);
  }
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM races').get().n, 0);
  for (const mode of ['grand-prix', 'time-trial']) {
    for (const loadout of [undefined, ...LOADOUTS]) {
      const res = await f.start(cookie, loadout, mode);
      assert.equal(res.status, 201);
      assert.equal(res.json.loadout, loadout ?? 'light');
      const ticket = f.db.prepare('SELECT loadout,rules_version FROM races WHERE id=?').get(res.json.raceId);
      assert.equal(ticket.loadout, loadout ?? 'light');
      assert.equal(ticket.rules_version, mode === 'grand-prix' ? 6 : 5);
    }
  }
});

test('loadout is bound before finish and immutable on retries; omitted finish selector uses the ticket', async t => {
  const f = await fixture(t), cookie = await f.login('绑定测试');
  const {json: {raceId}} = await f.start(cookie, 'speed');
  f.advance(55_000);
  for (const loadout of ['light', 'drift', null, 'legacy', 1, {}]) assert.equal((await f.finish(cookie, raceId, loadout)).status, 400);
  assert.equal(f.db.prepare('SELECT finished_at FROM races WHERE id=?').get(raceId).finished_at, null);
  const saved = await f.finish(cookie, raceId, 'speed');
  assert.equal(saved.status, 200);
  assert.equal(saved.json.loadout, 'speed');
  assert.deepEqual((await f.finish(cookie, raceId)).json, saved.json);
  for (const loadout of ['light', 'drift', null, 'legacy']) assert.equal((await f.finish(cookie, raceId, loadout)).status, 400);
  assert.deepEqual((await f.finish(cookie, raceId, 'speed')).json, saved.json);
  await f.reopen();
  assert.deepEqual((await f.finish(cookie, raceId)).json, saved.json);
  assert.equal(f.db.prepare('SELECT loadout FROM races WHERE id=?').get(raceId).loadout, 'speed');
});

test('new GP and trial versions isolate old scores and reject stale clients and finished-ticket retries', async t => {
  const f = await fixture(t), cookie = await f.login('规则测试');
  for (const mode of ['grand-prix', 'time-trial']) {
    const oldVersion = mode === 'grand-prix' ? 5 : 4;
    assert.equal((await f.start(cookie, 'light', mode, {rulesVersion: oldVersion})).status, 409);
    const {json: {raceId}} = await f.start(cookie, 'light', mode);
    f.advance(55_000);
    assert.equal((await f.finish(cookie, raceId, 'light')).status, 200);
    f.db.prepare('UPDATE races SET rules_version=? WHERE id=?').run(oldVersion, raceId);
    const historical = f.db.prepare('SELECT * FROM races WHERE id=?').get(raceId);
    const growth = (await f.request('/api/progression', undefined, cookie)).json;
    assert.equal((await f.finish(cookie, raceId)).status, 409);
    assert.deepEqual(f.db.prepare('SELECT * FROM races WHERE id=?').get(raceId), historical);
    assert.deepEqual((await f.request('/api/progression', undefined, cookie)).json, growth);
    assert.equal((await f.request(`/api/leaderboard?mode=${mode}`)).json.entries.length, 0);
    assert.deepEqual((await f.request(`/api/me?mode=${mode}`, undefined, cookie)).json.stats, {bestTimeMs: null, rank: null, totalRaces: 0});
    const fresh = await f.start(cookie, 'drift', mode);
    f.advance(60_000);
    assert.equal((await f.finish(cookie, fresh.json.raceId, 'drift', {timeMs: 55_000})).status, 200);
    const board = (await f.request(`/api/leaderboard?mode=${mode}`)).json;
    assert.equal(board.rulesVersion, oldVersion + 1);
    assert.equal(board.entries[0].bestTimeMs, 55_000);
    assert.equal(board.entries[0].loadout, 'drift');
  }
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM races WHERE finished_at IS NOT NULL').get().n, 4);
});

test('all configurations share each mode leaderboard, fastest loadout wins per user, and full history persists', async t => {
  const f = await fixture(t), cookies = await Promise.all(LOADOUTS.map(id => f.login(id)));
  for (const mode of ['grand-prix', 'time-trial']) {
    for (let i = 0; i < LOADOUTS.length; i++) {
      const res = await f.start(cookies[i], LOADOUTS[i], mode);
      f.advance(60_000);
      assert.equal((await f.finish(cookies[i], res.json.raceId, LOADOUTS[i], {timeMs: 50_000 + i * 1000})).status, 200);
    }
    const faster = await f.start(cookies[0], 'drift', mode);
    f.advance(60_000);
    assert.equal((await f.finish(cookies[0], faster.json.raceId, 'drift', {timeMs: 48_000})).status, 200);
    const entries = (await f.request(`/api/leaderboard?mode=${mode}`)).json.entries;
    assert.equal(entries.length, 3);
    assert.deepEqual(entries.map(e => [e.rank, e.loadout, e.bestTimeMs]), [[1, 'drift', 48_000], [2, 'speed', 51_000], [3, 'drift', 52_000]]);
    assert.equal(new Set(entries.map(e => e.userId)).size, 3);
    const stats = (await f.request(`/api/me?mode=${mode}`, undefined, cookies[0])).json.stats;
    assert.deepEqual(stats, {bestTimeMs: 48_000, rank: 1, totalRaces: 2});
  }
  const before = f.db.prepare('SELECT id,loadout,mode,time_ms FROM races ORDER BY id').all();
  await f.reopen();
  assert.deepEqual(f.db.prepare('SELECT id,loadout,mode,time_ms FROM races ORDER BY id').all(), before);
  assert.equal(before.length, 8);
  assert.deepEqual(new Set(before.map(row => row.loadout)), new Set(LOADOUTS));
});

test('tactical rules reject previous-version unfinished tickets without awarding growth; current finishes count once', async t => {
  const f = await fixture(t), cookie = await f.login('机关升级测试');
  const stale = [];
  for (const [mode, previous, current] of [['grand-prix', 5, 6], ['time-trial', 4, 5]]) {
    assert.equal(rulesVersion(mode), current);
    const rejected = await f.start(cookie, 'speed', mode, {rulesVersion: previous});
    assert.equal(rejected.status, 409);
    const started = await f.start(cookie, 'speed', mode);
    assert.equal(started.status, 201);
    // Model an outstanding ticket issued before the game upgrade.
    f.db.prepare('UPDATE races SET rules_version=? WHERE id=?').run(previous, started.json.raceId);
    stale.push({id: started.json.raceId, mode});
  }
  f.advance(60_000);
  const before = f.db.prepare('SELECT * FROM races ORDER BY id').all();
  const growthBefore = (await f.request('/api/progression', undefined, cookie)).json;
  assert.equal(growthBefore.xp, 0);
  for (const {id, mode} of stale) {
    assert.equal((await f.finish(cookie, id, 'speed')).status, 409);
    assert.equal((await f.request(`/api/leaderboard?mode=${mode}`)).json.entries.length, 0);
  }
  assert.deepEqual(f.db.prepare('SELECT * FROM races ORDER BY id').all(), before);
  assert.deepEqual((await f.request('/api/progression', undefined, cookie)).json, growthBefore);
  for (const [mode, current] of [['grand-prix', 6], ['time-trial', 5]]) {
    const started = await f.start(cookie, 'drift', mode);
    assert.equal(started.status, 201);
    f.advance(60_000);
    const saved = await f.finish(cookie, started.json.raceId, 'drift');
    assert.equal(saved.status, 200);
    assert.equal(saved.json.totalRaces, 1);
    assert.equal(saved.json.rank, 1);
    assert(saved.json.progression.xp > 0);
    assert.deepEqual((await f.finish(cookie, started.json.raceId, 'drift')).json, saved.json);
    assert.equal((await f.finish(cookie, started.json.raceId, 'light')).status, 400);
    const board = (await f.request(`/api/leaderboard?mode=${mode}`)).json;
    assert.equal(board.rulesVersion, current);
    assert.equal(board.entries.length, 1);
    assert.equal(board.entries[0].loadout, 'drift');
    assert.equal(board.entries[0].bestTimeMs, 50_000);
  }
  const growthAfter = (await f.request('/api/progression', undefined, cookie)).json;
  const allRows = f.db.prepare('SELECT * FROM races ORDER BY id').all();
  assert.equal(allRows.length, 4);
  assert.equal(allRows.filter(row => row.finished_at !== null).length, 2);
  assert.equal(f.db.prepare('PRAGMA user_version').get().user_version, 5);
  await f.reopen();
  assert.deepEqual(f.db.prepare('SELECT * FROM races ORDER BY id').all(), allRows);
  for (const {id} of stale) assert.equal((await f.finish(cookie, id, 'speed')).status, 409);
  assert.deepEqual((await f.request('/api/progression', undefined, cookie)).json, growthAfter);
});
