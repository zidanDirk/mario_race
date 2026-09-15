import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {emptyProgress, normalizeProgress} from '../shared/progression.mjs';

export const TRACK = 'mushroom-circuit';
export const RULES_VERSION = 5;
export const rulesVersion = mode => mode === 'time-trial' ? 4 : RULES_VERSION;
export const LOADOUTS = ['light', 'speed', 'drift'];
export const DIFFICULTIES = ['standard', 'casual'];
export const RACE_MODES = ['grand-prix', 'time-trial'];
export const CHARACTERS = ['mario','luigi','peach','yoshi','toad','wario'];

export function openStore(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), {recursive: true, mode: 0o700});
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, provider TEXT NOT NULL, subject TEXT NOT NULL,
      display_name TEXT NOT NULL, avatar_url TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL,
      UNIQUE(provider, subject)
    );
    CREATE TABLE IF NOT EXISTS sessions (
      hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS oauth_states (
      hash TEXT PRIMARY KEY, provider TEXT NOT NULL, browser_hash TEXT NOT NULL,
      verifier TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS races (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), session_hash TEXT NOT NULL,
      track TEXT NOT NULL, rules_version INTEGER NOT NULL, character TEXT NOT NULL,
      started_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, finished_at INTEGER,
      time_ms INTEGER, position INTEGER, coins INTEGER,
      mode TEXT NOT NULL DEFAULT 'grand-prix'
    );
    CREATE INDEX IF NOT EXISTS race_best ON races(track, rules_version, user_id, time_ms);
    CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires_at);

  `);
  // Existing race histories remain Grand Prix records when adding time trials.
  if (!db.prepare('PRAGMA table_info(races)').all().some(column => column.name === 'mode')) {
    db.exec("ALTER TABLE races ADD COLUMN mode TEXT NOT NULL DEFAULT 'grand-prix'");
  }
  if (!db.prepare('PRAGMA table_info(races)').all().some(column => column.name === 'difficulty')) {
    db.exec("ALTER TABLE races ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'standard'");
  }
  db.exec('CREATE INDEX IF NOT EXISTS race_difficulty_best ON races(track, rules_version, mode, difficulty, user_id, time_ms);');
  db.exec('CREATE INDEX IF NOT EXISTS race_mode_best ON races(track, rules_version, mode, user_id, time_ms); PRAGMA user_version=2;');
  if (!db.prepare('PRAGMA table_info(races)').all().some(column => column.name === 'metrics')) db.exec('ALTER TABLE races ADD COLUMN metrics TEXT');
  // Preserve the provenance of historical scores; every new ticket supplies its selected loadout.
  if (!db.prepare('PRAGMA table_info(races)').all().some(column => column.name === 'loadout')) db.exec("ALTER TABLE races ADD COLUMN loadout TEXT NOT NULL DEFAULT 'legacy'");
  db.exec(`CREATE TABLE IF NOT EXISTS user_progression(user_id TEXT PRIMARY KEY REFERENCES users(id),state TEXT NOT NULL); PRAGMA user_version=5;`);
  return db;
}

export function readProgress(db,userId){const row=db.prepare('SELECT state FROM user_progression WHERE user_id=?').get(userId);try{return row?normalizeProgress(JSON.parse(row.state)):emptyProgress();}catch{return emptyProgress();}}
export function writeProgress(db,userId,state){db.prepare('INSERT INTO user_progression(user_id,state) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET state=excluded.state').run(userId,JSON.stringify(state));}

// Pick each user's fastest completed race first; ties are stable by finish time, then race id.
const ranked = `WITH best AS (
  SELECT r.*, u.display_name, u.avatar_url, ROW_NUMBER() OVER (
    PARTITION BY r.user_id ORDER BY r.time_ms, r.finished_at, r.id) AS choice
  FROM races r JOIN users u ON u.id=r.user_id
  WHERE r.track=? AND r.rules_version=? AND r.mode=? AND r.difficulty='standard' AND r.finished_at IS NOT NULL
    AND (?=0 OR u.provider!='dev')
), ranked AS (
  SELECT *, ROW_NUMBER() OVER (ORDER BY time_ms, finished_at, id) AS rank FROM best WHERE choice=1
)`;
export function leaderboard(db, production, mode = 'grand-prix') {
  return db.prepare(`${ranked} SELECT rank, user_id AS userId, display_name AS displayName,
    avatar_url AS avatarUrl, time_ms AS bestTimeMs, character, loadout FROM ranked ORDER BY rank LIMIT 10`)
    .all(TRACK, rulesVersion(mode), mode, Number(production)).map(entry=>({...entry,title:readProgress(db,entry.userId).equipped.title}));
}
export function stats(db, userId, production, mode = 'grand-prix', difficulty = 'standard') {
  const best = difficulty === 'standard' ? db.prepare(`${ranked} SELECT time_ms AS bestTimeMs, rank FROM ranked WHERE user_id=?`)
    .get(TRACK, rulesVersion(mode), mode, Number(production), userId) : undefined;
  const count = db.prepare('SELECT COUNT(*) AS n FROM races WHERE user_id=? AND track=? AND rules_version=? AND mode=? AND difficulty=? AND finished_at IS NOT NULL').get(userId, TRACK, rulesVersion(mode), mode, difficulty);
  return {bestTimeMs: best?.bestTimeMs ?? null, rank: best?.rank ?? null, totalRaces: count.n};
}
