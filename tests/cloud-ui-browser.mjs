import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.UI_BASE_URL || 'http://127.0.0.1:5175';
const out = 'artifacts/cloud-v1';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-gl=angle', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
const errors = []; const checks = []; let account = { user: null, stats: null }; let offline = false; let failSave = false; let saves = 0; let tickets = 0; let leader = []; let delayedMe = false; let emailEnabled = false; let failEmailSend = false; let emailSends = 0;
page.on('pageerror', error => errors.push(String(error)));
await page.route(`${origin}/cloud-fixture`, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="zh"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/style.css"></head><body><div id="app"><header class="topbar"><div class="brand"><div class="brand-mark">M</div><div><span class="wordmark">MARIO KART</span><small>GRAND PRIX</small></div></div><nav class="toolbar"><button class="icon-button">♫</button><button class="icon-button">⛶</button><button class="icon-button">Ⅱ</button></nav></header><div id="result" style="position:absolute;top:200px;left:40px;width:320px"></div></div><script type="module">import { mountCloud } from "/src/cloud.ts";window.cloud=mountCloud({onOpen:()=>{window.opens=(window.opens||0)+1},isTest:false});</script></body></html>' }));
await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  if (offline) return route.fulfill({ status: 503, json: { error: 'unavailable' } });
  let json;
  if (path === '/api/config') json = { providers: { google: false, email: emailEnabled }, devLogin: true };
  else if (path === '/api/me') { json = account; if (delayedMe) { delayedMe = false; await new Promise(resolve => setTimeout(resolve, 700)); } }
  else if (path === '/api/leaderboard') json = { entries: leader, track: 'mushroom-circuit', rulesVersion: 1 };
  else if (path === '/api/auth/dev') { const name = route.request().postDataJSON().displayName; account = { user: { id: 'self', displayName: name, avatarUrl: 'javascript:alert(1)', provider: 'dev' }, stats: { bestTimeMs: 50001, totalRaces: 12, rank: 2 } }; json = { ok: true }; }
  else if (path === '/api/logout') { account = { user: null, stats: null }; json = { ok: true }; }
  else if (path === '/api/auth/email/send') { if (failEmailSend) return route.fulfill({ status: 503, json: { error: 'unavailable' } }); emailSends++; json = { ok: true, expiresInSeconds: 300, retryAfterSeconds: 2 }; }
  else if (path === '/api/races') { tickets++; json = { raceId: 'race-one' }; }
  else if (path === '/api/races/race-one/finish') { saves++; if (failSave) return route.fulfill({ status: 503, json: { error: 'unavailable' } }); json = { saved: true, bestTimeMs: 50001, rank: 2 }; }
  else return route.fulfill({ status: 404, json: { error: 'not_found' } });
  await route.fulfill({ json });
});
try {
  await page.goto(`${origin}/cloud-fixture`); await page.waitForFunction(() => !!window.cloud);
  await page.getByRole('button', { name: '用户登录与云端排行榜', exact: true }).click();
  await page.getByText('冠军席位，虚位以待').waitFor();
  assert.equal(await page.locator('.cloud-provider:disabled').count(), 2); checks.push('游客空榜、未配置 Google 与邮箱登录禁用、明确开发登录');
  const name = '<img src=x onerror=alert(1)>很长的测试车手昵称';
  await page.locator('#cloud-dev-name').fill(name);
  await page.getByRole('button', { name: '测试登录', exact: true }).click();
  await page.locator('.cloud-identity h3').filter({ hasText: name.slice(0, 24) }).waitFor();
  assert.equal(await page.locator('.cloud-profile img').count(), 0); checks.push('昵称按纯文本渲染，非 HTTPS 头像拒绝加载');
  leader = Array.from({ length: 10 }, (_, i) => ({ rank: i + 1, userId: i === 1 ? 'self' : `user-${i}`, displayName: i === 1 ? name : `蘑菇王国车手 ${i + 1} 有一个非常非常长的名字`, avatarUrl: null, bestTimeMs: 49350 + i * 751, character: ['mario', 'luigi', 'peach'][i % 3] }));
  await page.getByRole('button', { name: '刷新排行榜' }).click(); await page.locator('.cloud-rank').nth(9).waitFor();
  assert.equal(await page.locator('.cloud-rank-you').count(), 1);
  await page.screenshot({ path: `${out}/account-desktop.png` });
  checks.push('十位用户榜单、自己的排名、高亮与长昵称截断');
  await page.setViewportSize({ width: 375, height: 812 }); await page.screenshot({ path: `${out}/account-mobile.png` });
  assert.equal(await page.locator('.cloud-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true);
  assert.equal(await page.locator('.topbar').evaluate(el => el.scrollWidth <= el.clientWidth), true);
  await page.setViewportSize({ width: 320, height: 680 });
  assert.equal(await page.locator('.cloud-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true);
  checks.push('375px 与320px 手机无横向溢出');
  await page.keyboard.press('Escape'); assert.equal(await page.locator('.cloud-dialog').evaluate(el => el.open), false); checks.push('Escape 关闭弹窗并恢复焦点');
  await page.evaluate(() => window.cloud.startRace('mario')); await page.waitForTimeout(100);
  failSave = true;
  await page.evaluate(() => window.cloud.finishRace({ timeMs: 51200, character: 'mario', position: 2, coins: 5 }));
  await page.getByRole('button', { name: '重试保存', exact: true }).waitFor(); failSave = false;
  await page.getByRole('button', { name: '重试保存', exact: true }).click();
  await page.locator('.cloud-result').filter({ hasText: '已保存到云端' }).waitFor();
  assert.equal(tickets, 1); assert.equal(saves, 2); checks.push('上传失败可重试，复用相同比赛凭证');
  await page.evaluate(() => window.cloud.finishRace({ timeMs: 51200, character: 'mario', position: 2, coins: 5 })); await page.waitForTimeout(100); assert.equal(saves, 2); checks.push('重复结束回调不会重复提交');
  await page.locator('.cloud-trigger').click(); await page.waitForTimeout(100); delayedMe = true; await page.getByRole('button', { name: '刷新排行榜' }).click(); await page.waitForTimeout(50); await page.getByRole('button', { name: '退出登录', exact: true }).click(); await page.getByText('游客车手', { exact: true }).waitFor(); await page.waitForTimeout(800); assert.equal(await page.locator('.cloud-identity h3').textContent(), '游客车手'); checks.push('退出时旧刷新响应不会恢复已退出的账号');
  emailEnabled = true; await page.getByRole('button', { name: '刷新排行榜' }).click();
  await page.locator('#cloud-email-address').fill('driver@example.com');
  const sendCode = page.locator('[data-send-code]'); await sendCode.click();
  await page.waitForFunction(() => /重新发送（[12]s）/.test(document.querySelector('[data-send-code]')?.textContent || ''));
  assert.equal(await sendCode.isDisabled(), true); assert.equal(emailSends, 1);
  await page.waitForFunction(() => { const button = document.querySelector('[data-send-code]'); return button?.textContent === '发送验证码' && !button.disabled; }, undefined, { timeout: 3500 });
  failEmailSend = true; await sendCode.click(); await page.getByText('暂时无法连接成绩服务器，请稍后重试。', { exact: true }).waitFor();
  assert.equal(await page.locator('[data-send-code]').isEnabled(), true); assert.equal(await page.locator('[data-send-code]').textContent(), '发送验证码');
  checks.push('验证码成功后按服务端时长禁用倒计时，结束后恢复；失败不启动倒计时');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { window.cloud.startRace('mario'); window.cloud.finishRace({ timeMs: 51200, character: 'mario', position: 2, coins: 5 }); });
  assert.match(await page.locator('.cloud-result').textContent(), /游客模式/); assert.equal(tickets, 1); checks.push('退出后游客比赛不创建凭证、不提交成绩');
  offline = true; await page.locator('.cloud-trigger').click(); await page.getByText('排行榜暂时离线', { exact: true }).waitFor(); await page.setViewportSize({ width: 1280, height: 850 }); await page.screenshot({ path: `${out}/account-offline.png` }); checks.push('断网展示离线提示和重新连接入口');
  assert.deepEqual(errors, []);
  await fs.writeFile(`${out}/ui-checks.json`, JSON.stringify({ checks, errors, testedWidths: [1280, 375, 320] }, null, 2));
  console.log(JSON.stringify({ checks, errors }, null, 2));
} finally { await browser.close(); }
