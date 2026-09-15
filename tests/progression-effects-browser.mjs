import {chromium} from '@playwright/test';import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';
import {emptyProgress,applyRace,equipProgress} from '../shared/progression.mjs';
let state=emptyProgress();for(const d of ['2026-01-01','2026-01-02'])state=applyRace(state,{mode:'time-trial',metrics:{orangeDrifts:3,coinsCollected:10,rescues:0,shortcutClears:2}},d);state=equipProgress(state,{paint:'mint',trail:'violet',title:'star'});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-gl=angle','--use-angle=metal']});const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.addInitScript(state=>localStorage.setItem('mushroom-driver-growth-v1-qa',JSON.stringify(state)),state);await page.goto('http://localhost:5173/?test=1');await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__?.frame>3);
 await page.evaluate(()=>{window.__THREE_GAME_TEST_HOOKS__.setState('active-play');window.__THREE_GAME_TEST_HOOKS__.giveItem('mushroom');});await page.keyboard.press('KeyE');await page.waitForFunction(()=>window.__THREE_GAME_TEST_HOOKS__.growth().effectColors.includes(0xbf70ff));await page.screenshot({path:'artifacts/progression-v1/violet-boost.png'});
 await page.getByRole('button',{name:'每日挑战与车手成长'}).click();await page.getByRole('button',{name:'恢复默认紫色尾焰',exact:true}).click();await page.getByRole('button',{name:'关闭每日挑战'}).click();await page.click('#resume');await page.waitForFunction(()=>window.__THREE_GAME_TEST_HOOKS__.growth().effectColors.includes(0xffaa38));
 assert.deepEqual(errors,[]);await writeFile('artifacts/progression-v1/effects.json',JSON.stringify({passed:true,checks:['using a mushroom emits the equipped violet boost effect','restoring default restores orange boost effect'],errors},null,2));
}finally{await browser.close();}
