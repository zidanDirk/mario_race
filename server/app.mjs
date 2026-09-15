import {createServer} from 'node:http';
import {randomBytes, randomUUID, createHash} from 'node:crypto';
import {readFile, stat} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {readConfig} from './config.mjs';
import {openStore, leaderboard, stats, readProgress, writeProgress, TRACK, rulesVersion, CHARACTERS, RACE_MODES, DIFFICULTIES, LOADOUTS} from './store.mjs';
import {dayKey, snapshot, applyRace, equipProgress, validateMetrics} from '../shared/progression.mjs';
import {authorizationUrl, exchangeIdentity} from './oauth.mjs';

const token = () => randomBytes(32).toString('base64url');
const hash = value => createHash('sha256').update(value).digest('hex');
const failure = (status, message) => Object.assign(new Error(message), {status});
function raceMode(value = 'grand-prix') {
  if (!RACE_MODES.includes(value)) throw failure(400, '比赛模式无效');
  return value;
}
function raceDifficulty(value = 'standard') {
  if (!DIFFICULTIES.includes(value)) throw failure(400, '比赛难度无效');
  return value;
}
function raceLoadout(value = 'light') {
  if (!LOADOUTS.includes(value)) throw failure(400, '赛车配置无效');
  return value;
}
const cleanName = value => (typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40) : '') || '蘑菇车手';
function safeAvatar(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && url.href.length < 2048 ? url.href : ''; } catch { return ''; }
}
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(v => v.trim().split(/=(.*)/s)).filter(v => v.length >= 2));
}
async function body(req) {
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw failure(415, '请使用 JSON 请求');
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 4096) throw failure(413, '请求过大'); }
  try { const data = JSON.parse(raw || '{}'); if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(); return data; }
  catch { throw failure(400, '请求格式错误'); }
}

