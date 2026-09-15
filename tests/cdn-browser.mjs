import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname, resolve, sep} from 'node:path';

const root=resolve('dist');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.mp3':'audio/mpeg'};
const requested=[];
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  requested.push(url.pathname);
  if(url.pathname.startsWith('/api/')){res.writeHead(503,{'Content-Type':'application/json'}).end('{"error":"offline test"}');return;}
  if(!url.pathname.startsWith('/mario-race/')){res.writeHead(404).end('root assets forbidden');return;}
  const relative=url.pathname.slice('/mario-race/'.length)||'index.html';
  const file=resolve(root,relative);
  if(file!==root&&!file.startsWith(root+sep)){res.writeHead(404).end('not found');return;}
  try{const body=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'}).end(body);}
  catch{res.writeHead(404).end('not found');}
});
await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-gl=angle','--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
  const response=await page.goto(origin+'/mario-race/index.html');
  assert.equal(response.status(),200);
  await page.locator('#loading').waitFor({state:'detached',timeout:15000});
  await page.click('#start');
  await page.waitForTimeout(500);
  const resources=requested.filter(path=>/\.(?:js|css|svg|mp3)$/.test(path));
  assert(resources.some(path=>path.endsWith('.js')),'JavaScript bundle was not requested');
  assert(resources.some(path=>path.endsWith('.css')),'stylesheet was not requested');
  assert(resources.some(path=>path.endsWith('.svg')),'favicon was not requested');
  assert(resources.some(path=>path.endsWith('.mp3')),'race audio was not requested');
  assert(resources.every(path=>path.startsWith('/mario-race/')),`resource escaped CDN directory: ${resources.join(', ')}`);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,url:origin+'/mario-race/index.html',resources},null,2));
}finally{await browser.close();await new Promise(done=>server.close(done));}
