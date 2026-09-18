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
  const appPathValue = env.APP_RETURN_PATH || '/';
  if (!appPathValue.startsWith('/')) throw new Error('APP_RETURN_PATH must start with /');
  const appReturn = new URL(appPathValue, app.url);
  if (appReturn.origin !== app.url.origin || appReturn.search || appReturn.hash || !appReturn.pathname.endsWith('/')) throw new Error('APP_RETURN_PATH must be an absolute directory path without query or hash');
  const devLogin = env.DEV_AUTH_ENABLED === 'true';
  if (devLogin && (production || !app.loopback || !api.loopback)) throw new Error('Development login is allowed only on local development origins');
  const cookieSameSite = env.COOKIE_SAME_SITE || 'Lax';
  if (!['Lax', 'Strict', 'None'].includes(cookieSameSite)) throw new Error('COOKIE_SAME_SITE must be Lax, Strict, or None');
  if (cookieSameSite === 'None' && api.url.protocol !== 'https:') throw new Error('SameSite=None cookies require HTTPS');
  const googleId = env.GOOGLE_CLIENT_ID || '';
  const googleSecret = env.GOOGLE_CLIENT_SECRET || '';
  const googleRelayUrl = env.GOOGLE_RELAY_URL || '';
  const googleRelaySecret = env.GOOGLE_RELAY_SECRET || '';
  const relayPartial = Boolean(googleRelayUrl) !== Boolean(googleRelaySecret);
  if (relayPartial) throw new Error('GOOGLE_RELAY_URL and GOOGLE_RELAY_SECRET must be set together');
  if (!googleId && (googleSecret || googleRelayUrl || googleRelaySecret)) throw new Error('GOOGLE_CLIENT_ID is required for Google login');
  if (googleId && !googleSecret && !googleRelayUrl) throw new Error('Google login requires GOOGLE_CLIENT_SECRET or the relay configuration');
  if (googleSecret && googleRelayUrl) throw new Error('Configure either direct Google exchange or the relay, not both');
  if (googleRelayUrl) {
    const relay = new URL(googleRelayUrl);
    if (relay.protocol !== 'https:' || relay.username || relay.password || relay.search || relay.hash || relay.pathname === '/') {
      throw new Error('GOOGLE_RELAY_URL must be an HTTPS endpoint path without credentials, query, or hash');
    }
    if (googleRelaySecret.length < 32) throw new Error('GOOGLE_RELAY_SECRET must be at least 32 characters');
  }
  if (Boolean(env.WECHAT_APP_ID) !== Boolean(env.WECHAT_APP_SECRET)) throw new Error('WECHAT_APP_ID and WECHAT_APP_SECRET must be set together');
  return {
    production, appOrigin: app.url.origin, appPath: appReturn.pathname, apiOrigin: api.url.origin,
    // Kept as an alias for existing local tools; new server code uses apiOrigin/appOrigin explicitly.
    origin: api.url.origin, secure: api.url.protocol === 'https:', cookieSameSite, devLogin,
    host: env.HOST || '127.0.0.1', port: Number(env.PORT || 3001),
    dbPath: resolve(env.DATABASE_PATH || (production ? 'data/race.sqlite' : 'data/development.sqlite')),
    staticDir: resolve('dist'), serveStatic: env.SERVE_STATIC !== 'false', trustProxy: env.TRUST_PROXY === 'true',
    google: {id: googleId, secret: googleSecret, relayUrl: googleRelayUrl, relaySecret: googleRelaySecret},
    wechat: {id: env.WECHAT_APP_ID || '', secret: env.WECHAT_APP_SECRET || ''},
  };
}
