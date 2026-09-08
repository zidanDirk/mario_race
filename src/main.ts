import * as THREE from 'three';
import { buildWorld, createKart } from './world';
import './style.css';
import { KartDriving, wrapAngle } from './driving';
import { mountGarage } from './garage';

const icons = {
 sound:'<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
 mute:'<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 6 6m0-6-6 6"/>',
 full:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
 pause:'<path d="M8 5v14m8-14v14"/>',
 play:'<path d="m8 5 11 7-11 7Z"/>',
};
const svg=(name:keyof typeof icons)=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
const mushroom=`<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M20 38h24v15c0 11-24 11-24 0Z" fill="#fff8dc" stroke="#283b38" stroke-width="3"/><path d="M5 31C5-3 59-3 59 31c0 14-54 14-54 0" fill="#f05743" stroke="#283b38" stroke-width="3"/><ellipse cx="32" cy="18" rx="9" ry="10" fill="#fff8dc"/><ellipse cx="10" cy="28" rx="5" ry="8" fill="#fff8dc"/><ellipse cx="54" cy="28" rx="5" ry="8" fill="#fff8dc"/><path d="M27 47v5m10-5v5" stroke="#283b38" stroke-width="3" stroke-linecap="round"/></svg>`;
const shell=`<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 45C6 6 58 6 56 45Z" fill="#55b66f" stroke="#213f39" stroke-width="3"/><path d="m25 18 15 0 8 16-16 12-16-12Zm7 28v10M16 34 8 39m40-5 8 5" fill="none" stroke="#237445" stroke-width="3"/><ellipse cx="32" cy="47" rx="28" ry="10" fill="#fff6d8" stroke="#213f39" stroke-width="3"/><ellipse cx="32" cy="49" rx="14" ry="6" fill="#294438"/></svg>`;
const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`
<canvas id="world" aria-label="蘑菇王国 3D 赛车赛道"></canvas><div class="vignette"></div>
<header class="topbar"><div class="brand"><div class="brand-mark">M</div><div><span class="wordmark">MARIO KART</span><small>GRAND PRIX</small></div></div><div class="top-middle"><i class="live-dot"></i> 蘑菇杯 · GRAND PRIX</div><nav class="toolbar" aria-label="游戏控制"><button class="icon-button" id="sound" title="打开声音" aria-label="打开声音">${svg('mute')}</button><button class="icon-button" id="fullscreen" title="全屏" aria-label="全屏">${svg('full')}</button><button class="icon-button" id="pause" title="暂停 Esc" aria-label="暂停">${svg('pause')}</button></nav></header>
<section class="track-intro"><div class="eyebrow"><span class="line"></span> WORLD 01 / MUSHROOM CUP</div><h1>蘑菇王国大奖赛<span>MUSHROOM CIRCUIT</span></h1><div class="course-tags"><span>☀ 晴空赛道</span><span>弯道漂移</span><span class="difficulty">难度 <i></i><i></i><i></i></span></div></section>
<div class="world-badge"><div><small>TRACK LENGTH</small><br/><b id="track-length">—</b></div><span class="sun">☀</span></div>
<section class="menu-card" id="menu"><div class="card-top"><span class="label">准备好，向冠军出发</span><span class="cup">🏆</span></div><div class="race-settings"><div><strong>150<span style="font-size:14px">cc</span></strong><small>竞速模式</small></div><div><strong>03</strong><small>比赛圈数</small></div><div><strong>06</strong><small>参赛车手</small></div></div><button id="start" class="start-button"><span>开始比赛</span><span>↗</span></button><p class="start-note">驾驶马里奥 · 按 ENTER 即刻出发</p></section>
<div class="player-tag" id="player-tag">MARIO · YOU</div>
<div class="hud"><div class="lap-cluster"><div class="lap-flag"></div><div><div class="lap-label">LAP / 圈数</div><div class="lap-num"><b id="lap">01</b><span> / 03</span></div></div></div><div class="race-clock"><small>RACE TIME</small><b id="timer">00:00.000</b><div class="coin-counter"><i class="coin-symbol"></i><span id="coins">00</span><span style="opacity:.4;font-size:11px">/ 10</span></div></div><div class="item-cluster"><button id="item" class="item-button" aria-label="使用道具" disabled>?</button><div class="item-help"><kbd>E</kbd> <span id="item-label">拾取道具</span></div></div><div class="rank-panel"><div class="position"><b id="position">6</b><span id="ordinal">th</span><small>当前排名</small></div><div class="leaderboard" id="leaderboard"></div></div><div class="speedometer"><div class="speed-value" id="speed">000</div><div><div class="speed-unit">KM/H</div><div class="speed-bars">${'<i></i>'.repeat(10)}</div></div></div><div class="drift-meter" id="drift"><small id="drift-label">DRIFT CHARGE</small><div class="drift-track"><div class="drift-fill" id="drift-fill"></div></div></div></div>
<div class="map-wrap"><canvas id="minimap" width="440" height="360" aria-label="赛道小地图"></canvas><div class="map-caption">MUSHROOM CIRCUIT / 01</div></div>
<div class="keyboard-hint"><div class="key-group"><kbd>W</kbd><kbd>↑</kbd> 加速 <kbd>S</kbd> 刹车 / 倒车</div><div class="key-group"><kbd>A</kbd><kbd>D</kbd> 转向</div><div class="key-group"><kbd>SPACE</kbd> 跳跃 / 漂移</div><div class="key-group"><kbd>E</kbd> 道具 <kbd>C</kbd> 后视</div></div><div class="course-footer">READY. SET. LET’S-A GO!</div>
<div class="center-event" id="countdown"></div><div class="event-toast" id="toast" role="status"></div>
<div class="touch-controls"><button class="touch-button rear" data-key="KeyC" aria-label="向后看">后视</button><div class="touch-group"><button class="touch-button" data-key="ArrowLeft" aria-label="向左">◀</button><button class="touch-button" data-key="ArrowRight" aria-label="向右">▶</button></div><div class="touch-group"><button class="touch-button brake" data-key="ArrowDown" aria-label="刹车与倒车">刹车</button><button class="touch-button drift" data-key="Space" aria-label="跳跃与漂移">跳跃<br/>漂移</button><button class="touch-button throttle" data-key="ArrowUp" aria-label="加速">加速</button></div></div>
<div class="overlay" id="overlay"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div class="eyebrow" id="dialog-eyebrow">TAKE A BREATHER</div><h2 id="dialog-title">稍作休息</h2><p id="dialog-desc">赛道还在，冠军等你。</p><div id="result"></div><button class="start-button" id="resume"><span>继续比赛</span><span>→</span></button><button class="secondary-button" id="restart">重新开始</button><button class="secondary-button" id="home">返回赛道首页</button></section></div>
<div id="loading"><span>正在准备蘑菇王国…</span></div>`;
const el=(id:string)=>document.getElementById(id)!;
const canvas=el('world') as HTMLCanvasElement;
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<700?1.5:2));
renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.05;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();
scene.background=new THREE.Color('#a9dfee');
scene.fog=new THREE.Fog('#b5e3ea',180,510);
scene.add(new THREE.HemisphereLight('#e3faff','#71a568',2.6));
const sun=new THREE.DirectionalLight('#fff3d7',3.2);
sun.position.set(-80,130,60);sun.castShadow=true;
sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-60;sun.shadow.camera.right=60;sun.shadow.camera.top=60;sun.shadow.camera.bottom=-60;sun.shadow.camera.near=1;sun.shadow.camera.far=300;sun.shadow.bias=-.0005;sun.shadow.normalBias=.08;scene.add(sun,sun.target);
const camera=new THREE.PerspectiveCamera(53,innerWidth/innerHeight,.2,700);
const world=buildWorld(scene);
el('track-length').textContent=(world.trackLength/1000).toFixed(2)+' KM';

