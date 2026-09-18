const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';
const JSON_HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

function reply(status, data) {
  return new Response(JSON.stringify(data), {status, headers: JSON_HEADERS});
}

async function sameSecret(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(actual)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const a = new Uint8Array(left), b = new Uint8Array(right);
  if (typeof crypto.subtle.timingSafeEqual === 'function') return crypto.subtle.timingSafeEqual(a, b);
  // Node's Web Crypto omits this Cloudflare extension; this branch is used only by local tests.
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) mismatch |= (a[i] || 0) ^ (b[i] || 0);
  return mismatch === 0;
}

class RelayFailure extends Error {
  constructor(stage) { super('OAuth relay failed'); this.stage = stage; }
}

async function upstreamJson(fetchImpl, url, options, stage) {
  let response;
  // Cloudflare applies its own subrequest limits. Manual redirect handling keeps OAuth
  // credentials on the fixed Google endpoints and avoids runtime-specific redirect errors.
  try { response = await fetchImpl(url, {...options, redirect: 'manual'}); }
  catch { throw new RelayFailure(`${stage}_network`); }
  if (!response.ok) throw new RelayFailure(`${stage}_status_${response.status}`);
  let data;
  try { data = await response.json(); } catch { throw new RelayFailure(`${stage}_json`); }
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.error) throw new RelayFailure(`${stage}_rejected`);
  return data;
}

function validEnvironment(env) {
  return typeof env.GOOGLE_CLIENT_ID === 'string' && env.GOOGLE_CLIENT_ID &&
    typeof env.GOOGLE_CLIENT_SECRET === 'string' && env.GOOGLE_CLIENT_SECRET &&
    typeof env.RELAY_SECRET === 'string' && env.RELAY_SECRET.length >= 32 &&
    typeof env.GOOGLE_REDIRECT_URI === 'string' && env.GOOGLE_REDIRECT_URI.startsWith('https://');
}

export function createRelayHandler(fetchImpl = fetch) {
  return {
    async fetch(request, env) {
      try {
        const url = new URL(request.url);
        if (url.pathname !== '/google/exchange') return reply(404, {error: 'not_found'});
        if (request.method !== 'POST') return new Response(null, {status: 405, headers: {...JSON_HEADERS, Allow: 'POST'}});
        if (!validEnvironment(env)) return reply(503, {error: 'unavailable'});
        const authorization = request.headers.get('Authorization') || '';
        const expected = `Bearer ${env.RELAY_SECRET}`;
        if (!await sameSecret(authorization, expected)) return reply(401, {error: 'unauthorized'});
        if ((request.headers.get('Content-Type') || '').split(';')[0].trim() !== 'application/json') return reply(415, {error: 'invalid_request'});
        const declared = Number(request.headers.get('Content-Length') || 0);
        if (declared > 4096) return reply(413, {error: 'invalid_request'});
        const raw = await request.text();
        if (new TextEncoder().encode(raw).byteLength > 4096) return reply(413, {error: 'invalid_request'});
        let input;
        try { input = JSON.parse(raw); } catch { return reply(400, {error: 'invalid_request'}); }
        if (!input || typeof input !== 'object' || Array.isArray(input) ||
          typeof input.code !== 'string' || !input.code || input.code.length > 2048 ||
          typeof input.codeVerifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(input.codeVerifier) ||
          input.redirectUri !== env.GOOGLE_REDIRECT_URI) return reply(400, {error: 'invalid_request'});

        const token = await upstreamJson(fetchImpl, TOKEN_ENDPOINT, {
          method: 'POST',
          headers: {'Content-Type': 'application/x-www-form-urlencoded'},
          body: new URLSearchParams({
            code: input.code,
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            redirect_uri: env.GOOGLE_REDIRECT_URI,
            grant_type: 'authorization_code',
            code_verifier: input.codeVerifier,
          }),
        }, 'token');
        if (typeof token.access_token !== 'string' || !token.access_token) throw new RelayFailure('token_shape');
        const profile = await upstreamJson(fetchImpl, USERINFO_ENDPOINT, {
          headers: {Authorization: `Bearer ${token.access_token}`},
        }, 'userinfo');
        if (typeof profile.sub !== 'string' || !profile.sub || profile.sub.length > 255) throw new RelayFailure('userinfo_shape');
        return reply(200, {
          subject: profile.sub,
          name: typeof profile.name === 'string' ? profile.name : 'Google 车手',
          avatar: typeof profile.picture === 'string' ? profile.picture : '',
        });
      } catch (error) {
        // Do not log authorization codes, tokens, profiles, secrets, or upstream bodies.
        console.warn(JSON.stringify({event:'google_oauth_relay_failure',stage:error instanceof RelayFailure ? error.stage : 'unexpected'}));
        return reply(502, {error: 'provider_unavailable'});
      }
    },
  };
}

export default createRelayHandler();
