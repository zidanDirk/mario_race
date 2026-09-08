import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const dir='artifacts/handling-v2';await fs.mkdir(dir,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-gl=angle','--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{await page.goto('http://127.0.0.1:5173/?test=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__);await page.screenshot({path:`${dir}/ready.png`});
for(const key of ['mario','toad','peach','yoshi','luigi','wario']){await page.click(`[data-driver="${key}"]`);await page.screenshot({path:`${dir}/hero-${key}.png`});}
await page.click('[data-driver="mario"]');await page.click('.garage-help');await page.screenshot({path:`${dir}/controls.png`});await page.keyboard.press('Escape');
await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setState('active-play'));await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true));await page.screenshot({path:`${dir}/desktop-active.png`});
await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setState('ready'));await page.screenshot({path:`${dir}/mobile-ready.png`});await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setState('active-play'));await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true));await page.screenshot({path:`${dir}/mobile-active.png`});
console.log(JSON.stringify({errors,diagnostics:await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__)},null,2));}finally{await browser.close();}