type Mode='ready'|'countdown'|'racing'|'paused'|'finished';
type Racer={name:string;key:string;color:number;t:number;lane:number;speed:number;mesh:THREE.Group;stun:number;finish:number|null};
const roster=[{name:'马里奥',key:'mario',color:0xef4939},{name:'路易吉',key:'luigi',color:0x54b877},{name:'碧姬',key:'peach',color:0xf397ba},{name:'耀西',key:'yoshi',color:0x2db64e},{name:'奇诺比奥',key:'toad',color:0x2676d4},{name:'瓦力欧',key:'wario',color:0xf1c52d}];
const racers:Racer[]=roster.map((r,i)=>{const mesh=createKart(r.color,r.key);scene.add(mesh);return {...r,t:(5-i)*.006,lane:i%2===0?-3:3,speed:0,mesh,stun:0,finish:null};});
const player=racers[0];
const driving=new KartDriving(world);
let garage:ReturnType<typeof mountGarage>|undefined;
let lookBack=false,lastLookBack=false,rocketHold=0,itemWasPressed=false;
let gamepadInput={throttle:false,brake:false,steer:0,hop:false,item:false,rear:false};
let padPauseWasPressed=false;
const pointerKeys=new Set<string>();
const down=(...codes:string[])=>codes.some(k=>keys.has(k)||pointerKeys.has(k));
function readInput(){return {throttle:down('KeyW','ArrowUp')||gamepadInput.throttle,brake:down('KeyS','ArrowDown')||gamepadInput.brake,steer:THREE.MathUtils.clamp((down('KeyD','ArrowRight')?1:0)-(down('KeyA','ArrowLeft')?1:0)+gamepadInput.steer,-1,1),hop:down('Space','KeyR')||gamepadInput.hop,item:down('KeyE','KeyQ')||gamepadInput.item,rear:down('KeyC')||gamepadInput.rear};}
function pollGamepad(){if(document.querySelector<HTMLDialogElement>('.driving-guide')?.open){gamepadInput={throttle:false,brake:false,steer:0,hop:false,item:false,rear:false};return;}const pad=Array.from(navigator.getGamepads?.()??[]).find(p=>p?.connected&&p.mapping==='standard');if(!pad){gamepadInput={throttle:false,brake:false,steer:0,hop:false,item:false,rear:false};padPauseWasPressed=false;return;}const nintendo=/nintendo|switch|057e/i.test(pad.id);const pressed=(n:number)=>!!pad.buttons[n]?.pressed;const axis=pad.axes[0]??0;gamepadInput={throttle:pressed(nintendo?1:0),brake:pressed(nintendo?0:1),steer:Math.abs(axis)>.12?axis:0,hop:pressed(5)||pressed(7),item:pressed(4)||pressed(6),rear:pressed(3)};if(pressed(9)&&!padPauseWasPressed){if(mode==='ready')start();else showPause();}padPauseWasPressed=pressed(9);}
let mode:Mode='ready',pausedFrom:Mode='racing';
let raceTime=0,countdown=3.6,coins=0,item:Item|null=null,boost=0,charge=0,wasDrifting=false,steer=0,collisionCooldown=0,toastTime=0,eventTime=0,rank=6,lastLap=1,frame=0,freeze=false;
let rngState=42;
const random=()=>{rngState=(rngState*1664525+1013904223)>>>0;return rngState/4294967296;};
const keys=new Set<string>();
const startProgress=-.028;
const padLocks=new Map<number,number>();
type Item='mushroom'|'green-shell'|'red-shell'|'banana';
const bestKey='mushroom-circuit-manual-v2';
let best:number|null=null;try{best=Number(localStorage.getItem(bestKey))||null;}catch{}
const formatTime=(s:number)=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}.${String(Math.floor((s%1)*1000)).padStart(3,'0')}`;

class AudioEngine{
 ctx:AudioContext|null=null;muted=true;engine:OscillatorNode|null=null;gain:GainNode|null=null;
 unlock(){if(!this.ctx){this.ctx=new AudioContext();this.engine=this.ctx.createOscillator();this.gain=this.ctx.createGain();this.engine.type='sawtooth';this.gain.gain.value=0;this.engine.connect(this.gain).connect(this.ctx.destination);this.engine.start();}void this.ctx.resume();}
 tone(freq:number,duration=.12){if(this.muted||!this.ctx)return;const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type='sine';o.frequency.setValueAtTime(freq,this.ctx.currentTime);o.frequency.exponentialRampToValueAtTime(freq*1.2,this.ctx.currentTime+duration);g.gain.setValueAtTime(.075,this.ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,this.ctx.currentTime+duration);o.connect(g).connect(this.ctx.destination);o.start();o.stop(this.ctx.currentTime+duration);}
 update(){if(this.ctx&&this.gain&&this.engine){const active=mode==='racing'&&!this.muted;this.gain.gain.setTargetAtTime(active?.017:0,this.ctx.currentTime,.08);this.engine.frequency.setTargetAtTime(45+player.speed*2.2,this.ctx.currentTime,.08);}}
}
const audio=new AudioEngine();
function toast(message:string){el('toast').textContent=message;el('toast').classList.add('show');toastTime=2.6;}
function event(message:string,time=1.6){el('countdown').classList.add('small');el('countdown').textContent=message;eventTime=time;}
function reset(){
 garage?.closeControls();driving.reset(startProgress,-3);pointerKeys.clear();rocketHold=0;lookBack=false;lastLookBack=false;itemWasPressed=false;
 projectiles.forEach(p=>scene.remove(p.mesh));projectiles.length=0;
 raceTime=0;coins=0;item=null;boost=0;charge=0;wasDrifting=false;steer=0;collisionCooldown=0;lastLap=1;rank=6;countdown=3.6;rngState=42;eventTime=0;toastTime=0;padLocks.clear();keys.clear();
 racers.forEach((r,i)=>{r.t=startProgress+(i===0?0:(6-i)*.006);r.lane=i%2===0?-3:3;r.speed=0;r.stun=0;r.finish=null;});
 world.pickups.forEach(p=>{p.cooldown=0;p.object.visible=true;});
 el('toast').classList.remove('show');el('countdown').textContent='';el('countdown').classList.remove('small');el('overlay').style.display='none';app.classList.remove('boosting');updateModels(0);updateUI();updateCamera(1,true);
}
function start(){mode='countdown';reset();audio.unlock();app.classList.add('racing');el('countdown').textContent='3';audio.tone(440);updateUI();}
function showPause(){if(mode==='ready'||mode==='finished')return;if(mode==='paused'){resume();return;}pausedFrom=mode;mode='paused';clearInputs();driving.interruptDrift();audio.update();el('dialog-eyebrow').textContent='TAKE A BREATHER';el('dialog-title').textContent='稍作休息';el('dialog-desc').textContent='赛道还在，冠军等你。';el('result').innerHTML='';el('resume').innerHTML='<span>继续比赛</span><span>→</span>';el('overlay').style.display='flex';(el('resume') as HTMLButtonElement).focus();}
function resume(){if(mode==='finished'){start();return;}if(mode!=='paused')return;garage?.closeControls();mode=pausedFrom;clearInputs();el('overlay').style.display='none';}
function home(){mode='ready';reset();app.classList.remove('racing');updateCamera(1,true);}
function finish(){
 player.finish=raceTime;rank=1+racers.filter(r=>r!==player&&(r.finish!==null||r.t>player.t)).length;mode='finished';keys.clear();audio.tone(784,.5);
 if(!best||raceTime<best){best=raceTime;try{localStorage.setItem(bestKey,String(best));}catch{}}
 el('countdown').textContent='';el('dialog-eyebrow').textContent='MUSHROOM CUP · RACE COMPLETE';el('dialog-title').textContent=rank===1?'冠军，漂亮！':`第 ${rank} 名，冲线！`;el('dialog-desc').textContent=rank===1?'这座奖杯属于你，下一场继续保持！':'出弯时释放漂移加速，再向领奖台发起挑战。';
 el('result').innerHTML=`<div class="dialog-symbol">${rank<=3?'🏆':'🏁'}</div><div class="result-stats"><div><b>${formatTime(raceTime)}</b><small>本场用时</small></div><div><b>${formatTime(best!)}</b><small>个人最佳</small></div></div>`;
 el('resume').innerHTML='<span>再来一场</span><span>↗</span>';el('overlay').style.display='flex';(el('resume') as HTMLButtonElement).focus();updateUI();
}
type Projectile={mesh:THREE.Group;kind:Item;heading:number;life:number;age:number;target:Racer|null;position:THREE.Vector3};
const projectiles:Projectile[]=[];
const shellGeo=new THREE.SphereGeometry(.75,18,10,0,Math.PI*2,0,Math.PI/2);
const rimGeo=new THREE.TorusGeometry(.74,.12,7,20);
const shellMaterials={green:new THREE.MeshStandardMaterial({color:0x24a544,roughness:.4}),red:new THREE.MeshStandardMaterial({color:0xe32f37,roughness:.4}),rim:new THREE.MeshStandardMaterial({color:0xffe8ad,roughness:.6})};
function shellMesh(kind:Item){const group=new THREE.Group();if(kind==='banana'){for(let i=0;i<3;i++){const a=i*Math.PI*2/3;const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(0,.8,0),new THREE.Vector3(Math.cos(a)*.6,.7,Math.sin(a)*.6),new THREE.Vector3(Math.cos(a)*.9,0,Math.sin(a)*.9));const peel=new THREE.Mesh(new THREE.TubeGeometry(curve,7,.14,5,false),new THREE.MeshStandardMaterial({color:0xffdb3e}));group.add(peel);}}else{const cap=new THREE.Mesh(shellGeo,kind==='red-shell'?shellMaterials.red:shellMaterials.green);cap.scale.y=.8;group.add(cap);const rim=new THREE.Mesh(rimGeo,shellMaterials.rim);rim.rotation.x=Math.PI/2;group.add(rim);const seams=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(.74,0)),new THREE.LineBasicMaterial({color:0x164d24}));seams.scale.y=.5;seams.position.y=.16;group.add(seams);}return group;}
function useItem(){
 if(mode!=='racing')return;
 if(!item){audio.tone(210,.13);return;}
 if(item==='mushroom'){driving.boost=2.2;toast('🍄 蘑菇加速！可穿越草地');audio.tone(680,.3);}
 else{const rear=lookBack||item==='banana';const heading=driving.heading+(rear?Math.PI:0);const mesh=shellMesh(item);const position=driving.position.clone().add(new THREE.Vector3(Math.sin(heading)*3.3,.35,Math.cos(heading)*3.3));mesh.position.copy(position);scene.add(mesh);
 const ahead=racers.filter(r=>r!==player&&r.finish===null&&r.t>player.t).sort((a,b)=>a.t-b.t)[0]??null;
 projectiles.push({mesh,kind:item,heading,life:item==='banana'?18:8,age:0,target:item==='red-shell'&&!rear?ahead:null,position});
 toast(item==='red-shell'?'红龟壳 · 追踪前方车手':item==='green-shell'?'绿龟壳 · 直线发射':'香蕉 · 留在身后');audio.tone(280,.15);}
 item=null;updateUI();
}
function updateProjectiles(dt:number){
 for(let i=projectiles.length-1;i>=0;i--){const p=projectiles[i];p.life-=dt;p.age+=dt;const before=p.position.clone();
 if(p.kind!=='banana'){if(p.target){const target=world.sample(p.target.t,p.target.lane).position;const goal=Math.atan2(target.x-p.position.x,target.z-p.position.z);p.heading=wrapAngle(p.heading+THREE.MathUtils.clamp(wrapAngle(goal-p.heading),-3.5*dt,3.5*dt));}p.position.x+=Math.sin(p.heading)*75*dt;p.position.z+=Math.cos(p.heading)*75*dt;p.mesh.rotation.y+=dt*7;}
 if(p.kind==='green-shell'||p.kind==='red-shell'){
 let nearest=Infinity,nt=0;for(let k=0;k<180;k++){const point=mapPoints[k];const dist=(p.position.x-point.x)**2+(p.position.z-point.z)**2;if(dist<nearest){nearest=dist;nt=k/180;}}
 const road=world.sample(nt);const lane=p.position.clone().sub(road.position).dot(road.normal);const vx=Math.sin(p.heading),vz=Math.cos(p.heading);const outward=vx*road.normal.x+vz*road.normal.z;
 if(Math.abs(lane)>9.4&&Math.sign(lane)*outward>0){if(p.kind==='green-shell'){p.heading=Math.atan2(vx-2*outward*road.normal.x,vz-2*outward*road.normal.z);p.life-=.45;}else if(!p.target){p.life=0;}}
 }
 p.mesh.position.copy(p.position);const segment=p.position.clone().sub(before),lengthSq=segment.lengthSq();
 for(const r of racers){if(r===player&&p.age<.6)continue;const rp=r===player?driving.position:world.sample(r.t,r.lane).position;const u=lengthSq?THREE.MathUtils.clamp(rp.clone().sub(before).dot(segment)/lengthSq,0,1):0;const closest=before.clone().addScaledVector(segment,u);if(Math.hypot(rp.x-closest.x,rp.z-closest.z)<2){
 if(r===player){driving.stun=1.25;driving.speed*=.2;driving.interruptDrift();coins=Math.max(0,coins-3);toast('被击中！重新加速');}else{r.stun=1.8;r.speed*=.15;toast(`${r.name} 被击中！`);}burst(rp,p.kind==='red-shell'?0xff684e:0x8fe875,20);audio.tone(120,.2);p.life=0;break;}}
 if(p.life<=0){scene.remove(p.mesh);projectiles.splice(i,1);}
 }
}

// Fixed-size effect pool: emitted at pickups, drifts and boosts.
const particleGeo=new THREE.SphereGeometry(.13,5,4),particleMat=new THREE.MeshBasicMaterial({color:0xffffff});
const particles=new THREE.InstancedMesh(particleGeo,particleMat,120);particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);particles.frustumCulled=false;scene.add(particles);
const fx=Array.from({length:120},()=>({position:new THREE.Vector3(),velocity:new THREE.Vector3(),life:0,color:0xffffff}));let fxIndex=0;const matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),scale=new THREE.Vector3();
function burst(position:THREE.Vector3,color:number,count=12){for(let i=0;i<count;i++){const p=fx[fxIndex++%fx.length];p.position.copy(position);p.position.y+=.7;p.velocity.set((random()-.5)*7,random()*4+1,(random()-.5)*7);p.life=.5+random()*.4;p.color=color;}}
function updateParticles(dt:number){fx.forEach((p,i)=>{p.life=Math.max(0,p.life-dt);if(p.life>0){p.position.addScaledVector(p.velocity,dt);p.velocity.y-=7*dt;}scale.setScalar(p.life>0?Math.min(1,p.life*4):0);matrix.compose(p.position,q,scale);particles.setMatrixAt(i,matrix);particles.setColorAt(i,new THREE.Color(p.color));});particles.instanceMatrix.needsUpdate=true;if(particles.instanceColor)particles.instanceColor.needsUpdate=true;}
const playerShadow=new THREE.Mesh(new THREE.CircleGeometry(2.1,24),new THREE.MeshBasicMaterial({color:0x183d34,transparent:true,opacity:.19,depthWrite:false}));playerShadow.rotation.x=-Math.PI/2;scene.add(playerShadow);

function syncDriving(){player.t=driving.progress;player.lane=driving.lane;player.speed=driving.speed;boost=driving.boost;charge=driving.charge;wasDrifting=driving.drifting;steer=driving.steer;}
function step(dt:number){
 if(toastTime>0){toastTime-=dt;if(toastTime<=0)el('toast').classList.remove('show');}
 if(eventTime>0){eventTime-=dt;if(eventTime<=0){el('countdown').textContent='';el('countdown').classList.remove('small');}}
 const input=readInput();lookBack=mode==='racing'&&input.rear;
 if(mode==='countdown'){
 const before=Math.ceil(countdown);countdown-=dt;const after=Math.ceil(countdown);
 rocketHold=input.throttle?rocketHold+dt:0;
 if(before!==after&&after>0){el('countdown').textContent=String(after);audio.tone(440);}
 if(countdown<=0){mode='racing';el('countdown').textContent='GO!';eventTime=1;audio.tone(880,.3);
 if(rocketHold>=1.35&&rocketHold<=2.25){driving.boost=1.8;driving.speed=32;toast('火箭起步！ROCKET START');}
 else if(rocketHold>2.5){driving.stun=1.1;toast('油门过早！下次倒数 2 时起步');}
 else toast('自己掌握方向 · 入弯按空格起跳漂移');}
 }
 if(mode==='racing'){
 raceTime+=dt;collisionCooldown=Math.max(0,collisionCooldown-dt);
 driving.step(input,coins,dt);syncDriving();
 if(input.item&&!itemWasPressed)useItem();itemWasPressed=input.item;
 if(driving.recovered){coins=Math.max(0,coins-3);toast('已救援回赛道 · 损失 3 枚金币');}
 if(driving.releasedTurbo){const names=['','迷你涡轮','超级迷你涡轮','极限迷你涡轮'];toast(`${names[driving.releasedTurbo]} · BOOST!`);audio.tone(650+driving.releasedTurbo*150,.2);}
 if(wasDrifting&&frame%3===0){const color=driving.driftStage===3?0xe174ff:driving.driftStage===2?0xffa038:0x4dafff;for(const side of [-1,1]){const p=driving.position.clone();p.x+=Math.cos(driving.heading)*side*1.35-Math.sin(driving.heading)*1.1;p.z-=Math.sin(driving.heading)*side*1.35+Math.cos(driving.heading)*1.1;burst(p,color,2);}}
 const lap=driving.lap;
 if(lap>lastLap){lastLap=lap;event(lap===3?'最后一圈！':'第 2 圈 · 继续冲刺');audio.tone(900,.25);}
 if(driving.finished){finish();return;}
 racers.forEach((r,i)=>{if(i===0)return;r.stun=Math.max(0,r.stun-dt);const aiSpeed=r.stun>0?9:34+i*.9+Math.floor(r.t)*.5+Math.sin(raceTime*.5+i)*1.5;r.speed=THREE.MathUtils.damp(r.speed,aiSpeed,1.3,dt);r.t+=r.speed*dt/world.trackLength;r.lane=THREE.MathUtils.damp(r.lane,Math.sin(r.t*22+i*2)*4.9,1.5,dt);if(r.t>=3&&r.finish===null)r.finish=raceTime;
 const rp=world.sample(r.t,r.lane).position;const delta=driving.position.clone().sub(rp);delta.y=0;
 if(delta.length()<2.8&&collisionCooldown<=0){driving.speed*=.77;if(delta.lengthSq()<.001)delta.set(1,0,0);driving.position.addScaledVector(delta.normalize(),.9);collisionCooldown=.7;burst(driving.position,0xffe0ae,9);audio.tone(120,.1);}
 });
 world.pickups.forEach(p=>{if(p.cooldown>0){p.cooldown=Math.max(0,p.cooldown-dt);p.object.visible=p.cooldown<=0;return;}if(Math.hypot(p.object.position.x-driving.position.x,p.object.position.z-driving.position.z)<2.5){
 if(p.kind==='item'&&item)return;p.cooldown=7;p.object.visible=false;
 if(p.kind==='coin'){coins=Math.min(10,coins+1);audio.tone(1040,.09);burst(p.object.position,0xffd249,10);}else{const roll=random();item=roll<.35?'mushroom':roll<.6?'red-shell':roll<.85?'green-shell':'banana';toast('获得道具 · 按 E / Q 使用');audio.tone(600,.2);burst(p.object.position,0x9defff,16);}
 }});
 world.boostPads.forEach((p,i)=>{const pos=world.sample(p.t,p.lane).position;if(Math.hypot(pos.x-driving.position.x,pos.z-driving.position.z)<3.8&&(padLocks.get(i)??-100)<raceTime-3){padLocks.set(i,raceTime);driving.boost=1.4;toast('加速带 · 全速前进！');audio.tone(740,.2);}});
 updateProjectiles(dt);syncDriving();
 if(boost>0&&frame%3===0){const back=driving.position.clone().add(new THREE.Vector3(-Math.sin(driving.heading)*1.6,0,-Math.cos(driving.heading)*1.6));burst(back,0xffaa38,3);}
 }
 updateModels(dt);updateParticles(dt);
}
function updateModels(dt:number){
 racers.forEach(r=>{const pos=r===player?driving.position:world.sample(r.t,r.lane).position;
 const relative=pos.clone().sub(driving.position);const viewHeading=driving.heading+(lookBack?Math.PI:0);const depth=relative.x*Math.sin(viewHeading)+relative.z*Math.cos(viewHeading);
 r.mesh.visible=r===player||(mode!=='ready'&&(depth> -3||depth< -23));
 r.mesh.position.copy(pos);r.mesh.position.y+=.04+(r===player?driving.hopHeight:0);
 const s=world.sample(r.t);const heading=r===player?driving.heading:Math.atan2(s.tangent.x,s.tangent.z);
 r.mesh.rotation.set(0,heading,r===player?steer*Math.min(Math.abs(player.speed)/45,1)*.055:0);
 const wheels=r.mesh.userData.wheels as THREE.Object3D[]|undefined;wheels?.forEach(w=>{w.rotation.x+=r.speed*dt*1.8;});
 const front=r.mesh.userData.frontWheels as THREE.Object3D[]|undefined;front?.forEach(w=>{w.rotation.y=r===player?-steer*.38:0;});
 const head=r.mesh.userData.head as THREE.Object3D|undefined;if(head)head.rotation.y=r===player?-steer*.15:0;
 });
 playerShadow.position.copy(driving.position);playerShadow.position.y+=.015;
 world.pickups.forEach(p=>{p.object.rotation.y+=dt*(p.kind==='coin'?2:1);});
}
const lookTarget=new THREE.Vector3(),cameraGoal=new THREE.Vector3();let cameraHeading=0;
function updateCamera(dt:number,snap=false){
 const ready=mode==='ready',mobile=innerWidth<700;
 if(snap||ready)cameraHeading=driving.heading;else cameraHeading=wrapAngle(cameraHeading+wrapAngle(driving.heading-cameraHeading)*(1-Math.exp(-4.5*dt)));
 const forward=new THREE.Vector3(Math.sin(cameraHeading),0,Math.cos(cameraHeading));const normal=new THREE.Vector3(forward.z,0,-forward.x);
 const rear=lookBack&&!ready;if(rear!==lastLookBack){snap=true;lastLookBack=rear;}
 const pos=driving.position,goal=pos.clone();
 if(ready){cameraGoal.copy(pos).addScaledVector(forward,mobile?15:12).addScaledVector(normal,mobile?5.5:7);cameraGoal.y+=mobile?6.3:5.7;goal.addScaledVector(normal,mobile?0:-3.1);goal.y+=2.3;}
 else{const distance=mobile?15:13;cameraGoal.copy(pos).addScaledVector(forward,rear?distance:-distance);cameraGoal.y+=mobile?9:6.8;goal.addScaledVector(forward,rear?-8:9);goal.y+=1.7;}
 if(snap){camera.position.copy(cameraGoal);lookTarget.copy(goal);}else{camera.position.lerp(cameraGoal,1-Math.exp(-8*dt));lookTarget.lerp(goal,1-Math.exp(-8*dt));}
 camera.lookAt(lookTarget);camera.fov=THREE.MathUtils.damp(camera.fov,ready?44:boost>0?63:55,4,dt);camera.updateProjectionMatrix();
 sun.position.set(pos.x-60,110,pos.z+40);sun.target.position.copy(pos);sun.target.updateMatrixWorld();
 if(ready){const projected=pos.clone();projected.y+=5.7;projected.project(camera);el('player-tag').style.left=`${(projected.x*.5+.5)*100}%`;el('player-tag').style.top=`${(-projected.y*.5+.5)*100}%`;el('player-tag').textContent=player.name+' · YOU';}
}
let lastOrder='';
function updateUI(){
 const sorted=[...racers].sort((a,b)=>b.t-a.t);if(mode!=='finished')rank=sorted.indexOf(player)+1;
 (el('pause') as HTMLButtonElement).disabled=mode==='ready'||mode==='finished';el('position').textContent=String(rank);el('ordinal').textContent=['st','nd','rd','th','th','th'][rank-1];
 el('lap').textContent=String(driving.lap).padStart(2,'0');el('timer').textContent=formatTime(raceTime);el('speed').textContent=String(Math.round(Math.abs(player.speed)*3.1)).padStart(3,'0');el('coins').textContent=String(coins).padStart(2,'0');
 const itemButton=el('item') as HTMLButtonElement;const itemValue=item??'none';if(itemButton.dataset.item!==itemValue){itemButton.dataset.item=itemValue;itemButton.innerHTML=item==='mushroom'?mushroom:item==='red-shell'?shell.replaceAll('#55b66f','#e7403a').replaceAll('#237445','#a9242b'):item==='green-shell'?shell:item==='banana'?'🍌':'?';}itemButton.disabled=!item||mode!=='racing';itemButton.classList.toggle('ready',!!item);el('item-label').textContent=item==='mushroom'?'蘑菇加速':item==='red-shell'?'红龟壳 · 追踪':item==='green-shell'?'绿龟壳 · 直射':item==='banana'?'香蕉 · 向后放置':'拾取道具';
 el('drift').classList.toggle('visible',wasDrifting||boost>0);el('drift-label').textContent=boost>0?'TURBO BOOST':driving.driftStage===3?'ULTRA MINI-TURBO':driving.driftStage===2?'SUPER MINI-TURBO':driving.driftStage===1?'MINI-TURBO':'DRIFT CHARGE';el('drift-fill').style.width=(boost>0?100:charge/3.35*100)+'%';el('drift-fill').style.background=driving.driftStage===3?'#dc7eff':driving.driftStage===2||boost>0?'#ffb340':'#55b8ff';app.classList.toggle('boosting',boost>0);
 document.querySelectorAll('.speed-bars i').forEach((b,i)=>b.classList.toggle('lit',i<player.speed/7));
 const order=sorted.map(r=>r.key).join()+Math.floor(raceTime);if(order!==lastOrder){lastOrder=order;el('leaderboard').innerHTML=sorted.map((r,i)=>`<div class="racer-row ${r===player?'you':''}"><span class="rnum">${i+1}</span><i class="dot" style="--racer-color:#${r.color.toString(16).padStart(6,'0')}"></i><span>${r.name}</span><span class="gap">${r===player?'YOU':((r.t-player.t)*world.trackLength/50>=0?'+':'')+((r.t-player.t)*world.trackLength/50).toFixed(1)+'s'}</span></div>`).join('');}
 el('driving-status').textContent=driving.recoveryFlash>0?'救援中':driving.wrongWay?'方向反了！':driving.offRoad?'草地减速':lookBack?'后方视角':'';drawMap();
}
const mapCanvas=el('minimap') as HTMLCanvasElement,ctx=mapCanvas.getContext('2d')!;
const mapPoints=Array.from({length:181},(_,i)=>world.sample(i/180).position);
const minX=Math.min(...mapPoints.map(p=>p.x)),maxX=Math.max(...mapPoints.map(p=>p.x)),minZ=Math.min(...mapPoints.map(p=>p.z)),maxZ=Math.max(...mapPoints.map(p=>p.z));
const mapScale=Math.min(370/(maxX-minX),280/(maxZ-minZ));
function mapPoint(t:number){const p=world.sample(t).position;return {x:220+(p.x-(minX+maxX)/2)*mapScale,y:175+(p.z-(minZ+maxZ)/2)*mapScale};}
function drawMap(){
 ctx.clearRect(0,0,440,360);ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();mapPoints.forEach((_,i)=>{const p=mapPoint(i/180);if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);});ctx.strokeStyle='#21494345';ctx.lineWidth=19;ctx.stroke();ctx.strokeStyle='#fffdf3dc';ctx.lineWidth=10;ctx.stroke();
 const start=mapPoint(0);ctx.fillStyle='#183b3c';ctx.fillRect(start.x-5,start.y-7,10,14);
 racers.filter(r=>r!==player).forEach(r=>{const p=mapPoint(r.t);ctx.fillStyle='#'+r.color.toString(16).padStart(6,'0');ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fffdf3';ctx.lineWidth=2;ctx.stroke();});const p=mapPoint(player.t);ctx.beginPath();ctx.arc(p.x,p.y,9,0,Math.PI*2);ctx.fillStyle='#f24d3c';ctx.fill();ctx.strokeStyle='#fffdf3';ctx.lineWidth=4;ctx.stroke();
}

el('start').addEventListener('click',start);el('restart').addEventListener('click',start);el('resume').addEventListener('click',resume);el('home').addEventListener('click',home);el('pause').addEventListener('click',showPause);el('item').addEventListener('click',useItem);
el('sound').addEventListener('click',()=>{audio.unlock();audio.muted=!audio.muted;el('sound').innerHTML=svg(audio.muted?'mute':'sound');el('sound').setAttribute('aria-label',audio.muted?'打开声音':'静音');el('sound').title=audio.muted?'打开声音':'静音';audio.tone(650);});
el('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(app.requestFullscreen)await app.requestFullscreen();else toast('当前浏览器暂不支持全屏');}catch{toast('当前浏览器暂不支持全屏');}});
window.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Backspace'].includes(e.code))e.preventDefault();if(e.repeat)return;if(e.code==='Enter'&&mode==='ready'){start();return;}if(e.code==='Escape'||e.code==='KeyP'){showPause();return;}if((e.code==='KeyE'||e.code==='KeyQ')&&mode==='racing'){useItem();return;}if(e.code==='Backspace'&&mode==='racing'){driving.recover();coins=Math.max(0,coins-3);toast('已回到赛道 · 损失 3 枚金币');return;}keys.add(e.code);});
window.addEventListener('keyup',e=>keys.delete(e.code));
function clearInputs(){keys.clear();pointerKeys.clear();document.querySelectorAll('.touch-button').forEach(b=>b.classList.remove('pressed'));}
window.addEventListener('blur',()=>{clearInputs();if(mode==='racing'||mode==='countdown')showPause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInputs();if(mode==='racing'||mode==='countdown')showPause();}});
document.querySelectorAll<HTMLButtonElement>('[data-key]').forEach(b=>{const release=()=>{pointerKeys.delete(b.dataset.key!);b.classList.remove('pressed');};b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);pointerKeys.add(b.dataset.key!);b.classList.add('pressed');});b.addEventListener('pointerup',release);b.addEventListener('pointercancel',release);b.addEventListener('lostpointercapture',release);});
window.addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<700?1.5:2));camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();updateCamera(1,true);});

// Read-only diagnostics, and test hooks only when explicitly requested by the QA URL.
const query=new URLSearchParams(location.search);
const qa=query.has('test');
const testWindow=window as unknown as Record<string,unknown>;
if(qa){testWindow.__THREE_GAME_TEST_HOOKS__={
 seed:(seed:number)=>{rngState=seed>>>0;},
 setState:(state:string)=>{freeze=false;mode='ready';reset();app.classList.add('racing');if(state==='active-play'){mode='racing';driving.reset(.12,-3,39);raceTime=12;racers.forEach((r,i)=>{if(i){r.t=.12+(i+.5)*.014;r.lane=i%2===0?3:-3;}});}else if(state==='ready'||state==='hero-asset'){mode='ready';app.classList.remove('racing');}else if(state==='paused'){mode='racing';showPause();}else if(state==='finished'){mode='racing';driving.reset(3,0,0,25);syncDriving();raceTime=65;finish();}else if(state==='near-finish'){mode='racing';driving.reset(2.985,0,40,24);raceTime=60;}else if(state==='straight'){mode='racing';driving.reset(-.06,0,32);racers.slice(1).forEach((r,i)=>r.t=.2+i*.02);}else throw new Error(`Unknown state: ${state}`);syncDriving();updateModels(0);updateUI();updateCamera(1,true);return {state};},
 setPausedForScreenshot:(paused:boolean)=>{freeze=paused;},
 giveItem:(value:Item)=>{item=value;updateUI();},
 placeAtPickup:(kind:'coin'|'item')=>{const p=world.pickups.find(p=>p.kind===kind)!;driving.reset(p.t-2/world.trackLength,p.lane,30);p.cooldown=0;p.object.visible=true;syncDriving();updateModels(0);updateCamera(1,true);},
 trackPoint:(t:number)=>{const p=world.sample(t).position;return {x:p.x,z:p.z};},
 selectDriver:(key:string)=>{selectDriver(key);garage?.select(key);},
 };
}
function selectDriver(key:string){if(mode!=='ready')return;const chosen=racers.find(r=>r.key===key);if(!chosen||chosen===player)return;const old={key:player.key,name:player.name,color:player.color,mesh:player.mesh};Object.assign(player,{key:chosen.key,name:chosen.name,color:chosen.color,mesh:chosen.mesh});Object.assign(chosen,old);lastOrder='';updateModels(0);updateUI();updateCamera(1,true);}
const drivingStatus=document.createElement('div');drivingStatus.id='driving-status';app.append(drivingStatus);
garage=mountGarage(roster,selectDriver);
reset();mode='ready';el('loading').remove();
let previous=performance.now(),accumulator=0;
function loop(now:number){requestAnimationFrame(loop);const dt=Math.min((now-previous)/1000,.1);previous=now;pollGamepad();
 if(!freeze&&mode!=='paused'&&mode!=='finished'){accumulator+=dt;while(accumulator>=1/60){step(1/60);accumulator-=1/60;frame++;}}
 if(!freeze)updateCamera(dt);if(frame%3===0)updateUI();audio.update();renderer.render(scene,camera);
 if(qa)testWindow.__THREE_GAME_DIAGNOSTICS__={mode,frame,raceTime,coins,item,boost,charge,rank,lap:driving.lap,projectiles:projectiles.map(p=>({kind:p.kind,x:p.position.x,z:p.position.z,age:p.age})),lookBack,trackLength:world.trackLength,player:{t:player.t,lane:player.lane,speed:player.speed,heading:driving.heading,travelHeading:driving.travelHeading,hopHeight:driving.hopHeight,stun:driving.stun,driftDirection:driving.driftDirection,driftStage:driving.driftStage,nextGate:driving.nextGate,routeT:driving.routeT,offRoad:driving.offRoad,wrongWay:driving.wrongWay,driver:player.key,x:player.mesh.position.x,y:player.mesh.position.y,z:player.mesh.position.z},renderer:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures},render:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles},memory:renderer.info.memory,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
}
requestAnimationFrame(loop);
