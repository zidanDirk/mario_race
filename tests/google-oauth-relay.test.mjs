import test from 'node:test';
import assert from 'node:assert/strict';
import {createRelayHandler} from '../cloudflare/google-oauth-relay/src/index.mjs';

const env={
  GOOGLE_CLIENT_ID:'google-client',
  GOOGLE_CLIENT_SECRET:'google-secret',
  RELAY_SECRET:'relay-secret-that-is-at-least-32-characters',
  GOOGLE_REDIRECT_URI:'https://backend.zhangzidan.com/api/auth/google/callback',
};
const verifier='v'.repeat(64);
const input={code:'one-time-code',codeVerifier:verifier,redirectUri:env.GOOGLE_REDIRECT_URI};
const request=(body=input,headers={})=>new Request('https://relay.example/google/exchange',{
  method:'POST',headers:{Authorization:`Bearer ${env.RELAY_SECRET}`,'Content-Type':'application/json',...headers},
  body:typeof body==='string'?body:JSON.stringify(body),
});

test('relay exchanges the authorization code and returns only the minimum profile',async()=>{
  const calls=[];
  const handler=createRelayHandler(async(url,options)=>{
    calls.push({url,options});
    if(String(url).includes('/token')) return new Response(JSON.stringify({access_token:'private-access-token',id_token:'private-id-token'}),{status:200});
    return new Response(JSON.stringify({sub:'google-subject',name:'测试车手',picture:'https://example.com/avatar.png',email:'private@example.com'}),{status:200});
  });
  const response=await handler.fetch(request(),env);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'),null);
  const text=await response.text();
  assert.deepEqual(JSON.parse(text),{subject:'google-subject',name:'测试车手',avatar:'https://example.com/avatar.png'});
  for(const privateValue of ['private-access-token','private-id-token','private@example.com',env.GOOGLE_CLIENT_SECRET,env.RELAY_SECRET]) assert.ok(!text.includes(privateValue));
  assert.equal(calls.length,2);
  const tokenBody=calls[0].options.body;
  assert.equal(tokenBody.get('code'),input.code);
  assert.equal(tokenBody.get('client_id'),env.GOOGLE_CLIENT_ID);
  assert.equal(tokenBody.get('client_secret'),env.GOOGLE_CLIENT_SECRET);
  assert.equal(tokenBody.get('redirect_uri'),env.GOOGLE_REDIRECT_URI);
  assert.equal(tokenBody.get('code_verifier'),verifier);
  assert.equal(calls[1].options.headers.Authorization,'Bearer private-access-token');
});

test('relay rejects unauthenticated, malformed, oversized and wrong callback requests before Google',async()=>{
  let calls=0;
  const handler=createRelayHandler(async()=>{calls++;throw new Error('must not run');});
  const cases=[
    [new Request('https://relay.example/google/exchange',{method:'GET'}),405],
    [new Request('https://relay.example/wrong',{method:'POST'}),404],
    [request(input,{Authorization:'Bearer wrong'}),401],
    [request(input,{'Content-Type':'text/plain'}),415],
    [request('{broken'),400],
    [request({...input,redirectUri:'https://attacker.example/callback'}),400],
    [request({...input,codeVerifier:'short'}),400],
    [request({code:'x'.repeat(4097),codeVerifier:verifier,redirectUri:env.GOOGLE_REDIRECT_URI}),413],
  ];
  for(const [candidate,status] of cases) assert.equal((await handler.fetch(candidate,env)).status,status);
  assert.equal(calls,0);
});

test('relay hides Google errors and invalid provider profiles',async()=>{
  for(const fetchImpl of [
    async()=>new Response(JSON.stringify({error:'invalid_grant',error_description:'private detail'}),{status:400}),
    async(url)=>String(url).includes('/token')?new Response(JSON.stringify({access_token:'token'}),{status:200}):new Response(JSON.stringify({name:'missing subject'}),{status:200}),
  ]) {
    const response=await createRelayHandler(fetchImpl).fetch(request(),env);
    assert.equal(response.status,502);
    const text=await response.text();
    assert.equal(text,'{"error":"provider_unavailable"}');
    assert.ok(!text.includes('private'));
  }
});
