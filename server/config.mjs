import {resolve} from 'node:path';

export function readConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const legacyOrigin = env.PUBLIC_ORIGIN;
  const checkOrigin = (name, value) => {
    const url = new URL(value);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error(`${name} must be an origin without path or credentials`);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback && !production)) throw new Error(`${name} requires HTTPS (except local development)`);
    return {url, loopback};
  };
  const app = checkOrigin('APP_ORIGIN', env.APP_ORIGIN || legacyOrigin || 'http://localhost:5173');
  const api = checkOrigin('API_ORIGIN', env.API_ORIGIN || legacyOrigin || 'http://localhost:5173');
  const devLogin = env.DEV_AUTH_ENABLED === 'true';
  if (devLogin && (production || !app.loopback || !api.loopback)) throw new Error('Development login is allowed only on local development origins');
  const cookieSameSite = env.COOKIE_SAME_SITE || 'Lax';
  if (!['Lax', 'Strict', 'None'].includes(cookieSameSite)) throw new Error('COOKIE_SAME_SITE must be Lax, Strict, or None');
  if (cookieSameSite === 'None' && api.url.protocol !== 'https:') throw new Error('SameSite=None cookies require HTTPS');
  const pairs = [['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'], ['WECHAT_APP_ID', 'WECHAT_APP_SECRET']];
  for (const [id, secret] of pairs) if (Boolean(env[id]) !== Boolean(env[secret])) throw new Error(`${id} and ${secret} must be set together`);
  return {
    production, appOrigin: app.url.origin, apiOrigin: api.url.origin,
    // Kept as an alias for existing local tools; new server code uses apiOrigin/appOrigin explicitly.
    origin: api.url.origin, secure: api.url.protocol === 'https:', cookieSameSite, devLogin,
    host: env.HOST || '127.0.0.1', port: Number(env.PORT || 3001),
    dbPath: resolve(env.DATABASE_PATH || (production ? 'data/race.sqlite' : 'data/development.sqlite')),
    staticDir: resolve('dist'), serveStatic: env.SERVE_STATIC !== 'false', trustProxy: env.TRUST_PROXY === 'true',
    google: {id: env.GOOGLE_CLIENT_ID || '', secret: env.GOOGLE_CLIENT_SECRET || ''},
    wechat: {id: env.WECHAT_APP_ID || '', secret: env.WECHAT_APP_SECRET || ''},
  };
}