export function createApplication({config = readConfig(), now = Date.now, fetchImpl = fetch} = {}) {
  const db = openStore(config.dbPath);
  const sessionName = config.secure ? '__Host-mario_session' : 'mario_session';
  const stateName = provider => config.secure ? `__Host-mario_oauth_${provider}` : `mario_oauth_${provider}`;
  const limits = new Map();
  let lastCleanup = 0;
  function cleanup() {
    if (now() - lastCleanup < 60_000) return;
    lastCleanup = now();
    db.prepare('DELETE FROM sessions WHERE expires_at<?').run(now());
    db.prepare('DELETE FROM oauth_states WHERE expires_at<?').run(now());
    db.prepare('DELETE FROM races WHERE finished_at IS NULL AND expires_at<?').run(now());
    for (const [key, value] of limits) if (value.until < now()) limits.delete(key);
  }
  function rate(key, max, windowMs = 60_000) {
    let entry = limits.get(key);
    if (!entry || entry.until <= now()) { entry = {n: 0, until: now() + windowMs}; limits.set(key, entry); }
    if (++entry.n > max) throw failure(429, '操作过于频繁，请稍后重试');
  }
  function cookie(res, name, value, maxAge) {
    const current = res.getHeader('Set-Cookie') || [];
    res.setHeader('Set-Cookie', [...current, `${name}=${value}; Path=/; HttpOnly; SameSite=${config.cookieSameSite}; Max-Age=${maxAge}${config.secure ? '; Secure' : ''}`]);
  }
  function json(res, status, data) {res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8'});res.end(JSON.stringify(data));}
  function redirect(res, location) {res.writeHead(302, {Location: location});res.end();}
  function appRedirect(res, query) {redirect(res, new URL(`/?${query}`, config.appOrigin).href);}
  function allowCors(req, res) {
    if (req.headers.origin !== config.appOrigin) return false;
    res.setHeader('Access-Control-Allow-Origin', config.appOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    return true;
  }
  function session(req) {
    const raw = cookies(req)[sessionName];
    if (!raw || raw.length > 128) return null;
    const result = db.prepare(`SELECT s.hash, u.id, u.display_name AS displayName, u.avatar_url AS avatarUrl, u.provider
      FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires_at>?`).get(hash(raw), now());
    return result && !(config.production && result.provider === 'dev') ? result : null;
  }
  function requireUser(req) { const user = session(req); if (!user) throw failure(401, '请先登录'); return user; }
  function login(req, res, provider, identity) {
    const old = cookies(req)[sessionName];
    if (old) db.prepare('DELETE FROM sessions WHERE hash=?').run(hash(old));
    const id = randomUUID();
    db.prepare(`INSERT INTO users(id,provider,subject,display_name,avatar_url,created_at) VALUES(?,?,?,?,?,?)
      ON CONFLICT(provider,subject) DO UPDATE SET display_name=excluded.display_name,avatar_url=excluded.avatar_url`)
      .run(id, provider, identity.subject, cleanName(identity.name), safeAvatar(identity.avatar), now());
    const user = db.prepare('SELECT id FROM users WHERE provider=? AND subject=?').get(provider, identity.subject);
    const raw = token();
    db.prepare('INSERT INTO sessions(hash,user_id,expires_at) VALUES(?,?,?)').run(hash(raw), user.id, now() + 7 * 86400_000);
    cookie(res, sessionName, raw, 7 * 86400);
  }
  async function handle(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    if (config.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    try {
      const url = new URL(req.url, config.apiOrigin);
      const path = url.pathname;
      cleanup();
      if (path.startsWith('/api/')) {
        const corsAllowed = allowCors(req, res);
        if (req.method === 'OPTIONS') {
          if (!corsAllowed) throw failure(403, '请求来源无效');
          res.writeHead(204, {
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Accept, Content-Type',
            'Access-Control-Max-Age': '600',
          });
          return res.end();
        }
        const ip = config.trustProxy ? String(req.headers['x-real-ip'] || req.socket.remoteAddress) : req.socket.remoteAddress;
        if (req.method === 'POST') {
          if (!corsAllowed) throw failure(403, '请求来源无效');
          rate(`write:${session(req)?.id || ip}`, 120);
        }
        if (path === '/api/health' && req.method === 'GET') {db.prepare('SELECT 1').get();return json(res, 200, {ok: true});}
        if(path==='/api/progression'&&req.method==='GET'){
          const user=requireUser(req);return json(res,200,snapshot(readProgress(db,user.id),dayKey(now())));
        }
        if(path==='/api/progression/equip'&&req.method==='POST'){
          const user=requireUser(req),data=await body(req);let next;
          try{next=equipProgress(readProgress(db,user.id),data);}catch(error){throw failure(400,error.message);}
          writeProgress(db,user.id,next);return json(res,200,snapshot(next,dayKey(now())));
        }
        if (path === '/api/config' && req.method === 'GET') return json(res, 200, {providers: {google: !!config.google.id, wechat: !!config.wechat.id}, devLogin: config.devLogin});
        if (path === '/api/me' && req.method === 'GET') {
          const mode = raceMode(url.searchParams.has('mode') ? url.searchParams.get('mode') : undefined);
          const user = session(req);
          if (!user) return json(res, 200, {user: null, stats: null, mode});
          const {hash: _hash, ...profile} = user;
          return json(res, 200, {user: profile, stats: stats(db, user.id, config.production, mode), mode});
        }
        if (path === '/api/leaderboard' && req.method === 'GET') {
          const mode = raceMode(url.searchParams.has('mode') ? url.searchParams.get('mode') : undefined);
          return json(res, 200, {entries: leaderboard(db, config.production, mode), track: TRACK, rulesVersion: rulesVersion(mode), mode, difficulty: 'standard'});
        }
        if (path === '/api/auth/dev' && req.method === 'POST') {
          if (!config.devLogin) throw failure(404, '未开放此登录方式');
          rate(`login:${ip}`, 30);
          const data = await body(req);
          login(req, res, 'dev', {subject: randomUUID(), name: data.displayName || '本地测试车手', avatar: ''});
          return json(res, 200, {ok: true});
        }
        if (path === '/api/logout' && req.method === 'POST') {
          await body(req);
          const raw = cookies(req)[sessionName];
          if (raw) db.prepare('DELETE FROM sessions WHERE hash=?').run(hash(raw));
          cookie(res, sessionName, '', 0);
          return json(res, 200, {ok: true});
        }
        const auth = path.match(/^\/api\/auth\/(google|wechat)(\/callback)?$/);
        if (auth && req.method === 'GET') {
          const provider = auth[1];
          rate(`oauth:${ip}`, 60);
          if (!config[provider].id) return appRedirect(res, 'auth=error&reason=unconfigured');
          if (!auth[2]) {
            const state = token(), browser = token(), verifier = token();
            db.prepare('INSERT INTO oauth_states(hash,provider,browser_hash,verifier,expires_at) VALUES(?,?,?,?,?)')
              .run(hash(state), provider, hash(browser), verifier, now() + 600_000);
            cookie(res, stateName(provider), browser, 600);
            return redirect(res, authorizationUrl(provider, config, state, verifier));
          }
          const state = url.searchParams.get('state') || '';
          const browser = cookies(req)[stateName(provider)] || '';
          const pending = db.prepare('SELECT * FROM oauth_states WHERE hash=? AND provider=? AND expires_at>?').get(hash(state), provider, now());
          if (!pending || !browser || pending.browser_hash !== hash(browser)) return appRedirect(res, 'auth=error&reason=expired');
          db.prepare('DELETE FROM oauth_states WHERE hash=?').run(hash(state));
          cookie(res, stateName(provider), '', 0);
          if (url.searchParams.has('error')) return appRedirect(res, 'auth=error&reason=cancelled');
          const code = url.searchParams.get('code');
          if (!code || code.length > 2048) return appRedirect(res, 'auth=error&reason=invalid');
          try {
            const identity = await exchangeIdentity(provider, config, code, pending.verifier, fetchImpl);
            login(req, res, provider, identity);
            return appRedirect(res, 'auth=success');
          } catch {
            // Never log provider URLs, authorization codes, access tokens, or raw upstream errors.
            console.warn(`OAuth ${provider}: identity exchange failed`);
            return appRedirect(res, 'auth=error&reason=provider');
          }
        }
        if (path === '/api/races' && req.method === 'POST') {
          const user = requireUser(req), data = await body(req);
          if (!CHARACTERS.includes(data.character)) throw failure(400, '车手无效');
          const mode = raceMode(data.mode);
          const difficulty = raceDifficulty(data.difficulty);
          const loadout = raceLoadout(data.loadout);
          if (mode === 'time-trial' && difficulty !== 'standard') throw failure(400, '计时挑战不支持休闲难度');
          if (data.rulesVersion !== rulesVersion(mode)) throw failure(409, '赛道已更新，请刷新页面后开始新比赛');
          rate(`race:${user.id}`, 20);
          const id = randomUUID();
          db.prepare('INSERT INTO races(id,user_id,session_hash,track,rules_version,character,started_at,expires_at,mode,difficulty,loadout) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
            .run(id, user.id, user.hash, TRACK, rulesVersion(mode), data.character, now(), now() + 6 * 3600_000, mode, difficulty, loadout);
          return json(res, 201, {raceId: id, mode, difficulty, loadout, progression:snapshot(readProgress(db,user.id),dayKey(now()))});
        }
        const finish = path.match(/^\/api\/races\/([0-9a-f-]{36})\/finish$/);
        if (finish && req.method === 'POST') {
          const user = requireUser(req), data = await body(req);
          const race = db.prepare('SELECT * FROM races WHERE id=? AND user_id=? AND session_hash=?').get(finish[1], user.id, user.hash);
          if (!race) throw failure(404, '比赛不存在或登录账户已改变');
          if (race.rules_version !== rulesVersion(race.mode)) throw failure(409, '赛道已更新，请刷新页面后开始新比赛');
          if (data.mode !== undefined && raceMode(data.mode) !== race.mode) throw failure(400, '比赛模式与凭证不符');
          if (data.difficulty !== undefined && raceDifficulty(data.difficulty) !== race.difficulty) throw failure(400, '比赛难度与凭证不符');
          if (data.loadout !== undefined && raceLoadout(data.loadout) !== race.loadout) throw failure(400, '赛车配置与凭证不符');
          if (race.mode === 'time-trial' && data.position !== 1) throw failure(400, '计时挑战成绩无效');
          if (!Number.isInteger(data.timeMs) || data.timeMs < 30_000 || data.timeMs > 1800_000 ||
            !Number.isInteger(data.position) || data.position < 1 || data.position > 6 ||
            !Number.isInteger(data.coins) || data.coins < 0 || data.coins > 10 || data.character !== race.character) throw failure(400, '成绩参数无效');
          try{validateMetrics(data.metrics,data.timeMs);}catch{throw failure(400,'驾驶统计无效');}
          const metrics=data.metrics===undefined?null:JSON.stringify({orangeDrifts:data.metrics.orangeDrifts,coinsCollected:data.metrics.coinsCollected,rescues:data.metrics.rescues,shortcutClears:data.metrics.shortcutClears});
          if (race.finished_at !== null) {
            if (race.time_ms !== data.timeMs || race.position !== data.position || race.coins !== data.coins) throw failure(409, '本场比赛已保存，无法覆盖');
            if(race.metrics!==metrics)throw failure(409,'本场驾驶统计已保存，无法覆盖');
          } else {
            if (race.expires_at < now()) throw failure(410, '本场比赛已过期，请重新比赛');
            if (data.timeMs > now() - race.started_at + 2500) throw failure(400, '比赛用时与服务器记录不符');
            db.exec('BEGIN IMMEDIATE');
            try{
              const next=applyRace(readProgress(db,user.id),{mode:race.mode,metrics:data.metrics},dayKey(race.started_at));
              db.prepare('UPDATE races SET finished_at=?,time_ms=?,position=?,coins=?,metrics=? WHERE id=? AND finished_at IS NULL')
                .run(now(), data.timeMs, data.position, data.coins,metrics,race.id);
              writeProgress(db,user.id,next);db.exec('COMMIT');
            }catch(error){db.exec('ROLLBACK');throw error;}
          }
          return json(res, 200, {saved: true, mode: race.mode, difficulty: race.difficulty, loadout: race.loadout, ...stats(db, user.id, config.production, race.mode, race.difficulty),progression:snapshot(readProgress(db,user.id),dayKey(now()))});
        }
        throw failure(404, '接口不存在');
      }
      if (!config.serveStatic) throw failure(404, '接口不存在');
      if (!['GET','HEAD'].includes(req.method)) throw failure(405, '请求方法不支持');
      const decoded = decodeURIComponent(path);
      const file = resolve(config.staticDir, '.' + (decoded === '/' ? '/index.html' : decoded));
      if (!file.startsWith(config.staticDir + sep) || decoded.split('/').some(part => part.startsWith('.'))) throw failure(404, '页面不存在');
      const meta = await stat(file).catch(() => null);
      if (!meta?.isFile()) throw failure(404, '页面不存在，请先运行 npm run build');
      const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2','.mp3':'audio/mpeg'};
      if (path.startsWith('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
      res.end(req.method === 'HEAD' ? undefined : await readFile(file));
    } catch (error) {
      if (!res.headersSent) json(res, error.status || 500, {error: error.status ? error.message : '服务暂时不可用，请稍后重试'});
      else res.end();
      if (!error.status) console.error('Request failed:', error.code || error.name);
    }
  }
  const server = createServer((req, res) => {void handle(req, res);});
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return {server, db, close: () => new Promise((done, reject) => server.close(error => {db.close(); error ? reject(error) : done();}))};
}
