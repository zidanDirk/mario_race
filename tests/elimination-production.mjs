import{chromium}from'@playwright/test';import assert from'node:assert/strict';import{mkdtemp,rm,writeFile}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';import{createApplication}from'../server/app.mjs';import{readConfig}from'../server/config.mjs';
const dir=await mkdtemp(join(tmpdir(),'elimination-production-')),config=readConfig({PUBLIC_ORIGIN:'http://127.0.0.1:5173',DATABASE_PATH:join(dir,'test.sqlite'),DEV_AUTH_ENABLED:'true'}),app=createApplication({config});
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));config.origin=`http://127.0.0.1:${app.server.address().port}`;config.apiOrigin=config.appOrigin=config.origin;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-gl=angle','--use-angle=metal']}),page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],starts=[],finishes=[];
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()!=='POST')return;if(r.url().endsWith('/api/races'))starts.push(r.url());if(r.url().includes('/finish'))finishes.push(r.url());});
try{
  await page.goto(config.origin);await page.locator('#loading').waitFor({state:'detached'});assert.equal(await page.evaluate(()=>typeof window.__THREE_GAME_TEST_HOOKS__),'undefined');
  await page.getByRole('button',{name:'用户登录与云端排行榜'}).click();await page.getByLabel('本地开发测试（非邮箱 / Google 登录）').fill('淘汰赛隔离验证');await page.getByRole('button',{name:'测试登录',exact:true}).click();await page.getByRole('heading',{name:'淘汰赛隔离验证',exact:true}).waitFor();await page.getByRole('button',{name:'关闭排行榜'}).click();
  const ticket=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/api/races'));await page.click('#start');assert.equal((await ticket).status(),201);
  await page.keyboard.press('Escape');await page.click('#home');await page.click('#elimination-select');await page.click('#start');
  // A real idle loss proves failure and record isolation without QA state mutation.
  await page.locator('.elimination-results').waitFor({state:'visible',timeout:65000});
  assert.match(await page.locator('#dialog-title').textContent(),/第 6 名/);assert.match(await page.locator('.elimination-result-metrics').textContent(),/00:30.0/);
  assert.equal(starts.length,1);assert.deepEqual(finishes,[]);assert.equal(app.db.prepare('SELECT COUNT(*) n FROM races').get().n,1);
  assert.equal(app.db.prepare('SELECT COUNT(*) n FROM races WHERE finished_at IS NOT NULL').get().n,0);
  const record=await page.evaluate(()=>JSON.parse(localStorage.getItem('mushroom-elimination-v4-light-standard')));assert.equal(record.last.place,6);assert.equal(record.last.survival,30);
  await page.screenshot({path:'artifacts/elimination-v1/production-loss.png'});await page.locator('#resume').click();await page.locator('#elimination-hud').waitFor({state:'visible'});assert.equal(await page.locator('.elimination-active-count').textContent(),'6 人存活');
  assert.deepEqual(errors,[]);const report={passed:true,checks:['production ordinary URL has no QA hooks','signed-in ordinary GP creates a ticket; elimination runs30real seconds without a ticket, finish upload or cloud result','idle player actually loses at30s, saves isolated local result and retries with all six drivers'],record,errors};
  await writeFile('artifacts/elimination-v1/production.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await app.close();await rm(dir,{recursive:true,force:true});}
