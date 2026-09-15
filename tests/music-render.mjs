import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out='artifacts/audio-v1';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage();
try{
  await page.goto('http://localhost:5173/');
  const rendered=await page.evaluate(async()=>{
    const {renderRaceMusic,MUSIC,FINAL_LAP_RATE}=await import('/src/race-music.ts');
    const results=[];
    for(const track of ['mushroom','castle']){
      const start=performance.now(),buffer=await renderRaceMusic(track),elapsed=performance.now()-start;
      let peak=0,sum=0,finite=true,boundary=0,minWindowRms=Infinity;
      for(let c=0;c<2;c++){
        const data=buffer.getChannelData(c);
        boundary=Math.max(boundary,Math.abs(data[0]-data[data.length-1]));
        for(let i=0;i<data.length;i++){finite&&=Number.isFinite(data[i]);peak=Math.max(peak,Math.abs(data[i]));sum+=data[i]*data[i];}
        for(let i=0;i+8000<data.length;i+=8000){let s=0;for(let j=i;j<i+8000;j++)s+=data[j]*data[j];minWindowRms=Math.min(minWindowRms,Math.sqrt(s/8000));}
      }
      const frames=buffer.length,bytes=new Uint8Array(44+frames*4),view=new DataView(bytes.buffer);
      const word=(at,text)=>{for(let i=0;i<text.length;i++)view.setUint8(at+i,text.charCodeAt(i));};
      word(0,'RIFF');view.setUint32(4,bytes.length-8,true);word(8,'WAVE');word(12,'fmt ');view.setUint32(16,16,true);
      view.setUint16(20,1,true);view.setUint16(22,2,true);view.setUint32(24,buffer.sampleRate,true);view.setUint32(28,buffer.sampleRate*4,true);view.setUint16(32,4,true);view.setUint16(34,16,true);word(36,'data');view.setUint32(40,frames*4,true);
      for(let i=0;i<frames;i++)for(let c=0;c<2;c++)view.setInt16(44+(i*2+c)*2,Math.round(buffer.getChannelData(c)[i]*32767),true);
      let raw='';for(let i=0;i<bytes.length;i+=32768)raw+=String.fromCharCode(...bytes.subarray(i,i+32768));
      results.push({track,title:MUSIC[track].title,bpm:MUSIC[track].bpm,finalBpm:MUSIC[track].bpm*FINAL_LAP_RATE,duration:buffer.duration,renderMs:elapsed,peak,rms:Math.sqrt(sum/(buffer.length*2)),finite,boundary,minWindowRms,wav:btoa(raw)});
    }
    return results;
  });
  for(const result of rendered){
    assert(result.finite);assert(result.peak<=.80001);assert(result.rms>.025&&result.rms<.3);
    assert(result.boundary<.025,`loop seam ${result.track}: ${result.boundary}`);assert(result.minWindowRms>.01);
    assert(Math.abs(result.duration-128*60/result.bpm)<.001);
    await fs.writeFile(`${out}/${result.track}-loop.wav`,Buffer.from(result.wav,'base64'));delete result.wav;
  }
  assert.notEqual(rendered[0].rms,rendered[1].rms);
  await fs.writeFile(out+'/render.json',JSON.stringify({passed:true,rendered},null,2));
  console.log(JSON.stringify({passed:true,rendered},null,2));
}finally{await browser.close();}
