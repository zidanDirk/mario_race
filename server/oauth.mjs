import {createHash} from 'node:crypto';

export function authorizationUrl(provider, config, state, verifier) {
  const callback = `${config.apiOrigin}/api/auth/${provider}/callback`;
  if (provider === 'google') {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({client_id: config.google.id, redirect_uri: callback,
      response_type: 'code', scope: 'openid profile', state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256'}).toString();
    return url.href;
  }
  const url = new URL('https://open.weixin.qq.com/connect/qrconnect');
  url.search = new URLSearchParams({appid: config.wechat.id, redirect_uri: callback, response_type: 'code', scope: 'snsapi_login', state}).toString();
  url.hash = 'wechat_redirect';
  return url.href;
}

async function getJson(fetchImpl, url, options = {}) {
  const response = await fetchImpl(url, {...options, signal: AbortSignal.timeout(10_000), redirect: 'error'});
  if (!response.ok) throw new Error('OAuth provider unavailable');
  const data = await response.json();
  if (data.error || data.errcode) throw new Error('OAuth provider rejected request');
  return data;
}

function googleIdentity(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile) ||
      typeof profile.subject !== 'string' || !profile.subject || profile.subject.length > 255) {
    throw new Error('Missing subject');
  }
  return {
    subject: profile.subject,
    name: typeof profile.name === 'string' ? profile.name : 'Google 车手',
    avatar: typeof profile.avatar === 'string' ? profile.avatar : '',
  };
}

export async function exchangeIdentity(provider, config, code, verifier, fetchImpl = fetch) {
  const callback = `${config.apiOrigin}/api/auth/${provider}/callback`;
  if (provider === 'google') {
    if (config.google.relayUrl) {
      const profile = await getJson(fetchImpl, config.google.relayUrl, {
        method: 'POST',
        headers: {'Authorization': `Bearer ${config.google.relaySecret}`, 'Content-Type': 'application/json'},
        body: JSON.stringify({code, codeVerifier: verifier, redirectUri: callback}),
      });
      return googleIdentity(profile);
    }
    const token = await getJson(fetchImpl, 'https://oauth2.googleapis.com/token', {
      method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({code, client_id: config.google.id, client_secret: config.google.secret,
        redirect_uri: callback, grant_type: 'authorization_code', code_verifier: verifier}),
    });
    if (typeof token.access_token !== 'string' || !token.access_token) throw new Error('Missing access token');
    // Identity comes from Google's authenticated UserInfo endpoint, never from a client-supplied JWT/profile.
    const profile = await getJson(fetchImpl, 'https://openidconnect.googleapis.com/v1/userinfo', {headers: {Authorization: `Bearer ${token.access_token}`}});
    if (typeof profile.sub !== 'string' || !profile.sub) throw new Error('Missing subject');
    return googleIdentity({subject: profile.sub, name: profile.name, avatar: profile.picture});
  }
  const url = new URL('https://api.weixin.qq.com/sns/oauth2/access_token');
  url.search = new URLSearchParams({appid: config.wechat.id, secret: config.wechat.secret, code, grant_type: 'authorization_code'}).toString();
  const token = await getJson(fetchImpl, url);
  if (typeof token.access_token !== 'string' || typeof token.openid !== 'string' || !token.openid) throw new Error('Missing WeChat identity');
  const info = new URL('https://api.weixin.qq.com/sns/userinfo');
  info.search = new URLSearchParams({access_token: token.access_token, openid: token.openid, lang: 'zh_CN'}).toString();
  const profile = await getJson(fetchImpl, info);
  if (profile.openid !== token.openid) throw new Error('WeChat identity mismatch');
  // Website-app scoped OpenID is stable. No automatic cross-provider/account merging.
  return {subject: token.openid, name: profile.nickname || '微信车手', avatar: profile.headimgurl};
}
