import * as THREE from 'three';
import { buildWorld, createKart } from './world';
import './style.css';
import { KartDriving, wrapAngle } from './driving';
import { mountGarage } from './garage';
import { mountCloud } from './cloud';
import { createCourseHazards, updateCourseHazards, courseContact } from './course';
import { projectShortcut } from './routes';
import { buildCourseVisuals } from './course-visuals';
import './course.css';
import {GhostRecorder,loadGhost,saveGhost,DEFAULT_GHOST_KEY,type GhostRun} from './ghost';
import {GhostView,buildSplitMarkers} from './trial-view';
import './trial.css';
import {mountProgression} from './progression';
import type {Metrics,Equipped} from '../shared/progression.mjs';
import { ItemInventory, isBoostItem, type Item } from './items';
import './items.css';
import {AiCombat,boxLane,HORN_RADIUS,type Difficulty} from './ai-combat';
import {ItemGesture,segmentHitTime} from './combat-input';
import './combat.css';
import {TrickScore,NearPassTracker,loadTrickBest,saveTrickBest,type TrickKind} from './tricks';
import {mountTrickView} from './trick-view';
import {TRACKS,type TrackId} from './tracks';
import {CupSeries} from './cup';
import {mountCupView} from './cup-view';
import {AudioEngine} from './game-audio';
import {EliminationRace} from './elimination';
import {mountEliminationView} from './elimination-view';
import {LOADOUTS,isLoadout,loadLoadout,saveLoadout,type LoadoutId} from './loadouts';
import {mountLoadoutView} from './loadout-view';
import './practice.css';
import {Slipstream,DRAFT_TIME,type DraftRacer} from './slipstream';
import {RampMotion,MUSHROOM_RAMPS,rampDistance} from './ramps';
import {buildRampVisuals,buildRampColliders} from './ramp-visuals';
import {createTechniqueEffects} from './technique-effects';
import './techniques.css';
import './audio.css';
import { moveCircle, segmentDistance, sweepCircle } from './collision';

const icons = {
 sound:'<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
 mute:'<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 6 6m0-6-6 6"/>',
 full:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
 pause:'<path d="M8 5v14m8-14v14"/>',
 play:'<path d="m8 5 11 7-11 7Z"/>',
};
const svg=(name:keyof typeof icons)=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
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
const hemi=new THREE.HemisphereLight('#e3faff','#71a568',2.6);scene.add(hemi);
const sun=new THREE.DirectionalLight('#fff3d7',3.2);
sun.position.set(-80,130,60);sun.castShadow=true;
sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-60;sun.shadow.camera.right=60;sun.shadow.camera.top=60;sun.shadow.camera.bottom=-60;sun.shadow.camera.near=1;sun.shadow.camera.far=300;sun.shadow.bias=-.0005;sun.shadow.normalBias=.08;scene.add(sun,sun.target);
const camera=new THREE.PerspectiveCamera(53,innerWidth/innerHeight,.2,700);
function buildTrackScene(id:TrackId){const root=new THREE.Scene();root.name=`track-${id}`;const world=buildWorld(root,id);if(id==='mushroom'){buildRampVisuals(root,world,MUSHROOM_RAMPS);world.colliders.push(...buildRampColliders(world,MUSHROOM_RAMPS));}const hazards=createCourseHazards(world.shortcuts);hazards.forEach(h=>{if(h.collider)world.colliders.push(h.collider);});const visuals=buildCourseVisuals(root,world.shortcuts,hazards,world.colliders);const markers=buildSplitMarkers(root,world);scene.add(root);return {root,world,hazards,visuals,markers};}
const trackScenes=new Map<TrackId,ReturnType<typeof buildTrackScene>>();
let activeTrack:TrackId='mushroom';const initialTrack=buildTrackScene(activeTrack);trackScenes.set(activeTrack,initialTrack);
let world=initialTrack.world,courseHazards=initialTrack.hazards,courseVisuals=initialTrack.visuals,splitMarkers=initialTrack.markers;
const courseRewards=new Set<string>();
const courseStats={hits:0,clears:0};
let lastCourseRoute:string|null=null;
el('track-length').textContent=(world.trackLength/1000).toFixed(2)+' KM';

type Mode='ready'|'countdown'|'racing'|'paused'|'finished';
type Racer={name:string;key:string;color:number;t:number;lane:number;speed:number;mesh:THREE.Group;stun:number;finish:number|null;hitTime:number;hitKind:Item|null;immune:number};
const roster=[{name:'马里奥',key:'mario',color:0xef4939},{name:'路易吉',key:'luigi',color:0x54b877},{name:'碧姬',key:'peach',color:0xf397ba},{name:'耀西',key:'yoshi',color:0x2db64e},{name:'奇诺比奥',key:'toad',color:0x2676d4},{name:'瓦力欧',key:'wario',color:0xf1c52d}];
const racers:Racer[]=roster.map((r,i)=>{const mesh=createKart(r.color,r.key);scene.add(mesh);return {...r,t:(5-i)*.006,lane:i%2===0?-3:3,speed:0,mesh,stun:0,finish:null,hitTime:0,hitKind:null,immune:0};});
const player=racers[0];
const rampMotions=new Map(racers.map(r=>[r.key,new RampMotion()]));
const drafts=new Map(racers.map(r=>[r.key,new Slipstream()]));
const techniqueEffects=createTechniqueEffects(scene,racers.map(r=>r.key));
const techniqueHud=document.createElement('aside');techniqueHud.className='technique-hud';techniqueHud.hidden=true;techniqueHud.innerHTML='<span></span><div class="technique-track"><div class="technique-fill"></div></div>';app.append(techniqueHud);
const techniqueStats={drafts:0,jumps:0,horns:0,hornClears:0,aiDrafts:0,aiJumps:0,aiHorns:0};
const playerRamp=()=>rampMotions.get(player.key)!;
const currentRamps=()=>activeTrack==='mushroom'?MUSHROOM_RAMPS:[];
let driving=new KartDriving(world);
type RaceMode='grand-prix'|'time-trial';
let raceMode:RaceMode='grand-prix';
let difficulty:Difficulty='standard';
let selectedLoadout:LoadoutId=loadLoadout();
let testDrive=false,practiceReturn:{raceMode:RaceMode;cup:boolean;elimination:boolean}|null=null;
const practiceStats={peak:0,distance:0};
let loadoutView:ReturnType<typeof mountLoadoutView>|undefined;
let cupSelected=false,cup:CupSeries|null=null;let cupTimes:number[]=[];
let eliminationSelected=false,elimination:EliminationRace|null=null;
let eliminationOvertakes=0,eliminationWarningSecond=-1;
const eliminationPasses=new Map<string,{behind:boolean;last:number}>();
const eliminationExits=new Map<string,number>();
function activeRacer(r:Racer){return !eliminationSelected||!elimination||elimination.isActive(r.key);}
const aiCombat=new AiCombat();
const itemGesture=new ItemGesture();
let suppressItemUntilRelease=false;
let heldItem:{kind:Item;mesh:THREE.Group}|null=null;
let playerItemSafeUntil=7;
const aiBoost=new Map<string,number>();
const aiBadges=new Map<string,{kind:Item;mesh:THREE.Group}>();
const combatStats={blocks:0,aiHits:0,playerHits:0,warnings:0};
const trickScore=new TrickScore(),nearPasses=new NearPassTracker();
let trickBest:number|null=null,trickSafeUntil=0,trickActiveRoute:string|null=null,trickRouteEntry:string|null=null;
function trickRecordKey(){return `${selectedLoadout}-handling1-techniques1-${eliminationSelected?'elimination':cupSelected?'cup-'+activeTrack:'mushroom'}-tricks-v1-${raceMode}-${raceMode==='time-trial'?'standard':difficulty}${new URLSearchParams(location.search).has('test')?'-qa':''}`;}
function trickValid(){return mode==='racing'&&raceTime>=trickSafeUntil&&driving.speed>=12&&!driving.offRoad&&!driving.wrongWay&&!driving.checkpointMissed&&driving.stun<=0&&driving.recoveryFlash<=0;}
function awardTrick(kind:TrickKind,key?:string){if(!trickValid())return;const points=trickScore.award(kind,key);if(points)audio.tone(760+trickScore.snapshot().multiplier*90,.12);}
function breakTricks(reason:string){trickScore.breakChain(reason);trickSafeUntil=raceTime+1.3;trickRouteEntry=null;}

let threatWasVisible=false;
const ghostKey=()=>DEFAULT_GHOST_KEY+'-handling1-techniques1-'+selectedLoadout+(new URLSearchParams(location.search).has('test')?'-qa':'');
let personalGhost:GhostRun|null=null;try{personalGhost=loadGhost(localStorage,ghostKey());}catch{}
let referenceGhost:GhostRun|null=null,recorder:GhostRecorder|null=null;
let trialSplits:number[]=[];let ghostEnabled=true;let trialNotice='';
const ghostView=new GhostView(scene,key=>racers.find(r=>r.key===key)!.mesh);
let garage:ReturnType<typeof mountGarage>|undefined;
let cloud:ReturnType<typeof mountCloud>|undefined;
let progression:ReturnType<typeof mountProgression>|undefined;
let equipped:Equipped={paint:'standard',trail:'standard',title:'rookie'};
const challengeMetrics:Metrics={orangeDrifts:0,coinsCollected:0,rescues:0,shortcutClears:0};
function applyCosmetics(value:Equipped){equipped={...value};for(const r of racers)r.mesh.traverse(o=>{if(o instanceof THREE.Mesh&&!Array.isArray(o.material)&&o.material instanceof THREE.MeshStandardMaterial&&o.material.userData.kartPaint){const m=o.material;m.color.setHex(r===player&&value.paint==='mint'?(m.userData.kartPaint==='dark'?0x167f6b:0x47d9b1):m.userData.originalColor);}});}
let lookBack=false,lastLookBack=false,rocketHold=0,itemWasPressed=false;
let gamepadInput={throttle:false,brake:false,steer:0,hop:false,item:false,rear:false};
let padPauseWasPressed=false;
const pointerKeys=new Set<string>();
const down=(...codes:string[])=>codes.some(k=>keys.has(k)||pointerKeys.has(k));
function readInput(){return {throttle:down('KeyW','ArrowUp')||gamepadInput.throttle,brake:down('KeyS','ArrowDown')||gamepadInput.brake,steer:THREE.MathUtils.clamp((down('KeyD','ArrowRight')?1:0)-(down('KeyA','ArrowLeft')?1:0)+gamepadInput.steer,-1,1),hop:down('Space','KeyR')||gamepadInput.hop,item:down('KeyE','KeyQ')||gamepadInput.item,rear:down('KeyC')||gamepadInput.rear};}
function pollGamepad(){if(loadoutView?.isOpen()||progression?.isOpen()||cloud?.isOpen()||document.querySelector<HTMLDialogElement>('.driving-guide')?.open){gamepadInput={throttle:false,brake:false,steer:0,hop:false,item:false,rear:false};return;}const pad=Array.from(navigator.getGamepads?.()??[]).find(p=>p?.connected&&p.mapping==='standard');if(!pad){if(gamepadInput.item)cancelItemGesture();gamepadInput={throttle:false,brake:false,steer:0,hop:false,item:false,rear:false};padPauseWasPressed=false;return;}const nintendo=/nintendo|switch|057e/i.test(pad.id);const pressed=(n:number)=>!!pad.buttons[n]?.pressed;const axis=pad.axes[0]??0;gamepadInput={throttle:pressed(nintendo?1:0),brake:pressed(nintendo?0:1),steer:Math.abs(axis)>.12?axis:0,hop:pressed(5)||pressed(7),item:pressed(4)||pressed(6),rear:pressed(3)};if(pressed(9)&&!padPauseWasPressed){if(mode==='ready')start();else showPause();}padPauseWasPressed=pressed(9);}
let mode:Mode='ready',pausedFrom:Mode='racing';
let raceTime=0,countdown=3.6,coins=0,boost=0,charge=0,wasDrifting=false,steer=0,collisionCooldown=0,toastTime=0,eventTime=0,rank=6,lastLap=1,frame=0,freeze=false;
let rngState=42;
const random=()=>{rngState=(rngState*1664525+1013904223)>>>0;return rngState/4294967296;};
const keys=new Set<string>();
const startProgress=-.028;
const padLocks=new Map<number,number>();
const inventory=new ItemInventory();
let cameraImpact=0;
const interactionStats={railHits:0,propHits:0,kartHits:0,boxes:0,itemAwards:0,hits:0,shellBounces:0};
const bestKey=()=>`mushroom-combat-standard-v5-${selectedLoadout}${new URLSearchParams(location.search).has('test')?'-qa':''}`;
let best:number|null=null;try{best=Number(localStorage.getItem(bestKey()))||null;}catch{}
const formatTime=(s:number)=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}.${String(Math.floor((s%1)*1000)).padStart(3,'0')}`;

const audio=new AudioEngine();
let audioProblem:string|null=null;
function toast(message:string){el('toast').textContent=message;el('toast').classList.add('show');toastTime=2.6;}
function event(message:string,time=1.6){el('countdown').classList.add('small');el('countdown').textContent=message;eventTime=time;}
function reset(){
 audio.reset(activeTrack);
 for(const motion of rampMotions.values())motion.reset();for(const draft of drafts.values())draft.reset();techniqueEffects.reset();Object.keys(techniqueStats).forEach(k=>techniqueStats[k as keyof typeof techniqueStats]=0);
 driving.lapLimit=eliminationSelected||testDrive?null:3;driving.handling=LOADOUTS[selectedLoadout].handling;practiceStats.peak=0;practiceStats.distance=0;
 elimination=null;
 eliminationOvertakes=0;eliminationWarningSecond=-1;eliminationPasses.clear();eliminationExits.clear();
 trickScore.reset();nearPasses.reset();trickSafeUntil=0;trickActiveRoute=trickRouteEntry=null;trickBest=null;try{trickBest=loadTrickBest(localStorage,trickRecordKey());}catch{}
 cloud?.cancelRace();cancelItemGesture();aiCombat.reset(racers.filter(r=>r!==player).map(r=>r.key));aiBoost.clear();playerItemSafeUntil=difficulty==='casual'?11:7;Object.keys(combatStats).forEach(k=>combatStats[k as keyof typeof combatStats]=0);threatWasVisible=false;progression?.cancelRace();Object.keys(challengeMetrics).forEach(k=>challengeMetrics[k as keyof Metrics]=0);
 recorder=null;trialSplits=[];referenceGhost=personalGhost;trialNotice='';ghostView.setRun(raceMode==='time-trial'&&!testDrive?referenceGhost:null);
 courseRewards.clear();courseStats.hits=courseStats.clears=0;lastCourseRoute=null;updateCourseHazards(courseHazards,0);courseVisuals.update(0);
 garage?.closeControls();driving.reset(startProgress,-3);pointerKeys.clear();rocketHold=0;lookBack=false;lastLookBack=false;itemWasPressed=false;
 projectiles.forEach(p=>scene.remove(p.mesh));projectiles.length=0;
 raceTime=0;coins=0;inventory.reset();cameraImpact=0;Object.keys(interactionStats).forEach(k=>interactionStats[k as keyof typeof interactionStats]=0);fx.forEach(p=>p.life=0);shards.forEach(p=>p.life=0);boost=0;charge=0;wasDrifting=false;steer=0;collisionCooldown=0;lastLap=1;rank=6;countdown=3.6;rngState=42;eventTime=0;toastTime=0;padLocks.clear();keys.clear();
 racers.forEach((r,i)=>{r.t=startProgress+(i===0?0:(6-i)*.006);r.lane=i%2===0?-3:3;r.mesh.scale.setScalar(1);r.speed=0;r.stun=0;r.finish=null;r.hitTime=0;r.hitKind=null;r.immune=0;});
 world.pickups.forEach(p=>{p.cooldown=0;p.object.visible=!testDrive&&(raceMode!=='time-trial'||p.kind==='coin');p.object.scale.setScalar(1);});
 elimination=eliminationSelected?new EliminationRace([...racers].sort((a,b)=>b.t-a.t).map(r=>({id:r.key,name:r.name})),player.key):null;
 el('restart').textContent=cupSelected?'重跑本站':'重新开始';el('home').textContent=cupSelected?'退出杯赛，返回首页':'返回赛道首页';
 el('toast').classList.remove('show');el('countdown').textContent='';el('countdown').classList.remove('small');el('overlay').style.display='none';app.classList.remove('boosting');updateModels(0);updateUI();updateCamera(1,true);
}
function start(){
 loadoutView?.close();
 if(cupSelected){if(!cup||cup.complete){cup=new CupSeries(roster.map(r=>({id:r.key,name:r.name})),player.key,difficulty);cupTimes=[];}else if(cup.snapshot().awaitingNext)cup.retryRound();activateTrack(cup.stageIndex===0?'mushroom':'castle');}
 mode='countdown';reset();if(raceMode==='time-trial'&&!testDrive)recorder=new GhostRecorder(player.key);
 if(!cupSelected&&!eliminationSelected&&!testDrive){progression?.startRace(raceMode);cloud?.startRace(player.key,raceMode,raceMode==='time-trial'?'standard':difficulty,selectedLoadout);}
 audio.unlock();app.classList.add('racing');el('countdown').textContent='3';audio.tone(440);updateUI();
}
function showPause(){if(mode==='ready'||mode==='finished')return;if(mode==='paused'){resume();return;}pausedFrom=mode;mode='paused';clearInputs();driving.interruptDrift();updateAudio();el('dialog-eyebrow').textContent='TAKE A BREATHER';el('dialog-title').textContent='稍作休息';el('dialog-desc').textContent='赛道还在，冠军等你。';el('result').innerHTML='';el('resume').innerHTML='<span>继续比赛</span><span>→</span>';el('overlay').style.display='flex';(el('resume') as HTMLButtonElement).focus();}
function resume(){if(mode==='finished'){if(cupSelected&&cup&&!cup.complete&&cup.advance())activateTrack('castle');start();return;}if(mode!=='paused')return;garage?.closeControls();mode=pausedFrom;audio.unlock();clearInputs();el('overlay').style.display='none';}
function home(){if(testDrive){endTestDrive();return;}mode='ready';cup=null;cupTimes=[];activateTrack('mushroom');if(cupSelected)refreshCupHistory();if(eliminationSelected)refreshEliminationHistory();reset();app.classList.remove('racing');updateCamera(1,true);}
function finish(){
 cancelItemGesture();player.finish=raceTime;rank=raceMode==='time-trial'?1:1+racers.filter(r=>r!==player&&(r.finish!==null||r.t>player.t)).length;mode='finished';keys.clear();audio.finish(rank);
 if(!cupSelected&&raceMode==='grand-prix'&&difficulty==='standard'&&(!best||raceTime<best)){best=raceTime;try{localStorage.setItem(bestKey(),String(best));}catch{}}
 el('countdown').textContent='';el('dialog-eyebrow').textContent='MUSHROOM CUP · RACE COMPLETE';el('dialog-title').textContent=rank===1?'冠军，漂亮！':`第 ${rank} 名，冲线！`;el('dialog-desc').textContent=rank===1?'这座奖杯属于你，下一场继续保持！':'出弯时释放漂移加速，再向领奖台发起挑战。';
 el('result').innerHTML=`<div class="dialog-symbol">${rank<=3?'🏆':'🏁'}</div><div class="result-stats"><div><b>${formatTime(raceTime)}</b><small>本场用时</small></div><div><b>${best?formatTime(best):'—'}</b><small>${raceMode==='grand-prix'?'标准本机最佳':'本机最佳'}</small></div></div>`;
 if(raceMode==='time-trial')finishTrial();
 if(raceMode==='grand-prix'&&difficulty==='casual'){const note=document.createElement('p');note.textContent='休闲竞速 · 可完成每日挑战，不计标准竞速排名';el('result').append(note);}
 trickScore.finish();const trickSnapshot=trickScore.snapshot(),improved=trickSnapshot.score>0&&(trickBest===null||trickSnapshot.score>trickBest);let trickSaved=true;
 if(improved){try{trickSaved=saveTrickBest(localStorage,trickRecordKey(),trickSnapshot.score);}catch{trickSaved=false;}if(trickSaved)trickBest=trickSnapshot.score;}
 trickView.result(el('result'),trickSnapshot,{best:trickBest,improved,saved:trickSaved});
 const exploration=document.createElement('p');exploration.textContent=`捷径加速 ${courseStats.clears} 次 · 机关碰撞 ${courseStats.hits} 次`;el('result').append(exploration);
 if(!cupSelected)progression?.finishRace({...challengeMetrics});
 if(!cupSelected)cloud?.finishRace({timeMs:Math.round(raceTime*1000),character:player.key,position:rank,coins,metrics:{...challengeMetrics}});
 el('resume').innerHTML='<span>再来一场</span><span>↗</span>';if(cupSelected&&cup)finishCupRound();el('overlay').style.display='flex';(el('resume') as HTMLButtonElement).focus();updateUI();
}
type Projectile={owner:Racer;routeId:string|null;birth:THREE.Vector3|null;mesh:THREE.Group;kind:Item;heading:number;life:number;age:number;target:Racer|null;position:THREE.Vector3;routeT:number;lane:number};
const projectiles:Projectile[]=[];
const shellGeo=new THREE.SphereGeometry(.75,18,10,0,Math.PI*2,0,Math.PI/2);
const rimGeo=new THREE.TorusGeometry(.74,.12,7,20);
const shellMaterials={green:new THREE.MeshStandardMaterial({color:0x24a544,roughness:.4}),red:new THREE.MeshStandardMaterial({color:0xe32f37,roughness:.4}),rim:new THREE.MeshStandardMaterial({color:0xffe8ad,roughness:.6})};
const shellSeams=new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(.74,0));
const shellLine=new THREE.LineBasicMaterial({color:0x164d24});
const bananaMaterial=new THREE.MeshStandardMaterial({color:0xffdb3e});
const bananaGeometries=Array.from({length:3},(_,i)=>{const a=i*Math.PI*2/3;return new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0,.8,0),new THREE.Vector3(Math.cos(a)*.6,.7,Math.sin(a)*.6),new THREE.Vector3(Math.cos(a)*.9,0,Math.sin(a)*.9)),7,.14,5,false);});
const hornBell=new THREE.CylinderGeometry(.9,.3,1.3,14,1,true),hornHandle=new THREE.BoxGeometry(.35,.8,.35),hornMaterial=new THREE.MeshStandardMaterial({color:0xffbc35,metalness:.3,roughness:.4,side:THREE.DoubleSide});
const badgeStem=new THREE.SphereGeometry(.4,10,6);
function itemBadge(kind:Item){
 if(kind==='super-horn'){const group=new THREE.Group(),bell=new THREE.Mesh(hornBell,hornMaterial),handle=new THREE.Mesh(hornHandle,shellMaterials.red);bell.rotation.x=Math.PI/2;handle.position.y=-.5;group.add(bell,handle);return group;}
 if(kind==='triple-mushroom'){const group=new THREE.Group();for(let i=0;i<3;i++){const m=itemBadge('mushroom');m.scale.setScalar(.64);m.position.set(Math.cos(i*2*Math.PI/3)*.7,0,Math.sin(i*2*Math.PI/3)*.7);group.add(m);}return group;}
 if(kind!=='mushroom')return shellMesh(kind);const group=new THREE.Group(),stem=new THREE.Mesh(badgeStem,shellMaterials.rim),cap=new THREE.Mesh(shellGeo,shellMaterials.red);stem.scale.y=1.3;cap.position.y=.4;group.add(stem,cap);return group;}
function shellMesh(kind:Item){const group=new THREE.Group();if(kind==='banana'){for(const geometry of bananaGeometries)group.add(new THREE.Mesh(geometry,bananaMaterial));}else{const cap=new THREE.Mesh(shellGeo,kind==='red-shell'?shellMaterials.red:shellMaterials.green);cap.scale.y=.8;group.add(cap);const rim=new THREE.Mesh(rimGeo,shellMaterials.rim);rim.rotation.x=Math.PI/2;group.add(rim);const seams=new THREE.LineSegments(shellSeams,shellLine);seams.scale.y=.5;seams.position.y=.16;group.add(seams);}return group;}
function racerPosition(r:Racer){if(r===player)return driving.position;const p=world.sample(r.t,r.lane).position;p.y+=rampMotions.get(r.key)!.height;return p;}
function racerHeight(r:Racer){return racerPosition(r).y+(r===player?driving.hopHeight:0);}
function clearLine(a:{x:number;z:number},b:{x:number;z:number}){return !sweepCircle(a,{x:b.x-a.x,z:b.z-a.z},.1,world.colliders);}
function hornAffects(owner:Racer,target:{x:number;z:number},height:number){const origin=racerPosition(owner);return Math.hypot(target.x-origin.x,target.z-origin.z)<=HORN_RADIUS&&Math.abs(racerHeight(owner)-height)<=2.5&&clearLine(origin,target);}
function canAiHorn(id:string,targetId:string|null){
 const owner=racers.find(r=>r.key===id)!;
 if(hornAffects(owner,racerPosition(player),racerHeight(player))&&(targetId!==player.key||raceTime<playerItemSafeUntil||player.immune>0||driving.stun>0||driving.recoveryFlash>0))return false;
 const target=racers.find(r=>r.key===targetId);
 return !!target&&hornAffects(owner,racerPosition(target),racerHeight(target))||projectiles.some(p=>p.life>0&&p.owner!==owner&&hornAffects(owner,p.position,p.position.y));
}
function fireHorn(owner:Racer){
 const origin=racerPosition(owner);techniqueEffects.horn(origin);let cleared=0,hits=0;
 for(let i=projectiles.length-1;i>=0;i--){const p=projectiles[i];if(p.life>0&&hornAffects(owner,p.position,p.position.y)){scene.remove(p.mesh);projectiles.splice(i,1);cleared++;}}
 if(owner!==player&&heldItem&&hornAffects(owner,heldItem.mesh.position,heldItem.mesh.position.y)&&raceTime>=playerItemSafeUntil&&player.immune<=0&&driving.recoveryFlash<=0){inventory.consume();itemGesture.breakHold();detachHeld();}
 for(const r of racers){if(r===owner||!activeRacer(r)||r.finish!==null||r.immune>0||r===player&&owner!==player&&(raceTime<playerItemSafeUntil||driving.recoveryFlash>0))continue;if(hornAffects(owner,racerPosition(r),racerHeight(r))){damageRacer(r,'super-horn',owner);hits++;}}
 if(owner===player){techniqueStats.horns++;techniqueStats.hornClears+=cleared;toast(`超级喇叭！清除 ${cleared} 个道具 · 击退 ${hits} 辆车`);}else techniqueStats.aiHorns++;
 if(owner===player||origin.distanceTo(driving.position)<35){audio.tone(220,.22);audio.tone(330,.18);audio.tone(440,.12);}
}
function updateDrafts(dt:number){
 if(raceMode!=='grand-prix'||testDrive)return;
 const entries:DraftRacer[]=racers.map(r=>{const p=racerPosition(r);return {id:r.key,x:p.x,z:p.z,height:racerHeight(r),heading:racerHeading(r),speed:r.speed,progress:r.t,route:r===player?driving.shortcutId:null,eligible:activeRacer(r)&&r.finish===null&&r.stun<=0&&(r!==player||driving.stun<=0&&!driving.offRoad&&!driving.wrongWay&&driving.recoveryFlash<=0)&&!rampMotions.get(r.key)!.airborne};});
 for(const r of racers){const draft=drafts.get(r.key)!;draft.step(dt,entries.find(e=>e.id===r.key)!,entries,clearLine);if(draft.triggered){if(r===player){driving.boost=Math.max(driving.boost,1);techniqueStats.drafts++;toast('尾流加速！变线超越');audio.tone(840,.2);}else{aiBoost.set(r.key,Math.max(aiBoost.get(r.key)??0,1));techniqueStats.aiDrafts++;}}}
}
function updateTechniqueUI(){
 const ramp=playerRamp(),draft=drafts.get(player.key)!;let label='',progress=0,kind='draft';
 if(mode==='racing'){
  if(ramp.trick){label='技巧成功 · 等待落地加速';progress=1;kind='jump';}
  else if(ramp.trickReady){label='现在按漂移键！';progress=1;kind='jump';}
  else if(ramp.activeRamp&&!ramp.airborne){label='跳台起跳时 · 点按漂移键';progress=.35;kind='jump';}
  else if(draft.charge>0){label='保持跟车 · 尾流蓄力';progress=draft.charge/DRAFT_TIME;}
  else if(currentRamps().some(r=>{const d=rampDistance(driving.routeT,r,world.trackLength);return d>=-35&&d<0;})){label='右侧跳台 · 左侧平路';kind='jump';}
 }
 techniqueHud.hidden=!label;techniqueHud.dataset.kind=kind;const span=techniqueHud.querySelector('span')!;if(span.textContent!==label)span.textContent=label;(techniqueHud.querySelector('.technique-fill') as HTMLElement).style.transform=`scaleX(${progress})`;
}
function racerHeading(r:Racer){const t=world.sample(r.t).tangent;return r===player?driving.heading:Math.atan2(t.x,t.z);}
function detachHeld(){if(heldItem)scene.remove(heldItem.mesh);heldItem=null;}
function cancelItemGesture(){suppressItemUntilRelease=true;itemGesture.cancel();detachHeld();}
function pressItem(){
 if(suppressItemUntilRelease||mode!=='racing'||raceMode!=='grand-prix'||driving.stun>0)return;
 if(itemGesture.press(inventory.slots[0]??null)==='use')useItem();
}
function releaseItem(){if(suppressItemUntilRelease){suppressItemUntilRelease=false;itemGesture.cancel();detachHeld();return;}const slot=itemGesture.release();detachHeld();if(slot&&slot===inventory.slots[0]&&mode==='racing'&&driving.stun<=0)useItem();}
function updateItemGesture(input:boolean,dt:number){
 if(suppressItemUntilRelease){if(!input)suppressItemUntilRelease=false;return;}
 if(input&&!itemGesture.down)pressItem();else if(!input&&itemGesture.down)releaseItem();
 if(itemGesture.slot&&itemGesture.slot!==inventory.slots[0]){itemGesture.breakHold();detachHeld();}
 if(itemGesture.step(dt)&&itemGesture.slot?.item){const kind=itemGesture.slot.item;heldItem={kind,mesh:shellMesh(kind)};scene.add(heldItem.mesh);toast('后挂防御 · 松开投出，按 C 可向后投壳');}
 if(heldItem){heldItem.mesh.position.copy(driving.position).add(new THREE.Vector3(-Math.sin(driving.heading)*3.2,.48+driving.hopHeight,-Math.cos(driving.heading)*3.2));heldItem.mesh.rotation.y=driving.heading;}
}
function useItem(){
 if(raceMode!=='grand-prix'||mode!=='racing'||driving.stun>0)return;
 if(!inventory.item&&inventory.rolling){inventory.hurry();audio.tone(750,.05);updateUI();return;}
 const item=inventory.consume();if(!item){audio.tone(210,.13);return;}
 const ahead=racers.filter(r=>r!==player&&activeRacer(r)&&r.finish===null&&r.t>player.t).sort((a,b)=>a.t-b.t)[0]??null;
 fireItem(player,item,lookBack||item==='banana',item==='red-shell'&&!lookBack?ahead:null);updateUI();
}
function fireItem(owner:Racer,item:Item,rear:boolean,target:Racer|null){
 if(!activeRacer(owner)||target&&!activeRacer(target))return;
 if(isBoostItem(item)){
   if(owner===player){driving.boost=Math.max(driving.boost,2.2);toast(item==='triple-mushroom'?`三重蘑菇 · 剩余 ${inventory.item==='triple-mushroom'?inventory.slots[0]?.charges??0:0} 次`:'🍄 蘑菇加速！可穿越草地');audio.tone(680,.3);}
   else aiBoost.set(owner.key,2.2);
   return;
 }
 if(item==='super-horn'){fireHorn(owner);return;}
 const origin=racerPosition(owner),heading=racerHeading(owner)+(rear?Math.PI:0),mesh=shellMesh(item);
 const launch=new THREE.Vector3(Math.sin(heading)*3.3,0,Math.cos(heading)*3.3),obstruction=sweepCircle(origin,launch,.78,world.colliders);
 const position=origin.clone().addScaledVector(launch,obstruction?obstruction.time:1);position.y+=.35;
 let actualHeading=heading;
 if(obstruction){position.x+=obstruction.normal.x*.015;position.z+=obstruction.normal.z*.015;
   if(item==='red-shell'){burst(position,0xffe8a1,10);return;}
   if(item==='green-shell'){const inward=launch.x*obstruction.normal.x+launch.z*obstruction.normal.z;actualHeading=Math.atan2(launch.x-2*inward*obstruction.normal.x,launch.z-2*inward*obstruction.normal.z);interactionStats.shellBounces++;}
 }
 mesh.position.copy(position);scene.add(mesh);
 projectiles.push({owner,routeId:owner===player?driving.shortcutId:null,birth:origin.clone(),mesh,kind:item,heading:actualHeading,position,life:item==='banana'?18:8,age:0,target,routeT:(owner===player?driving.routeT:owner.t)+(rear?-3.3:3.3)/world.trackLength,lane:owner===player?driving.lane:owner.lane});
 if(owner===player){toast(item==='red-shell'?(rear?'红龟壳 · 向后直射':'红龟壳 · 追踪前方车手'):item==='green-shell'?'绿龟壳 · 直线发射':'香蕉 · 留在身后');audio.tone(280,.15);}
}
function damageRacer(r:Racer,kind:Item,owner?:Racer){
 if(r.immune>0||r.finish!==null||r===player&&driving.recoveryFlash>0)return;
 rampMotions.get(r.key)!.trick=false;rampMotions.get(r.key)!.cancelInput();drafts.get(r.key)!.reset();
 r.hitTime=kind==='banana'?.85:1.1;r.hitKind=kind;r.immune=r===player&&raceMode==='grand-prix'?(difficulty==='casual'?4.5:3):1.65;
 if(r===player){
   breakTricks(kind==='banana'?'打滑中断':'受击中断');
   if(heldItem){inventory.consume();detachHeld();}itemGesture.breakHold();
   playerItemSafeUntil=raceTime+(difficulty==='casual'?6:4);driving.stun=1.25;driving.boost=0;driving.speed*=.15;driving.interruptDrift();const lost=Math.min(3,coins);coins-=lost;if(lost)burst(driving.position,0xffce35,lost*8);cameraImpact=.35;interactionStats.hits++;if(owner&&owner!==player)combatStats.playerHits++;toast(kind==='banana'?'踩到香蕉！失控打滑':kind==='super-horn'?'被超级喇叭击退！重新加速':'被龟壳击中！重新加速');
 }else{r.stun=1.4;r.speed*=.15;aiBoost.delete(r.key);if(owner===player)toast(`${r.name} 被击中！`);if(owner&&owner!==player)combatStats.aiHits++;}
 burst(racerPosition(r),0xffe276,22);if(r===player||owner===player)audio.tone(120,.2);
}
/** Test each actual travel segment, so a ricochet cannot hit through its skipped chord. */
function projectileContact(p:Projectile,a:THREE.Vector3,b:THREE.Vector3){
 let at=Infinity,victim:Racer|null=null,blocked=false;
 if(heldItem&&itemGesture.slot===inventory.slots[0]&&p.owner!==player&&Math.abs(heldItem.mesh.position.y-a.y)<1.2){
   const t=segmentHitTime(a,b,heldItem.mesh.position,1.45);if(t!==null){at=t;blocked=true;}
 }
 for(const r of racers){
   if(!activeRacer(r)||Math.abs(racerHeight(r)-a.y)>1.25||r.finish!==null||r.immune>0||(r===p.owner&&p.age<.65)||(r===player&&(driving.recoveryFlash>0||(p.owner!==player&&raceTime<playerItemSafeUntil))))continue;
   const t=segmentHitTime(a,b,racerPosition(r),2);if(t!==null&&t<at){at=t;victim=r;blocked=false;}
 }
 if(at===Infinity)return false;
 p.position.copy(a).lerp(b,at);p.life=0;
 if(blocked){inventory.consume();itemGesture.breakHold();detachHeld();combatStats.blocks++;burst(p.position,0x88eec8,20);audio.tone(960,.18);toast('防御成功！后挂道具抵挡了一次攻击');}
 else if(victim)damageRacer(victim,p.kind,p.owner);
 return true;
}
function updateProjectiles(dt:number){
 for(let i=projectiles.length-1;i>=0;i--){const p=projectiles[i];p.life-=dt;p.age+=dt;p.position.y=Math.max(.49,p.position.y-8*dt);
 if(p.birth){projectileContact(p,p.birth,p.position.clone());p.birth=null;}
 if(p.life>0&&p.kind!=='banana'){
   let delta:THREE.Vector3;
   if(p.kind==='red-shell'&&p.target){
     if(p.target.finish!==null){p.life=0;delta=new THREE.Vector3();}
     else{
       const local=((p.routeT%1)+1)%1;
       if(!p.routeId&&p.target===player&&driving.shortcutId){const branch=world.shortcuts.find(r=>r.id===driving.shortcutId)!;if(Math.abs(local-branch.from)<.02)p.routeId=branch.id;}
       const branch=world.shortcuts.find(r=>r.id===p.routeId);
       p.routeT+=75*dt/(branch?branch.length/(branch.to-branch.from):world.trackLength);
       const u=((p.routeT%1)+1)%1;if(branch&&(u>branch.to||u<branch.from-.04))p.routeId=null;
       const targetT=p.target===player?driving.routeT:p.target.t;
       p.lane=THREE.MathUtils.damp(p.lane,targetT-p.routeT<.045?p.target.lane:0,7,dt);
       const goal=p.routeId&&branch?branch.sample(THREE.MathUtils.clamp((u-branch.from)/(branch.to-branch.from),0,1),THREE.MathUtils.clamp(p.lane,-3,3)).position:world.sample(p.routeT,p.lane).position;
       if(targetT<p.routeT-.04)p.life=0;
       delta=goal.sub(p.position);delta.y=0;delta.clampLength(0,75*dt);p.heading=Math.atan2(delta.x,delta.z);
     }
   }else delta=new THREE.Vector3(Math.sin(p.heading)*75*dt,0,Math.cos(p.heading)*75*dt);
   for(let bounce=0;bounce<3&&p.life>0;bounce++){
     const before=p.position.clone(),hit=sweepCircle(before,delta,.78,world.colliders),end=before.clone().addScaledVector(delta,hit?hit.time:1);
     if(projectileContact(p,before,end))break;p.position.copy(end);
     if(!hit)break;
     p.position.x+=hit.normal.x*.01;p.position.z+=hit.normal.z*.01;burst(p.position,0xffecb0,5);
     if(p.kind==='red-shell'){p.life=0;break;}
     const inward=delta.x*hit.normal.x+delta.z*hit.normal.z;delta.x-=2*inward*hit.normal.x;delta.z-=2*inward*hit.normal.z;p.heading=Math.atan2(delta.x,delta.z);delta.multiplyScalar(1-hit.time);p.life-=.3;interactionStats.shellBounces++;
   }
   p.mesh.rotation.y+=dt*7;
 }else if(p.life>0)projectileContact(p,p.position,p.position.clone());
 p.mesh.position.copy(p.position);
 if(p.life<=0){scene.remove(p.mesh);projectiles.splice(i,1);}
 }
}

// Fixed-size effect pool: emitted at pickups, drifts and boosts.
const particleGeo=new THREE.SphereGeometry(.13,5,4),particleMat=new THREE.MeshBasicMaterial({color:0xffffff});
const particles=new THREE.InstancedMesh(particleGeo,particleMat,120);particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);particles.frustumCulled=false;scene.add(particles);
const fx=Array.from({length:120},()=>({position:new THREE.Vector3(),velocity:new THREE.Vector3(),life:0,color:0xffffff}));let fxIndex=0;const matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),scale=new THREE.Vector3();
function burst(position:THREE.Vector3,color:number,count=12){for(let i=0;i<count;i++){const p=fx[fxIndex++%fx.length];p.position.copy(position);p.position.y+=.7;p.velocity.set((random()-.5)*7,random()*4+1,(random()-.5)*7);p.life=.5+random()*.4;p.color=color;}}
function updateParticles(dt:number){fx.forEach((p,i)=>{p.life=Math.max(0,p.life-dt);if(p.life>0){p.position.addScaledVector(p.velocity,dt);p.velocity.y-=7*dt;}scale.setScalar(p.life>0?Math.min(1,p.life*4):0);matrix.compose(p.position,q,scale);particles.setMatrixAt(i,matrix);particles.setColorAt(i,new THREE.Color(p.color));});particles.instanceMatrix.needsUpdate=true;if(particles.instanceColor)particles.instanceColor.needsUpdate=true;}
const shardMesh=new THREE.InstancedMesh(new THREE.TetrahedronGeometry(.35),new THREE.MeshBasicMaterial({color:0xffffff}),96);shardMesh.frustumCulled=false;scene.add(shardMesh);
const shards=Array.from({length:96},()=>({position:new THREE.Vector3(),velocity:new THREE.Vector3(),life:0,color:0xffffff}));let shardIndex=0;
function breakBox(position:THREE.Vector3){
 for(let i=0;i<24;i++){const shard=shards[shardIndex++%shards.length];shard.position.copy(position);shard.velocity.set((random()-.5)*13,random()*7+2,(random()-.5)*13);shard.life=.65+random()*.25;shard.color=[0x83efff,0xffed8b,0xffa4e0,0xffffff][i%4];}
}
function updateShards(dt:number){shards.forEach((p,i)=>{p.life=Math.max(0,p.life-dt);if(p.life>0){p.position.addScaledVector(p.velocity,dt);p.velocity.y-=14*dt;}q.setFromEuler(new THREE.Euler(p.life*8,i+p.life*6,p.life*4));scale.setScalar(p.life>0?Math.min(1,p.life*4):0);matrix.compose(p.position,q,scale);shardMesh.setMatrixAt(i,matrix);shardMesh.setColorAt(i,new THREE.Color(p.color));});shardMesh.instanceMatrix.needsUpdate=true;if(shardMesh.instanceColor)shardMesh.instanceColor.needsUpdate=true;q.identity();}
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
 if(countdown<=0){if(recorder)recorder.capture(0,trialPose());mode='racing';el('countdown').textContent='GO!';eventTime=1;audio.tone(880,.3);
 if(rocketHold>=1.35&&rocketHold<=2.25){driving.boost=1.8;driving.speed=32;toast('火箭起步！ROCKET START');}
 else if(rocketHold>2.5){driving.stun=1.1;toast('油门过早！下次倒数 2 时起步');}
 else toast('自己掌握方向 · 入弯按空格起跳漂移');}
 }
 if(mode==='racing'){
 const pendingTricks:{kind:TrickKind;key?:string}[]=[];trickScore.step(dt);raceTime+=dt;updateCourseHazards(courseHazards,raceTime);courseVisuals.update(raceTime);cameraImpact=Math.max(0,cameraImpact-dt*1.6);racers.forEach(r=>{r.hitTime=Math.max(0,r.hitTime-dt);r.immune=Math.max(0,r.immune-dt);});
 const awards=inventory.step(dt);if(awards.length){interactionStats.itemAwards+=awards.length;audio.tone(1050,.18);toast('道具就绪 · 按 E / Q 使用');}
 if(inventory.rolling&&frame%7===0)audio.tone(520+(frame%4)*110,.045);
 collisionCooldown=Math.max(0,collisionCooldown-dt);
 const beforeDrive=driving.position.clone(),beforeGate=driving.nextGate,beforeProgress=driving.routeT;
 const ramp=playerRamp();const rampControl=ramp.activeRamp!==null||currentRamps().some(r=>{const d=rampDistance(driving.routeT,r,world.trackLength);return d>=-2&&d<=r.length+1&&Math.abs(driving.lane-r.lane)<=r.width/2;});
 if(rampControl){driving.interruptDrift();driving.hopHeight=driving.hopVelocity=0;}
 driving.rampPassId=ramp.activeRamp;
 driving.step(rampControl?{...input,hop:false}:input,coins,dt);
 ramp.step({beforeT:beforeProgress,routeT:driving.routeT,lane:driving.lane,speed:driving.speed,hop:input.hop&&driving.stun<=0,valid:!driving.recovered,dt,trackLength:world.trackLength,ramps:driving.shortcutId?[]:currentRamps()});
 if(rampControl)driving.interruptDrift();
 driving.position.y=.14+ramp.height;
 if(ramp.launched){audio.tone(580,.1);if(ramp.trick)toast('跳台技巧！落地获得加速');}
 if(ramp.trickLanded&&trickValid()){driving.boost=Math.max(driving.boost,1.05);techniqueStats.jumps++;pendingTricks.push({kind:'jump',key:`jump:${Math.floor(driving.routeT)}:${beforeProgress.toFixed(4)}`});toast('漂亮落地！跳台加速');audio.tone(1080,.18);burst(driving.position,0xffd465,14);}
 syncDriving();
 if(testDrive){if(driving.boost<=0&&driving.speed<=driving.handling.topSpeed+.01)practiceStats.peak=Math.max(practiceStats.peak,driving.speed);if(!driving.recovered)practiceStats.distance+=beforeDrive.distanceTo(driving.position);}
 if(driving.contact){const c=driving.contact;if(c.impact>12)breakTricks('重撞中断');interactionStats[c.kind==='rail'?'railHits':'propHits']++;burst(new THREE.Vector3(c.point.x,.8,c.point.z),0xffe8a1,18);cameraImpact=Math.min(.35,c.impact/180);audio.tone(95,.15);toast(c.kind==='rail'?'撞到护栏！调整方向重新加速':'撞到障碍！调整方向');}
 for(const hazard of courseHazards){if(!testDrive&&racerHeight(player)<1.5&&player.immune<=0&&courseContact(hazard,beforeDrive,driving.position)){damageRacer(player,'banana');courseStats.hits++;toast(hazard.kind==='vent'?'喷气烫到了！看预警灯，走右侧绕行':'撞到移动路障！观察空位再通过');}}
 if(driving.shortcutId!==trickActiveRoute){trickActiveRoute=driving.shortcutId;trickRouteEntry=null;}
 if(trickActiveRoute&&trickValid()){const route=world.shortcuts.find(r=>r.id===trickActiveRoute)!;if(projectShortcut(route,driving.position).u<=.2)trickRouteEntry=`${route.id}:${Math.floor(driving.routeT)}`;}
 if(driving.shortcutId&&driving.shortcutId!==lastCourseRoute){const route=world.shortcuts.find(r=>r.id===driving.shortcutId)!;toast(`${route.name} · 出口加速，注意机关！`);}lastCourseRoute=driving.shortcutId;
 for(const route of world.shortcuts){const p=route.sample(.86).position,key=`${route.id}:${Math.floor(driving.routeT)}`;if(!testDrive&&!courseRewards.has(key)&&driving.shortcutId===route.id&&!driving.wrongWay&&segmentDistance(p,beforeDrive,driving.position)<3.3){courseRewards.add(key);if(trickRouteEntry===key)pendingTricks.push({kind:'shortcut',key:`shortcut:${key}`});courseStats.clears++;challengeMetrics.shortcutClears++;driving.boost=Math.max(driving.boost,1.25);toast(`${route.name}通过 · 出口涡轮！`);audio.tone(950,.23);}}
 updateItemGesture(input.item,dt);
 if(driving.recovered){breakTricks('救援中断');challengeMetrics.rescues++;coins=Math.max(0,coins-3);toast('已救援回赛道 · 损失 3 枚金币');}
 if(driving.releasedTurbo){if(driving.releasedTurbo>=2)pendingTricks.push({kind:driving.releasedTurbo===3?'purple':'orange'});if(driving.releasedTurbo>=2)challengeMetrics.orangeDrifts++;const names=['','迷你涡轮','超级迷你涡轮','极限迷你涡轮'];toast(`${names[driving.releasedTurbo]} · BOOST!`);audio.tone(650+driving.releasedTurbo*150,.2);}
 if(wasDrifting&&frame%3===0){const color=driving.driftStage===3?0xe174ff:driving.driftStage===2?0xffa038:0x4dafff;for(const side of [-1,1]){const p=driving.position.clone();p.x+=Math.cos(driving.heading)*side*1.35-Math.sin(driving.heading)*1.1;p.z-=Math.sin(driving.heading)*side*1.35+Math.cos(driving.heading)*1.1;burst(p,color,2);}}
 const lap=driving.lap;
 if(!testDrive&&!eliminationSelected&&lap>lastLap){lastLap=lap;event(lap===3?'最后一圈！':'第 2 圈 · 继续冲刺');audio.tone(900,.25);}
 recordTrial(beforeGate,beforeProgress,dt);
 let trickKartContact=false;
 racers.forEach((r,i)=>{if(i===0||raceMode==='time-trial'||!activeRacer(r))return;const beforeAi=world.sample(r.t,r.lane).position,beforeAiT=r.t;r.stun=Math.max(0,r.stun-dt);aiBoost.set(r.key,Math.max(0,(aiBoost.get(r.key)??0)-dt));const aiSpeed=r.stun>0?9:(aiBoost.get(r.key)??0)>0?56:34+i*.9+Math.floor(r.t)*.5+Math.sin(raceTime*.5+i)*1.5;r.speed=THREE.MathUtils.damp(r.speed,aiSpeed,1.3,dt);r.t+=r.speed*dt/world.trackLength;const targetLane=aiCombat.inventory(r.key).canCollect?boxLane({id:r.key,t:r.t,lane:r.lane,speed:r.speed,stun:r.stun,immune:r.immune,finished:r.finish!==null},world.pickups.filter(p=>p.kind==='item').map(p=>({t:p.t,lane:p.lane,available:p.cooldown<=0})),world.trackLength):null;const upcomingRamp=currentRamps().find(ramp=>{const d=rampDistance(r.t,ramp,world.trackLength);return d>=-30&&d<ramp.length+3;});const rampLane=upcomingRamp?(i%2===1?upcomingRamp.lane:-3.5):null;r.lane=THREE.MathUtils.clamp(THREE.MathUtils.damp(r.lane,rampLane??targetLane??Math.sin(r.t*22+i*2)*4.9,rampLane!==null?4:1.5,dt),-world.widthAt(r.t)+2,world.widthAt(r.t)-2);if(!eliminationSelected&&r.t>=3&&r.finish===null)r.finish=raceTime;
 const aiRamp=rampMotions.get(r.key)!;const wantsTrick=aiRamp.trickReady&&r.stun<=0;
 aiRamp.step({beforeT:beforeAiT,routeT:r.t,lane:r.lane,speed:r.speed,hop:wantsTrick,valid:true,dt,trackLength:world.trackLength,ramps:currentRamps()});
 if(aiRamp.trickLanded&&r.stun<=0){aiBoost.set(r.key,Math.max(aiBoost.get(r.key)??0,1.05));techniqueStats.aiJumps++;}
 const rp=racerPosition(r);
 if(r.stun<=0&&r.finish===null)for(const box of world.pickups){if(box.kind!=='item'||box.cooldown>0||Math.abs(racerHeight(r)-box.object.position.y)>2.2||!aiCombat.inventory(r.key).canCollect)continue;if(segmentDistance(box.object.position,beforeAi,rp)<2.85&&aiCombat.collect(r.key,1+racers.filter(other=>activeRacer(other)&&other.t>r.t).length,random,raceTime)){box.cooldown=3.5;box.object.visible=false;breakBox(box.object.position);}}
 const delta=driving.position.clone().sub(rp);delta.y=0;
 const distance=delta.length(),separation=3.5;
 if(distance<separation&&Math.abs(racerHeight(player)-racerHeight(r))<1.5){trickKartContact=true;
   if(distance<.001)delta.copy(world.sample(r.t).normal);else delta.divideScalar(distance);
   const overlap=separation-distance;
   const pushed=driving.position.clone().addScaledVector(delta,overlap*.65+.01);
   const resolved=moveCircle(pushed,{x:0,z:0},0,1.6,world.colliders.filter(c=>!c.rampId||c.rampId!==driving.rampPassId));driving.position.x=resolved.position.x;driving.position.z=resolved.position.z;
   const road=world.sample(r.t);r.lane=THREE.MathUtils.clamp(r.lane-delta.dot(road.normal)*overlap*.35,-7,7);r.t-=delta.dot(road.tangent)*overlap*.35/world.trackLength;
   if(collisionCooldown<=0){driving.speed*=.78;r.speed*=.86;collisionCooldown=.3;interactionStats.kartHits++;cameraImpact=.12;burst(driving.position,0xffe0ae,9);audio.tone(130,.08);}
 }
 });
 world.pickups.forEach(p=>{
 if(testDrive||raceMode==='time-trial'&&p.kind==='item'){p.object.visible=false;return;}
 if(p.cooldown>0){p.cooldown=Math.max(0,p.cooldown-dt);p.object.visible=p.cooldown<.3;p.object.scale.setScalar(Math.max(.01,1-p.cooldown/.3));return;}
 p.object.scale.setScalar(1);
 if(driving.recovered||Math.abs(racerHeight(player)-p.object.position.y)>2.2||segmentDistance(p.object.position,beforeDrive,driving.position)>(p.kind==='item'?2.85:2.25))return;
 p.cooldown=p.kind==='item'?3.5:7;p.object.visible=false;
 if(p.kind==='coin'){challengeMetrics.coinsCollected++;coins=Math.min(10,coins+1);audio.tone(1040,.09);burst(p.object.position,0xffd249,10);el('coins').animate([{transform:'scale(1.4)'},{transform:'scale(1)'}],{duration:180});}
 else{interactionStats.boxes++;breakBox(p.object.position);const position=1+racers.filter(r=>r!==player&&activeRacer(r)&&r.t>player.t).length;const acquired=inventory.acquire(position,random);toast(acquired?'获得道具箱 · 正在抽取…':'道具栏已满 · 按 E / Q 使用');audio.tone(660,.12);updateUI();}
 });
 world.boostPads.forEach((p,i)=>{if(testDrive||racerHeight(player)>1)return;const pos=world.sample(p.t,p.lane).position;if(Math.hypot(pos.x-driving.position.x,pos.z-driving.position.z)<3.8&&(padLocks.get(i)??-100)<raceTime-3){padLocks.set(i,raceTime);driving.boost=Math.max(driving.boost,1.4);toast('加速带 · 全速前进！');audio.tone(740,.2);}});
 if(raceMode==='grand-prix'){const actions=aiCombat.plan(dt,{time:raceTime,difficulty,playerId:player.key,trackLength:world.trackLength,racers:racers.filter(activeRacer).map(r=>({id:r.key,t:r.t,lane:r.lane,speed:r.speed,stun:r===player?driving.stun:r.stun,immune:r.immune,finished:r.finish!==null})),playerProtected:raceTime<playerItemSafeUntil||player.immune>0||driving.recoveryFlash>0,hornThreatIds:racers.filter(r=>r!==player&&projectiles.some(p=>p.life>0&&p.owner!==r&&hornAffects(r,p.position,p.position.y))).map(r=>r.key),playerRedThreat:projectiles.some(p=>p.kind==='red-shell'&&p.target===player),canFire:action=>{if(isBoostItem(action.item)||action.item==='banana')return true;if(action.item==='super-horn')return canAiHorn(action.racerId,action.targetId);const owner=racers.find(r=>r.key===action.racerId)!,target=racers.find(r=>r.key===action.targetId);if(!target)return false;const from=racerPosition(owner),to=racerPosition(target),dx=to.x-from.x,dz=to.z-from.z;if(Math.hypot(dx,dz)<(action.item==='red-shell'?24:16))return false;if(action.item==='red-shell')return true;const heading=racerHeading(owner);return dx*Math.sin(heading)+dz*Math.cos(heading)>0&&Math.abs(dx*Math.cos(heading)-dz*Math.sin(heading))<4&&!sweepCircle(from,{x:dx,z:dz},.78,world.colliders);}});for(const action of actions){const owner=racers.find(r=>r.key===action.racerId)!;fireItem(owner,action.item,action.rear,racers.find(r=>r.key===action.targetId)??null);}}
 updateDrafts(dt);updateProjectiles(dt);syncDriving();
 for(const event of pendingTricks)awardTrick(event.kind,event.key);
 const passes=nearPasses.step(dt,{progress:driving.routeT,x:driving.position.x,z:driving.position.z,speed:driving.speed,valid:trickValid()&&!trickKartContact,lap:driving.lap},raceMode==='grand-prix'?racers.filter(r=>r!==player&&activeRacer(r)).map(r=>{const p=racerPosition(r);return {id:r.key,progress:r.t,x:p.x,z:p.z,finished:r.finish!==null};}):[],world.trackLength);
 for(const id of passes)awardTrick('overtake',`pass:${id}:${driving.lap}`);
 if(testDrive&&raceTime>=20){finishTestDrive();return;}
 if(eliminationSelected){stepElimination();if(elimination?.snapshot().complete)return;}
 else if(!testDrive&&driving.finished){finish();return;}
 if(boost>0&&frame%3===0){const back=driving.position.clone().add(new THREE.Vector3(-Math.sin(driving.heading)*1.6,0,-Math.cos(driving.heading)*1.6));burst(back,equipped.trail==='violet'?0xbf70ff:0xffaa38,3);}
 }
 techniqueEffects.step(dt);updateModels(dt);updateParticles(dt);updateShards(dt);
}
function updateModels(dt:number){
 racers.forEach(r=>{const pos=racerPosition(r);
 // Opponents remain in the world after an overtake; normal camera frustum clipping handles offscreen objects.
 r.mesh.visible=r===player||(mode!=='ready'&&raceMode==='grand-prix');
 r.mesh.scale.setScalar(1);
 r.mesh.position.copy(pos);r.mesh.position.y+=.04+(r===player?driving.hopHeight:0);
 if(r.hitTime>0)r.mesh.position.y+=Math.sin(Math.min(1,r.hitTime/(r.hitKind==='banana'?.85:1.1))*Math.PI)*(r.hitKind==='banana'?.25:1.25);
 const ramp=rampMotions.get(r.key)!;const s=world.sample(r.t);const heading=r===player?driving.heading:Math.atan2(s.tangent.x,s.tangent.z);
 r.mesh.rotation.set(r.hitTime>0&&r.hitKind!=='banana'?Math.sin(r.hitTime*15)*.3:-ramp.pitch,heading+(r.hitTime>0?r.hitTime/(r.hitKind==='banana'?.85:1.1)*Math.PI*4:0),ramp.roll+(r===player?steer*Math.min(Math.abs(player.speed)/45,1)*.055:0));
 if(r.immune>0&&r.hitTime<=0&&Math.floor(r.immune*16)%2===0)r.mesh.visible=false;
 techniqueEffects.draft(r.key,pos,heading,mode==='racing'&&raceMode==='grand-prix'&&activeRacer(r)&&r.finish===null&&drafts.get(r.key)!.charge>0);
 const exitAt=eliminationExits.get(r.key);
 if(exitAt!==undefined&&r!==player){const amount=Math.min(1,(raceTime-exitAt)/.7);r.mesh.position.y+=amount*5;r.mesh.scale.setScalar(Math.max(.01,1-amount));r.mesh.visible=amount<1;}
 const wheels=r.mesh.userData.wheels as THREE.Object3D[]|undefined;wheels?.forEach(w=>{w.rotation.x+=r.speed*dt*1.8;});
 const front=r.mesh.userData.frontWheels as THREE.Object3D[]|undefined;front?.forEach(w=>{w.rotation.y=r===player?-steer*.38:0;});
 const head=r.mesh.userData.head as THREE.Object3D|undefined;if(head)head.rotation.y=r===player?-steer*.15:0;
 });
 updateEliminationMarkers();
 updateAiBadges();
 ghostView.update(referenceGhost,raceTime*1000,!testDrive&&raceMode==='time-trial'&&ghostEnabled&&(mode==='racing'||mode==='paused'));
 playerShadow.position.copy(driving.position);playerShadow.position.y=.155;
 world.pickups.forEach(p=>{p.object.rotation.y+=dt*(p.kind==='coin'?2:1);});
}
function updateAiBadges(){
 for(const r of racers){if(r===player)continue;
   const item=mode==='racing'&&raceMode==='grand-prix'&&activeRacer(r)&&r.finish===null?aiCombat.inventory(r.key).item:null;
   let badge=aiBadges.get(r.key);
   if(badge?.kind!==item){if(badge){scene.remove(badge.mesh);aiBadges.delete(r.key);}badge=undefined;
     if(item){const mesh=itemBadge(item);mesh.scale.setScalar(.65);badge={kind:item,mesh};aiBadges.set(r.key,badge);scene.add(mesh);}
   }
   if(badge){if(item==='triple-mushroom')badge.mesh.children.forEach((m,i)=>m.visible=i<(aiCombat.inventory(r.key).slots[0]?.charges??3));badge.mesh.position.copy(racerPosition(r));badge.mesh.position.y+=4.5;badge.mesh.rotation.y=raceTime*1.5;}
 }
}
function updateCombatUI(){
 const warning=document.getElementById('incoming-warning');if(!warning)return;
 let message='';let nearest=Infinity;
 if(mode==='racing'&&raceMode==='grand-prix')for(const p of projectiles){
   if(p.owner===player||p.life<=0)continue;
   const dx=p.position.x-driving.position.x,dz=p.position.z-driving.position.z,d=Math.hypot(dx,dz);
   const forward=dx*Math.sin(driving.heading)+dz*Math.cos(driving.heading),side=dx*Math.cos(driving.heading)-dz*Math.sin(driving.heading);
   const closing=-dx*Math.sin(p.heading)-dz*Math.cos(p.heading);
   const cross=Math.abs(dx*Math.cos(p.heading)-dz*Math.sin(p.heading));
   const dangerous=p.kind==='red-shell'&&p.target===player&&d<150||p.kind==='green-shell'&&d<25&&closing>0&&cross<5||p.kind==='banana'&&forward>0&&d<16&&Math.abs(side)<4&&player.speed>8;
   if(dangerous&&d<nearest){nearest=d;const direction=Math.abs(side)>Math.abs(forward)?side>0?'右侧':'左侧':forward>0?'前方':'后方';message=p.kind==='banana'?`${direction}香蕉 · 转向避开`:`${direction}${p.kind==='red-shell'?'红龟壳追踪':'绿龟壳来袭'} · ${inventory.item==='super-horn'?'靠近时按道具鸣笛':heldItem?'保持后挂防御':'长按道具防御 / 转向躲避'}`;}
 }
 if(warning.textContent!==message)warning.textContent=message;
 if(message&&!threatWasVisible){combatStats.warnings++;audio.tone(440,.13);}threatWasVisible=!!message;
 el('item').classList.toggle('item-held',!!heldItem);
 if(heldItem){el('item-label').textContent='后挂防御中 · 松开投出';el('item').setAttribute('aria-label','正在后挂防御，松开投出道具');}
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
 if(mode==='racing'&&cameraImpact>0&&!matchMedia('(prefers-reduced-motion: reduce)').matches){camera.position.x+=Math.sin(raceTime*91)*cameraImpact*.4;camera.position.y+=Math.cos(raceTime*77)*cameraImpact*.35;}
 camera.lookAt(lookTarget);camera.fov=THREE.MathUtils.damp(camera.fov,ready?44:boost>0?63:55,4,dt);camera.updateProjectionMatrix();
 sun.position.set(pos.x-60,110,pos.z+40);sun.target.position.copy(pos);sun.target.updateMatrixWorld();
 if(ready){const projected=pos.clone();projected.y+=5.7;projected.project(camera);el('player-tag').style.left=`${(projected.x*.5+.5)*100}%`;el('player-tag').style.top=`${(-projected.y*.5+.5)*100}%`;el('player-tag').textContent=player.name+(equipped.title==='star'?' · 星光车手':' · YOU');}
}
let lastOrder='';
function updateCourseUI(){
 const status=el('course-status');let message='';let phase='safe';
 if(mode==='racing'){
   const active=world.shortcuts.find(r=>r.id===driving.shortcutId);
   if(active){const p=projectShortcut(active,driving.position),hazard=courseHazards.find(h=>h.route===active)!;const gap=(hazard.u-p.u)*active.length;phase=hazard.phase;
     message=gap>-7&&gap<65?(hazard.kind==='vent'?`花园喷气口 · ${hazard.phase==='safe'?`${Math.ceil(hazard.seconds)} 秒后预警`:hazard.phase==='warning'?`${Math.ceil(hazard.seconds)} 秒后喷发`:`喷发中 · ${Math.ceil(hazard.seconds)} 秒后关闭`} · 右侧可绕行`:'工坊移动路障 · 观察左右空位，松油门再通过'):`${active.name} · ${p.u<.86?'沿彩色路线前进，出口有加速':'驶回主路，继续冲刺'}`;
   }else{const local=((driving.routeT%1)+1)%1;if(activeTrack==='castle'&&local>.40&&local<.56){message=local<.435?'前方窄桥 · 路面收窄，保持路线':'城堡窄桥 · 青色护栏之间通行';}const upcoming=world.shortcuts.find(r=>r.from-local>0&&(r.from-local)*world.trackLength<60);if(upcoming)message=`前方${upcoming.name} · 彩色岔路更快，宽阔主路更稳`;}
 }
 status.textContent=message;status.dataset.phase=phase;
}
function trialPose(){return {x:driving.position.x,y:driving.position.y+driving.hopHeight,z:driving.position.z,heading:driving.heading};}

function selectLoadout(value:LoadoutId){
 if(mode!=='ready'||testDrive||!isLoadout(value))return;selectedLoadout=value;const saved=saveLoadout(value);best=null;personalGhost=null;
 try{best=Number(localStorage.getItem(bestKey()))||null;personalGhost=loadGhost(localStorage,ghostKey());}catch{}
 referenceGhost=personalGhost;reset();loadoutView?.refresh();if(cupSelected)refreshCupHistory();if(eliminationSelected)refreshEliminationHistory();if(!saved)toast('本机存储不可用，本次选择仍然有效');
}
const practiceHud=document.createElement('aside');practiceHud.id='practice-hud';practiceHud.hidden=true;app.append(practiceHud);
function updatePracticeUI(){practiceHud.hidden=!testDrive||!['countdown','racing','paused'].includes(mode);if(testDrive)practiceHud.textContent=`${LOADOUTS[selectedLoadout].name} · 试驾 ${Math.max(0,Math.ceil(20-raceTime))} 秒`;}
function startTestDrive(){
 if(mode!=='ready'||testDrive)return;practiceReturn={raceMode,cup:cupSelected,elimination:eliminationSelected};loadoutView?.close();selectRaceMode('time-trial');testDrive=true;app.classList.add('test-drive');start();
}
function endTestDrive(){
 const prior=practiceReturn;testDrive=false;practiceReturn=null;mode='ready';app.classList.remove('test-drive','racing');clearInputs();
 if(prior?.cup)selectCupMode();else if(prior?.elimination)selectEliminationMode();else selectRaceMode(prior?.raceMode??'grand-prix');loadoutView?.open();
}
function finishTestDrive(){
 raceTime=20;mode='finished';clearInputs();driving.interruptDrift();audio.tone(740,.2);el('countdown').textContent='';
 el('dialog-eyebrow').textContent='TEST DRIVE · 20 SECONDS';el('dialog-title').textContent=LOADOUTS[selectedLoadout].name+' · 试驾完成';el('dialog-desc').textContent='换一种配置，再比较起步、转弯与漂移手感。';
 el('result').innerHTML=`<div class="result-stats"><div><b>${Math.round(practiceStats.peak*3.1)}</b><small>平跑峰值 KM/H</small></div><div><b>${Math.round(practiceStats.distance)}m</b><small>试驾距离</small></div></div><p>试驾不保存比赛成绩，不上传排行榜或计入成长。</p>`;
 el('resume').innerHTML='<span>再试一次</span><span>↗</span>';el('restart').textContent='重新试驾';el('home').textContent='返回车库，切换配置';el('overlay').style.display='flex';(el('resume') as HTMLButtonElement).focus();updateUI();
}

function selectDifficulty(value:Difficulty){if(mode!=='ready'||!['casual','standard'].includes(value))return;difficulty=value;document.querySelectorAll<HTMLButtonElement>('[data-combat-difficulty]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.combatDifficulty===value)));if(cupSelected)refreshCupHistory();if(eliminationSelected)refreshEliminationHistory();el('combat-note').textContent=eliminationSelected?'本机淘汰赛 · 不计三圈云榜及每日成长':cupSelected?'本机杯赛 · 不计单场用时榜及每日成长':value==='casual'?'休闲攻防 · 更多喘息时间，可完成每日挑战，不计竞速排名':'标准攻防 · AI 使用道具，成绩计入新版标准竞速榜';reset();}
function selectRaceMode(value:RaceMode){
 if(mode!=='ready'||!['grand-prix','time-trial'].includes(value))return;
 cupSelected=false;cup=null;cupTimes=[];eliminationSelected=false;elimination=null;app.classList.remove('elimination-mode');el('elimination-select').setAttribute('aria-pressed','false');activateTrack('mushroom');el('cup-select').setAttribute('aria-pressed','false');
 el('combat-note').textContent=difficulty==='casual'?'休闲攻防 · 更多喘息时间，可完成每日挑战，不计竞速排名':'标准攻防 · AI 使用道具，成绩计入新版标准竞速榜';
 raceMode=value;splitMarkers.visible=value==='time-trial';app.classList.toggle('time-trial',value==='time-trial');
 document.querySelectorAll<HTMLButtonElement>('[data-race-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.raceMode===value)));
 el('race-mode-note').textContent=value==='time-trial'?'单人三圈 · 无随机道具 · 与本机最佳幽灵同场':'六位车手 · 双道具 · 自由选择主路与捷径';
 const settings=el('menu').querySelectorAll('.race-settings>div');settings[2].innerHTML=value==='time-trial'?'<strong>01</strong><small>挑战个人最佳</small>':'<strong>06</strong><small>参赛车手</small>';
 settings[1].innerHTML='<strong>03</strong><small>比赛圈数</small>';
 settings[0].querySelector('small')!.textContent=value==='time-trial'?'计时模式':'竞速模式';
 document.querySelector('.keyboard-hint .key-group:last-child')!.innerHTML=value==='time-trial'?'<kbd>C</kbd> 后视':'<kbd>E</kbd> 短按投出 / 长按防御 <kbd>C</kbd> 后视';
 cloud?.setMode(value);reset();updateTrialUI();
}
function recordTrial(beforeGate:number,beforeT:number,dt:number){
 if(raceMode!=='time-trial'||!recorder)return;
 if(driving.nextGate>beforeGate&&beforeGate>0&&beforeGate%2===0){
   const ratio=driving.routeT>beforeT?THREE.MathUtils.clamp((beforeGate/8-beforeT)/(driving.routeT-beforeT),0,1):1;
   const at=beforeGate===24?raceTime*1000:(raceTime-dt+ratio*dt)*1000;
   trialSplits.push(at);recorder.split(at);audio.tone(800,.08);
 }
 recorder.capture(raceTime*1000,trialPose());
}
function updateTrialUI(){
 const target=document.getElementById('trial-best');if(!target)return;
 const reference=mode==='ready'?personalGhost:referenceGhost;
 target.textContent=reference?formatTime(reference.durationMs/1000):'—';el('trial-title').textContent=reference?'本机最佳幽灵':'首跑建立幽灵';
 const index=trialSplits.length-1;const delta=index>=0&&reference?trialSplits[index]-reference.splits[index]:null;
 const next=Math.min(11,trialSplits.length);el('trial-sector').textContent=`第 ${Math.floor(next/4)+1} 圈 · 分段 ${next%4+1} / 4`;
 const label=el('trial-delta');label.textContent=delta!==null?`${delta<0?'−':'+'}${(Math.abs(delta)/1000).toFixed(3)} s`:index>=0?formatTime(trialSplits[index]/1000):'—';label.dataset.direction=delta===null||Math.abs(delta)<1?'equal':delta<0?'faster':'slower';
 el('trial-detail').textContent=delta!==null?`上个分段累计${delta<0?'快':'慢'} ${Math.abs(delta/1000).toFixed(3)} 秒`:reference?'蓝色幽灵是本机最佳 · 经过分段线比较':'首跑记录分段，完整完赛后建立幽灵';
 el('ghost-toggle').textContent=`个人幽灵：${ghostEnabled?'显示':'隐藏'}`;el('ghost-toggle').setAttribute('aria-pressed',String(ghostEnabled));
}
function finishTrial(){
 const previous=personalGhost;const run=recorder?.finish(raceTime*1000,trialPose())??null;
 const improved=!!run&&(!previous||run.durationMs<previous.durationMs);
 if(improved){personalGhost=run;try{if(!saveGhost(localStorage,ghostKey(),run))trialNotice='浏览器存储不可用：幽灵仅在本次页面中保留。';}catch{trialNotice='浏览器存储不可用：幽灵仅在本次页面中保留。';}}
 if(!run)trialNotice='本场录像不完整，未覆盖已有幽灵。';
 el('dialog-eyebrow').textContent='TIME TRIAL · 3 LAPS COMPLETE';el('dialog-title').textContent=improved?(previous?'刷新个人纪录！':'首个计时纪录！'):'计时挑战完成';
 el('dialog-desc').textContent=improved?'下一场，和这次的最佳表现一起出发。':'观察分段差值，再让下一个弯快一点。';
 el('result').innerHTML=`<div class="result-stats"><div><b>${formatTime(raceTime)}</b><small>本场计时</small></div><div><b>${personalGhost?formatTime(personalGhost.durationMs/1000):'—'}</b><small>本机计时最佳</small></div></div>`;
 const summary=document.createElement('p');summary.className='trial-summary';summary.textContent=previous?`比此前最佳${raceTime*1000<previous.durationMs?'快':'慢'} ${Math.abs(raceTime-previous.durationMs/1000).toFixed(3)} 秒`:'首次完整三圈，建立个人对照基准';el('result').append(summary);
 if(trialSplits.length){const table=document.createElement('div');table.className='trial-results';table.innerHTML='<table><thead><tr><th>分段</th><th>累计用时</th><th>对比此前最佳</th></tr></thead><tbody>'+trialSplits.map((s,i)=>{const diff=referenceGhost?s-referenceGhost.splits[i]:null;return `<tr><td>${Math.floor(i/4)+1}圈 · ${i%4+1}/4</td><td>${formatTime(s/1000)}</td><td>${diff===null?'首次记录':`${diff<0?'−':'+'}${Math.abs(diff/1000).toFixed(3)}s`}</td></tr>`;}).join('')+'</tbody></table>';el('result').append(table);}
 if(trialNotice){const note=document.createElement('p');note.className='trial-storage';note.textContent=trialNotice;el('result').append(note);}
}
function updateUI(){updateTechniqueUI();loadoutView?.refresh();updatePracticeUI();eliminationView.render(eliminationSelected?elimination?.snapshot()??null:null,mode);cupView.render(cupSelected?cup?.snapshot()??null:null,mode);trickView.render(trickScore.snapshot(),{mode,raceMode,best:trickBest});
 const sorted=eliminationSelected&&elimination?elimination.snapshot().order.map(id=>racers.find(r=>r.key===id)!):[...racers].sort((a,b)=>b.t-a.t);if(mode!=='finished')rank=raceMode==='time-trial'?1:sorted.indexOf(player)+1;
 (el('pause') as HTMLButtonElement).disabled=mode==='ready'||mode==='finished';el('position').textContent=String(rank);el('ordinal').textContent=['st','nd','rd','th','th','th'][rank-1];
 el('lap').textContent=String(driving.lap).padStart(2,'0');el('timer').textContent=formatTime(raceTime);el('speed').textContent=String(Math.round(Math.abs(player.speed)*3.1)).padStart(3,'0');el('coins').textContent=String(coins).padStart(2,'0');
 inventory.render(el('item') as HTMLButtonElement,el('item-label'),mode==='racing'&&raceMode==='grand-prix');
 el('drift').classList.toggle('visible',wasDrifting||boost>0);el('drift-label').textContent=boost>0?'TURBO BOOST':driving.driftStage===3?'ULTRA MINI-TURBO':driving.driftStage===2?'SUPER MINI-TURBO':driving.driftStage===1?'MINI-TURBO':'DRIFT CHARGE';el('drift-fill').style.width=(boost>0?100:charge/3.35*100)+'%';el('drift-fill').style.background=driving.driftStage===3?'#dc7eff':driving.driftStage===2||boost>0?'#ffb340':'#55b8ff';app.classList.toggle('boosting',boost>0);
 document.querySelector('.speed-unit')!.textContent=LOADOUTS[selectedLoadout].name+' · KM/H';
 document.querySelectorAll('.speed-bars i').forEach((b,i)=>b.classList.toggle('lit',i<player.speed/7));
 const order=sorted.map(r=>r.key).join()+Math.floor(raceTime)+eliminationSelected;if(order!==lastOrder){lastOrder=order;el('leaderboard').innerHTML=sorted.map((r,i)=>`<div class="racer-row ${r===player?'you':''} ${eliminationSelected&&i===sorted.length-1?'last-place':eliminationSelected&&i===sorted.length-2?'at-risk':''}"><span class="rnum">${i+1}</span><i class="dot" style="--racer-color:#${r.color.toString(16).padStart(6,'0')}"></i><span>${r.name}</span><span class="gap">${r===player?'YOU':((r.t-player.t)*world.trackLength/50>=0?'+':'')+((r.t-player.t)*world.trackLength/50).toFixed(1)+'s'}</span></div>`).join('');}
 el('driving-status').textContent=driving.recoveryFlash>0?'救援中':driving.recoverySeconds>0?`远离赛道 · ${driving.recoverySeconds} 秒后救援，驶回可取消`:driving.checkpointMissed?'遗漏检查点 · 请沿赛道返回':driving.wrongWay?'方向反了！':driving.offRoad?(activeTrack==='castle'?'离开路面 · 减速':'草地减速'):lookBack?'后方视角':'';updateCombatUI();updateCourseUI();updateTrialUI();progression?.updateRace(challengeMetrics);drawMap();
}
const mapCanvas=el('minimap') as HTMLCanvasElement,ctx=mapCanvas.getContext('2d')!;
let mapPoints=Array.from({length:181},(_,i)=>world.sample(i/180).position);
let minX=Math.min(...mapPoints.map(p=>p.x)),maxX=Math.max(...mapPoints.map(p=>p.x)),minZ=Math.min(...mapPoints.map(p=>p.z)),maxZ=Math.max(...mapPoints.map(p=>p.z));
let mapScale=Math.min(370/(maxX-minX),280/(maxZ-minZ));
function mapWorld(p:{x:number;z:number}){return {x:220+(p.x-(minX+maxX)/2)*mapScale,y:175+(p.z-(minZ+maxZ)/2)*mapScale};}
function mapPoint(t:number){return mapWorld(world.sample(t).position);}
function drawMap(){
 ctx.clearRect(0,0,440,360);ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();mapPoints.forEach((_,i)=>{const p=mapPoint(i/180);if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);});ctx.strokeStyle='#21494345';ctx.lineWidth=19;ctx.stroke();ctx.strokeStyle='#fffdf3dc';ctx.lineWidth=10;ctx.stroke();
 for(const route of world.shortcuts){ctx.beginPath();route.points.forEach((point,i)=>{const p=mapWorld(point);if(!i)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);});ctx.strokeStyle=route.id==='garden'?'#1bbd9a':'#fdbd3f';ctx.lineWidth=6;ctx.stroke();}
 const start=mapPoint(0);ctx.fillStyle='#183b3c';ctx.fillRect(start.x-5,start.y-7,10,14);
 if(eliminationSelected&&elimination){const order=elimination.snapshot().order;order.slice(-2).forEach((id,i)=>{const r=racers.find(r=>r.key===id)!;const p=mapPoint(r.t);ctx.beginPath();ctx.arc(p.x,p.y,12,0,Math.PI*2);ctx.strokeStyle=i===1?'#db4533':'#f0a822';ctx.lineWidth=4;ctx.stroke();});}
 racers.filter(r=>r!==player&&raceMode==='grand-prix'&&activeRacer(r)).forEach(r=>{const p=mapPoint(r.t);ctx.fillStyle='#'+r.color.toString(16).padStart(6,'0');ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fffdf3';ctx.lineWidth=2;ctx.stroke();});if(ghostView.mesh?.visible){const g=mapWorld(ghostView.mesh.position);ctx.beginPath();ctx.arc(g.x,g.y,7,0,Math.PI*2);ctx.fillStyle='#55cee5';ctx.fill();}const p=mapWorld(driving.position);ctx.beginPath();ctx.arc(p.x,p.y,9,0,Math.PI*2);ctx.fillStyle='#f24d3c';ctx.fill();ctx.strokeStyle='#fffdf3';ctx.lineWidth=4;ctx.stroke();
}

function refreshMap(){mapPoints=Array.from({length:181},(_,i)=>world.sample(i/180).position);minX=Math.min(...mapPoints.map(p=>p.x));maxX=Math.max(...mapPoints.map(p=>p.x));minZ=Math.min(...mapPoints.map(p=>p.z));maxZ=Math.max(...mapPoints.map(p=>p.z));mapScale=Math.min(370/(maxX-minX),280/(maxZ-minZ));}
function activateTrack(id:TrackId){
 if(activeTrack!==id){trackScenes.get(activeTrack)!.root.visible=false;let next=trackScenes.get(id);if(!next){next=buildTrackScene(id);trackScenes.set(id,next);}next.root.visible=true;activeTrack=id;world=next.world;courseHazards=next.hazards;courseVisuals=next.visuals;splitMarkers=next.markers;driving=new KartDriving(world);refreshMap();}
 const night=id==='castle';app.classList.toggle('night-race',night);scene.background=new THREE.Color(night?'#14233d':'#a9dfee');scene.fog=new THREE.Fog(night?'#243653':'#b5e3ea',night?220:180,night?660:510);hemi.color.set(night?'#c9dfff':'#e3faff');hemi.groundColor.set(night?'#5b6382':'#71a568');hemi.intensity=night?2:2.6;sun.color.set(night?'#c7ddff':'#fff3d7');sun.intensity=night?2.4:3.2;renderer.toneMappingExposure=night?1.12:1.05;splitMarkers.visible=raceMode==='time-trial';
 el('track-length').textContent=(world.trackLength/1000).toFixed(2)+' KM';document.querySelector('.map-caption')!.textContent=night?'CASTLE NIGHT / 02':'MUSHROOM CIRCUIT / 01';document.querySelector('.top-middle')!.textContent=eliminationSelected?'末位淘汰赛 · LAST KART STANDING':cupSelected?'双站杯赛 · '+TRACKS[id].name:'蘑菇杯 · GRAND PRIX';
}

const eliminationMarkers=[0xd64532,0xf0b33f].map(color=>{const mesh=new THREE.Mesh(new THREE.RingGeometry(2.2,2.7,36),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.85,depthWrite:false,side:THREE.DoubleSide}));mesh.rotation.x=-Math.PI/2;mesh.visible=false;scene.add(mesh);return mesh;});
function updateEliminationMarkers(){
 const order=eliminationSelected&&elimination&&mode==='racing'?elimination.snapshot().order:[];
 eliminationMarkers.forEach((mesh,i)=>{const r=racers.find(r=>r.key===order.at(-1-i));mesh.visible=!!r&&order.length>1;if(r){mesh.position.copy(racerPosition(r));mesh.position.y+=.12;}});
}
function eliminationStorageKey(){return `mushroom-elimination-v3-${selectedLoadout}-${difficulty}${qa?'-qa':''}`;}
function eliminationBest(){try{const value=JSON.parse(localStorage.getItem(eliminationStorageKey())??'null');return value?.version===1&&Number.isInteger(value.bestPlace)&&value.bestPlace>=1&&value.bestPlace<=6?value.bestPlace as number:null;}catch{return null;}}
function refreshEliminationHistory(){const best=eliminationBest();el('race-mode-note').textContent='第30秒首次淘汰，此后每20秒淘汰末位 · 不限圈数'+(best?` · 本机最佳第${best}名`:'');}
function selectEliminationMode(){
 if(mode!=='ready')return;selectRaceMode('grand-prix');eliminationSelected=true;app.classList.add('elimination-mode');el('elimination-select').setAttribute('aria-pressed','true');document.querySelectorAll('[data-race-mode]').forEach(b=>b.setAttribute('aria-pressed','false'));
 el('menu').querySelectorAll('.race-settings>div')[1].innerHTML='<strong>30<span style="font-size:14px">s</span></strong><small>首次淘汰</small>';
 el('combat-note').textContent='本机淘汰赛 · 不计三圈云榜及每日成长';refreshEliminationHistory();activateTrack('mushroom');reset();
}
function stepElimination(){
 if(!elimination||mode!=='racing')return;
 // Hysteresis counts genuine passes, never a position gained from elimination.
 for(const r of racers){if(r===player||!activeRacer(r))continue;const gap=(player.t-r.t)*world.trackLength;
   const prior=eliminationPasses.get(r.key)??{behind:gap < -2,last:-Infinity};
   if(driving.recovered||driving.recoveryFlash>0||driving.wrongWay||driving.checkpointMissed){prior.behind=false;prior.last=raceTime;}
   else if(gap < -2)prior.behind=true;
   else if(gap>2&&prior.behind){if(driving.speed>8&&raceTime-prior.last>3){eliminationOvertakes++;prior.last=raceTime;}prior.behind=false;}
   eliminationPasses.set(r.key,prior);
 }
 const events=elimination.update(raceTime,racers.map(r=>({id:r.key,progress:r===player?driving.progress:r.t})));
 for(const dropped of events){const r=racers.find(r=>r.key===dropped.id)!;r.finish=dropped.at;r.speed=0;r.stun=0;r.immune=0;r.hitTime=0;eliminationExits.set(r.key,raceTime);aiBoost.delete(r.key);aiCombat.inventory(r.key).reset();
   for(let i=projectiles.length-1;i>=0;i--){const p=projectiles[i];if(p.owner===r||p.target===r){scene.remove(p.mesh);projectiles.splice(i,1);}}
   burst(racerPosition(r),0xffc95e,26);event(`${r.name} 被淘汰 · 第 ${dropped.place} 名`,1.5);audio.tone(190,.2);
 }
 const state=elimination.snapshot();
 if(state.complete){finishElimination();return;}
 const second=Math.ceil(state.remaining-1e-7);
 if(state.warning&&second!==eliminationWarningSecond){eliminationWarningSecond=second;audio.tone(state.order.at(-1)===player.key?330:550,.09);}
 if(!state.warning)eliminationWarningSecond=-1;
}
function finishElimination(){
 if(mode==='finished'||!elimination)return;const state=elimination.snapshot();if(!state.complete)return;
 rank=state.playerPlace!;raceTime=state.elapsed;mode='finished';clearInputs();driving.interruptDrift();driving.speed=0;driving.boost=0;syncDriving();trickScore.finish();audio.finish(rank);updateModels(0);
 const previous=eliminationBest(),bestPlace=previous===null?rank:Math.min(previous,rank);let saved=true;
 try{localStorage.setItem(eliminationStorageKey(),JSON.stringify({version:1,bestPlace,last:{place:rank,survival:state.elapsed,overtakes:eliminationOvertakes}}));}catch{saved=false;}
 el('dialog-eyebrow').textContent='LAST KART STANDING';el('dialog-title').textContent=rank===1?'坚持到最后，冠军！':`第 ${rank} 名 · 本场淘汰`;
 el('dialog-desc').textContent=rank===1?'五轮淘汰全部闯过，这条赛道属于你。':'下一场提前争位，最后五秒用漂移和道具反超。';
 el('countdown').textContent='';el('result').innerHTML='';eliminationView.result(el('result'),state,{overtakes:eliminationOvertakes,bestPlace:saved?bestPlace:previous,saved});
 el('resume').innerHTML='<span>再来一场淘汰赛</span><span>↗</span>';el('restart').textContent='重新挑战';el('home').textContent='返回赛道首页';el('overlay').style.display='flex';(el('resume') as HTMLButtonElement).focus();updateUI();
}

function selectCupMode(){if(mode!=='ready')return;selectRaceMode('grand-prix');cupSelected=true;cup=null;cupTimes=[];el('cup-select').setAttribute('aria-pressed','true');document.querySelectorAll('[data-race-mode]').forEach(b=>b.setAttribute('aria-pressed','false'));refreshCupHistory();el('combat-note').textContent='本机杯赛 · 不计单场用时榜及每日成长';reset();}
function refreshCupHistory(){el('race-mode-note').textContent='蘑菇赛道 → 城堡夜赛 · 每站三圈，总积分争冠';try{const saved=JSON.parse(localStorage.getItem(cupStorageKey())??'null');const prior=saved?.version===1&&saved.snapshot?.complete&&Array.isArray(saved.snapshot.standings)?saved.snapshot.standings.find((r:{id:string})=>r.id===saved.snapshot.playerId):null;if(prior&&Number.isInteger(prior.rank)&&prior.rank>=1&&prior.rank<=6&&Number.isInteger(prior.points)&&prior.points<=30)el('race-mode-note').textContent+=` · 上届第${prior.rank}名 / ${prior.points}分`;}catch{}}
function cupStorageKey(){return `mushroom-two-track-cup-v3-${selectedLoadout}-${difficulty}${qa?'-qa':''}`;}
function finishCupRound(){
 const ordered=[...racers].sort((a,b)=>a.finish!==null&&b.finish!==null?a.finish-b.finish:a.finish!==null?-1:b.finish!==null?1:b.t-a.t).map(r=>r.key);
 if(!cup!.finishRound(ordered))return;cupTimes[cup!.stageIndex]=raceTime;const snapshot=cup!.snapshot();el('result').innerHTML='';cupView.result(el('result'),snapshot);
 const details=document.createElement('details');details.className='cup-round-details';const summary=document.createElement('summary');summary.textContent=`本站 ${formatTime(raceTime)} · 技巧 ${trickScore.snapshot().score} 分`;details.append(summary);trickView.result(details,trickScore.snapshot(),{best:trickBest,improved:false,saved:true});el('result').append(details);
 let saved=true;if(cup!.complete){try{localStorage.setItem(cupStorageKey(),JSON.stringify({version:1,snapshot,times:cupTimes}));}catch{saved=false;}}
 const note=document.createElement('p');note.className='cup-local-note';note.textContent=cup!.complete?(saved?'杯赛结果已保存在本机 · 不计单场用时榜':'本机存储不可用，杯赛结果未保存'):'本站按玩家冲线时的赛况结算 · 杯赛不计单场榜和每日成长';el('result').append(note);
 el('dialog-eyebrow').textContent=cup!.complete?'TWO TRACK CUP · PODIUM':'TWO TRACK CUP · INTERMISSION';el('dialog-title').textContent=cup!.complete?'双站杯赛颁奖':'首站完成，夜赛见！';el('dialog-desc').textContent=cup!.complete?'两站积分已汇总，看看本届领奖台。':'下一站：城堡夜赛 · 连续弯与窄桥，留意青色路缘。';
 el('resume').innerHTML=cup!.complete?'<span>再战双站杯赛</span><span>↗</span>':'<span>下一站：城堡夜赛</span><span>→</span>';el('restart').textContent=cup!.complete?'重新挑战杯赛':'重跑本站';el('home').textContent='退出杯赛，返回首页';
}
el('start').addEventListener('click',start);el('restart').addEventListener('click',start);el('resume').addEventListener('click',resume);el('home').addEventListener('click',home);el('pause').addEventListener('click',showPause);
const itemButton=el('item') as HTMLButtonElement;
itemButton.addEventListener('pointerdown',e=>{if(itemButton.disabled)return;e.preventDefault();itemButton.setPointerCapture(e.pointerId);pointerKeys.add('KeyE');pressItem();});
itemButton.addEventListener('pointerup',()=>{pointerKeys.delete('KeyE');if(!readInput().item)releaseItem();});
for(const eventName of ['pointercancel','lostpointercapture'])itemButton.addEventListener(eventName,()=>{pointerKeys.delete('KeyE');cancelItemGesture();});
itemButton.addEventListener('contextmenu',e=>e.preventDefault());
itemButton.addEventListener('click',e=>{if(e.detail===0){pressItem();releaseItem();}});
function updateAudio(){audio.update({mode,track:activeTrack,lap:eliminationSelected?(elimination&&elimination.snapshot().activeIds.length<=2?3:1):driving.lap,speed:player.speed,boost:driving.boost});if(audio.problem&&audio.problem!==audioProblem)toast(audio.problem);audioProblem=audio.problem;}
function updateSoundButton(){const label=audio.muted?'打开声音':'静音';el('sound').innerHTML=svg(audio.muted?'mute':'sound');el('sound').setAttribute('aria-label',label);el('sound').setAttribute('aria-pressed',String(!audio.muted));el('sound').title=label;}
updateSoundButton();
el('sound').addEventListener('click',()=>{audio.unlock();audio.toggleMute();updateSoundButton();audio.tone(650);});
const audioSettings=document.createElement('details');audioSettings.className='audio-settings';audioSettings.innerHTML=`<summary>声音设置</summary><label for="music-volume">背景音乐 <output id="music-level">${Math.round(audio.musicVolume*100)}%</output></label><input id="music-volume" type="range" min="0" max="100" value="${Math.round(audio.musicVolume*100)}"/><label for="effects-volume">引擎与提示音 <output id="effects-level">${Math.round(audio.effectsVolume*100)}%</output></label><input id="effects-volume" type="range" min="0" max="100" value="${Math.round(audio.effectsVolume*100)}"/><p>晴空冲刺 / 月下疾驰 · 原创竞速配乐<br/>最后一圈自动提速 · 音乐与音效可分别调节</p>`;
el('result').after(audioSettings);
for(const kind of ['music','effects'] as const){const slider=el(`${kind}-volume`) as HTMLInputElement;slider.addEventListener('input',()=>{audio.setMix(kind,Number(slider.value)/100);el(`${kind}-level`).textContent=`${slider.value}%`;});slider.addEventListener('keydown',e=>{if(e.code!=='Escape')e.stopPropagation();});}
el('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(app.requestFullscreen)await app.requestFullscreen();else toast('当前浏览器暂不支持全屏');}catch{toast('当前浏览器暂不支持全屏');}});
window.addEventListener('keydown',e=>{if(loadoutView?.isOpen()||progression?.isOpen()||cloud?.isOpen())return;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Backspace'].includes(e.code))e.preventDefault();if(e.repeat)return;if(e.code==='Enter'&&mode==='ready'){start();return;}if(e.code==='Escape'||e.code==='KeyP'){showPause();return;}if((e.code==='KeyE'||e.code==='KeyQ')&&mode==='racing'){keys.add(e.code);pressItem();return;}if(e.code==='Backspace'&&mode==='racing'){breakTricks('救援中断');challengeMetrics.rescues++;playerRamp().reset();drafts.get(player.key)!.reset();driving.recover();coins=Math.max(0,coins-3);toast('已回到赛道 · 损失 3 枚金币');return;}keys.add(e.code);});
window.addEventListener('keyup',e=>{keys.delete(e.code);if((e.code==='KeyE'||e.code==='KeyQ')&&!readInput().item)releaseItem();});
function clearInputs(){for(const motion of rampMotions.values())motion.cancelInput();cancelItemGesture();keys.clear();pointerKeys.clear();document.querySelectorAll('.touch-button').forEach(b=>b.classList.remove('pressed'));}
window.addEventListener('blur',()=>{clearInputs();if(mode==='racing'||mode==='countdown')showPause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInputs();if(mode==='racing'||mode==='countdown')showPause();}});
document.querySelectorAll<HTMLButtonElement>('[data-key]').forEach(b=>{const release=()=>{pointerKeys.delete(b.dataset.key!);b.classList.remove('pressed');};b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);pointerKeys.add(b.dataset.key!);b.classList.add('pressed');});b.addEventListener('pointerup',release);b.addEventListener('pointercancel',release);b.addEventListener('lostpointercapture',release);});
window.addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<700?1.5:2));camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();updateCamera(1,true);});

// Read-only diagnostics, and test hooks only when explicitly requested by the QA URL.
const query=new URLSearchParams(location.search);
const qa=query.has('test');
const testWindow=window as unknown as Record<string,unknown>;
if(qa){testWindow.__THREE_GAME_TEST_HOOKS__={
 techniques:()=>({stats:{...techniqueStats},ramps:currentRamps(),draft:{...drafts.get(player.key)},ramp:{...playerRamp()},ai:racers.slice(1).map(r=>({id:r.key,t:r.t,lane:r.lane,height:rampMotions.get(r.key)!.height,draft:{...drafts.get(r.key)},ramp:{...rampMotions.get(r.key)}}))}),
 techniquePoint:({t,lane=0}:{t:number;lane?:number})=>{const p=world.sample(t,lane).position;return {x:p.x,z:p.z};},
 techniqueFixture:({kind='ramp',lane=3.5,speed=40}:{kind?:'ramp'|'horn'|'draft';lane?:number;speed?:number}={})=>{freeze=false;mode='ready';selectRaceMode(kind==='ramp'?'time-trial':'grand-prix');reset();mode='racing';app.classList.add('racing');raceTime=20;playerItemSafeUntil=0;const t=kind==='ramp'?.708:kind==='draft'?.03:.40;driving.reset(t,kind==='ramp'?lane:0,speed);racers.slice(1).forEach((r,i)=>{r.t=i===0&&kind!=='ramp'?t+(kind==='draft'?14:8)/world.trackLength:.15+i*.04;r.lane=0;r.speed=kind==='draft'?35:0;});syncDriving();updateModels(0);updateUI();updateCamera(1,true);},
 techniqueHazard:()=>{const p=driving.position.clone();p.y=.49;const mesh=shellMesh('banana');mesh.position.copy(p);scene.add(mesh);projectiles.push({owner:racers[1],routeId:null,birth:null,mesh,kind:'banana',heading:0,life:18,age:1,target:null,position:p,routeT:driving.routeT,lane:driving.lane});playerItemSafeUntil=0;},
 hornWallFixture:()=>{const wall=world.colliders.find(c=>c.kind==='rail')!;const mid=new THREE.Vector3((wall.a.x+wall.b.x)/2,.14,(wall.a.z+wall.b.z)/2),n=new THREE.Vector3(wall.b.z-wall.a.z,0,wall.a.x-wall.b.x).normalize();const position=mid.clone().addScaledVector(n,-3),mesh=shellMesh('banana');scene.add(mesh);mesh.position.copy(position);projectiles.push({owner:racers[1],routeId:null,birth:null,mesh,kind:'banana',heading:0,life:18,age:1,target:null,position,routeT:0,lane:0});driving.position.copy(mid).addScaledVector(n,3);driving.speed=0;fireHorn(player);return {remaining:projectiles.some(p=>p.mesh===mesh)};},
 loadout:()=>({selected:selectedLoadout,handling:{...driving.handling},testDrive,ghostKey:ghostKey(),bestKey:bestKey(),cupKey:cupStorageKey(),eliminationKey:eliminationStorageKey()}),
 selectLoadout,
 practiceNearEnd:()=>{if(testDrive)raceTime=19.9;},
 eliminationState:()=>({selected:eliminationSelected,state:elimination?.snapshot()??null,lapLimit:driving.lapLimit,overtakes:eliminationOvertakes,exits:[...eliminationExits],markers:eliminationMarkers.map(m=>({visible:m.visible,position:m.position.toArray()})),racers:racers.map(r=>({id:r.key,active:activeRacer(r),t:r.t,speed:r.speed,visible:r.mesh.visible,scale:r.mesh.scale.x,finish:r.finish})),badges:[...aiBadges.keys()]}),
 eliminationFixture:({time=25,playerLast=false,progress=.5}:{time?:number;playerLast?:boolean;progress?:number}={})=>{if(!eliminationSelected)selectEliminationMode();freeze=true;mode='racing';eventTime=0;toastTime=0;el('countdown').textContent='';el('toast').classList.remove('show');app.classList.add('racing');raceTime=time;driving.reset(progress,0,40,Math.floor(progress*8)+1);racers.filter(r=>r!==player&&activeRacer(r)).forEach((r,i)=>{r.t=progress+(playerLast?.1+i*.02:-.12-i*.02);r.lane=i%2?-3:3;r.speed=36;});syncDriving();stepElimination();updateModels(0);updateUI();updateCamera(1,true);},
 eliminationTick:(time:number)=>{raceTime=time;stepElimination();updateModels(0);updateUI();},
 eliminationThreat:()=>{const id=elimination!.snapshot().order.at(-1)!;const r=racers.find(r=>r.key===id)!;fireItem(r,'banana',true,null);fireItem(player,'red-shell',false,r);aiCombat.inventory(id).give('green-shell');updateModels(0);return id;},
 eliminationCollision:()=>{const id=elimination!.snapshot().eliminated[0].id;const r=racers.find(r=>r.key===id)!;r.t=driving.routeT;r.lane=driving.lane;driving.speed=0;driving.velocity.set(0,0,0);syncDriving();return id;},

 cup:()=>({selected:cupSelected,state:cup?.snapshot()??null,track:activeTrack,scenes:trackScenes.size,times:[...cupTimes]}),
 selectCupMode,
 cupNearFinish:()=>{mode='racing';app.classList.add('racing');driving.reset(2.985,0,40,24);raceTime=60;syncDriving();updateModels(0);updateCamera(1,true);},
 bridgeImpact:()=>{driving.reset(.49,3.5,38);const n=world.sample(.49).normal;driving.heading=driving.travelHeading=Math.atan2(n.x,n.z);driving.velocity.copy(n).multiplyScalar(38);syncDriving();updateModels(0);updateCamera(1,true);},
 bridgePoint:()=>({bridge:TRACKS.castle.bridge,width:world.widthAt(.49),point:world.sample(.49).position.toArray()}),

 tricks:()=>({...trickScore.snapshot(),best:trickBest,key:trickRecordKey(),valid:trickValid(),entry:trickRouteEntry}),
 trickDemo:()=>{for(const kind of ['orange','purple','overtake','shortcut','orange'] as TrickKind[])trickScore.award(kind);updateUI();},
 setupTrickPass:()=>{mode='ready';raceMode='grand-prix';reset();mode='racing';app.classList.remove('time-trial');raceTime=20;playerItemSafeUntil=0;app.classList.add('racing');driving.reset(.73,5,50);racers.slice(1).forEach((r,i)=>{r.t=i===0?.738:.2+i*.03;r.lane=i===0?-1:0;r.speed=i===0?22:36;});syncDriving();updateModels(0);updateUI();updateCamera(1,true);},
 prepareTrickTurbo:(stage:number)=>{driving.reset(.73,0,34);keys.add('KeyW');keys.add('Space');driving.step({throttle:true,brake:false,steer:-1,hop:true},coins,1/60);driving.hopHeight=driving.hopVelocity=0;driving.charge=stage===3?3.4:2.1;syncDriving();updateModels(0);updateCamera(1,true);},
 finishTrickFixture:()=>{driving.reset(3,0,0,25);syncDriving();finish();},

 selectDifficulty,
 combat:()=>({difficulty,held:heldItem?.kind??null,heldPosition:heldItem?.mesh.position.toArray()??null,pressing:itemGesture.down,protection:Math.max(0,playerItemSafeUntil-raceTime),stats:{...combatStats,...aiCombat.stats},ai:racers.filter(r=>r!==player).map(r=>({id:r.key,inventory:aiCombat.inventory(r.key).slots.map(s=>({...s})),boost:aiBoost.get(r.key)??0})),projectiles:projectiles.map(p=>({kind:p.kind,owner:p.owner.key,target:p.target?.key??null,x:p.position.x,z:p.position.z,age:p.age}))}),
 setupCombat:({kind='red-shell',behind=true,distance=48,lane=-3,t=.42}:{kind?:Item;behind?:boolean;distance?:number;lane?:number;t?:number}={})=>{mode='ready';reset();raceMode='grand-prix';app.classList.remove('time-trial');app.classList.add('racing');mode='racing';raceTime=20;playerItemSafeUntil=0;driving.reset(t,lane,0);racers.slice(1).forEach((r,i)=>{r.t=i===0?t+(behind?-distance:distance)/world.trackLength:.8+i*.025;r.lane=i===0?lane:4;r.speed=0;});syncDriving();updateModels(0);updateUI();updateCamera(1,true);return kind;},
 attack:({kind='red-shell',rear=false}:{kind?:Item;rear?:boolean}={})=>{fireItem(racers[1],kind,rear,kind==='red-shell'&&!rear?player:null);},
 armAi:(kind:Item)=>{aiCombat.inventory(racers[1].key).give(kind);},
 addReserve:(kind:Item)=>{inventory.slots.push({item:kind,pending:null,remaining:0,elapsed:0});},
 aiAtBox:()=>{mode='ready';reset();mode='racing';raceMode='grand-prix';raceTime=4;app.classList.add('racing');const box=world.pickups.find(p=>p.kind==='item')!;const r=racers[1];r.t=box.t-1/world.trackLength;r.lane=box.lane;r.speed=38;driving.reset(.5,-4,0);syncDriving();updateModels(0);updateCamera(1,true);},
 growth:()=>({effectColors:fx.filter(p=>p.life>0).map(p=>p.color),metrics:{...challengeMetrics},equipped:{...equipped},snapshot:progression?.getSnapshot(),paint:racers.map(r=>({key:r.key,colors:r.mesh.children.filter(o=>o instanceof THREE.Mesh&&(o.material as THREE.Material).userData.kartPaint).map(o=>(o as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>).material.color.getHex())}))}),
 selectRaceMode:(value:RaceMode)=>selectRaceMode(value),
 ghostData:()=>personalGhost,
 courseClearance:()=>{const solid=world.colliders.filter(c=>!courseHazards.some(h=>h.collider===c));const clearance=(p:THREE.Vector3)=>Math.min(...solid.map(c=>segmentDistance(p,c.a,c.b)-c.radius));return {main:Math.min(...Array.from({length:1000},(_,i)=>Math.min(...[-7,0,7].map(l=>clearance(world.sample(i/1000,l).position))))),branches:world.shortcuts.map(r=>({id:r.id,min:Math.min(...Array.from({length:250},(_,i)=>clearance(r.sample(i/249).position)))}))};},
 courseInfo:()=>world.shortcuts.map(r=>({id:r.id,name:r.name,from:r.from,to:r.to,length:r.length,width:r.width,savedMeters:r.savedMeters})),
 coursePoint:({id,u,lane=0}:{id:string;u:number;lane?:number})=>{const p=world.shortcuts.find(r=>r.id===id)!.sample(u,lane).position;return {x:p.x,z:p.z};},
 setupCourse:({id,u=0,time=0,lane=0,speed=0}:{id:string;u?:number;time?:number;lane?:number;speed?:number})=>{mode='ready';reset();mode='racing';app.classList.add('racing');const r=world.shortcuts.find(r=>r.id===id)!;const p=r.sample(u,lane);driving.reset(r.from+(r.to-r.from)*u,0,speed);driving.position.copy(p.position);driving.heading=driving.travelHeading=Math.atan2(p.tangent.x,p.tangent.z);driving.velocity.copy(p.tangent).multiplyScalar(speed);driving.project();raceTime=time;racers.slice(1).forEach((r,i)=>r.t=.4+i*.02);updateCourseHazards(courseHazards,time);courseVisuals.update(time);syncDriving();updateModels(0);updateCamera(1,true);},

 seed:(seed:number)=>{rngState=seed>>>0;},
 setState:(state:string)=>{freeze=false;mode='ready';reset();app.classList.add('racing');if(state==='active-play'){mode='racing';driving.reset(.12,-3,39);raceTime=12;racers.forEach((r,i)=>{if(i){r.t=.12+(i+.5)*.014;r.lane=i%2===0?3:-3;}});}else if(state==='ready'||state==='hero-asset'){mode='ready';app.classList.remove('racing');}else if(state==='paused'){mode='racing';showPause();}else if(state==='finished'){mode='racing';driving.reset(3,0,0,25);syncDriving();raceTime=65;finish();}else if(state==='near-finish'){mode='racing';driving.reset(2.985,0,40,24);raceTime=60;}else if(state==='straight'){mode='racing';driving.reset(-.06,0,32);racers.slice(1).forEach((r,i)=>r.t=.2+i*.02);}else throw new Error(`Unknown state: ${state}`);syncDriving();updateModels(0);updateUI();updateCamera(1,true);return {state};},
 setPausedForScreenshot:(paused:boolean)=>{freeze=paused;},
 giveItem:(value:Item|null)=>{inventory.give(value);updateUI();},
 placeAtPickup:(kind:'coin'|'item')=>{const p=world.pickups.find(p=>p.kind===kind)!;driving.reset(p.t-2/world.trackLength,p.lane,30);p.cooldown=0;p.object.visible=true;p.object.scale.setScalar(1);syncDriving();updateModels(0);updateCamera(1,true);},
 placeAtBarrier:(boosted=false)=>{const rail=world.colliders.find(c=>c.kind==='rail')!;const mid=new THREE.Vector3((rail.a.x+rail.b.x)/2,.14,(rail.a.z+rail.b.z)/2);const dx=rail.b.x-rail.a.x,dz=rail.b.z-rail.a.z,len=Math.hypot(dx,dz);let normal=new THREE.Vector3(-dz/len,0,dx/len);const road=world.sample(.18).position;if(normal.dot(road.clone().sub(mid))<0)normal.negate();driving.reset(.18,0,boosted?65:42);driving.position.copy(mid).addScaledVector(normal,5);driving.heading=driving.travelHeading=Math.atan2(-normal.x,-normal.z);driving.boost=boosted?2:0;driving.project();syncDriving();updateModels(0);updateCamera(1,true);return {mid:{x:mid.x,z:mid.z},normal:{x:normal.x,z:normal.z}};},
 setupDetour:(kind:string)=>{racers.slice(1).forEach((r,i)=>r.t=.5+i*.02);const t=kind==='missed'?.2:.12;driving.reset(t,kind==='far'?72:kind==='grass'?30:0,0,kind==='missed'?1:Math.floor(t*8)+1);if(kind==='far'){driving.position.set(500,.14,500);driving.project();}syncDriving();updateModels(0);updateCamera(1,true);},
 setupOvertake:(meters:number)=>{driving.reset(.12,-3,0);racers.forEach((r,i)=>{if(i){r.t=i===1?.12+meters/world.trackLength:.3+i*.02;r.lane=i===1?3:0;r.speed=0;r.hitTime=0;r.immune=0;}});syncDriving();updateModels(0);updateCamera(1,true);freeze=true;return racers[1].key;},
 setupRedChase:()=>{driving.reset(.4,0,0);racers.forEach((r,i)=>{if(i){r.t=i===1?.48:.15+i*.01;r.lane=3;r.speed=38;r.hitTime=0;r.immune=0;}});syncDriving();updateModels(0);updateCamera(1,true);inventory.give('red-shell');return racers[1].key;},
 placeAtBoost:()=>{const savedBoost=driving.boost;const p=world.boostPads[0];driving.reset(p.t-1/world.trackLength,p.lane,35);driving.boost=savedBoost;syncDriving();updateModels(0);},
 placeHazard:(kind:Item)=>{const heading=driving.heading+Math.PI;const position=driving.position.clone().add(new THREE.Vector3(Math.sin(driving.heading)*4,.35,Math.cos(driving.heading)*4));const mesh=shellMesh(kind);mesh.position.copy(position);scene.add(mesh);projectiles.push({owner:racers[1],routeId:null,birth:null,mesh,kind,heading,position,life:8,age:1,target:null,routeT:driving.routeT,lane:driving.lane});},
 placeRival:()=>{const r=racers[1];r.t=driving.routeT+.002;r.lane=driving.lane;r.speed=driving.speed;return r.key;},
 racerPositions:()=>racers.map(r=>({key:r.key,hitTime:r.hitTime,visible:r.mesh.visible,position:(r===player?driving.position:world.sample(r.t,r.lane).position).toArray()})),
 setCoins:(value:number)=>{coins=value;},
 pickups:()=>world.pickups.map(p=>({kind:p.kind,x:p.object.position.x,z:p.object.position.z,visible:p.object.visible,cooldown:p.cooldown})),
 trackPoint:(t:number)=>{const p=world.sample(t).position;return {x:p.x,z:p.z};},
 selectDriver:(key:string)=>{selectDriver(key);garage?.select(key);},
 };
}
function selectDriver(key:string){if(mode!=='ready')return;const chosen=racers.find(r=>r.key===key);if(!chosen||chosen===player)return;const old={key:player.key,name:player.name,color:player.color,mesh:player.mesh};Object.assign(player,{key:chosen.key,name:chosen.name,color:chosen.color,mesh:chosen.mesh});Object.assign(chosen,old);applyCosmetics(equipped);lastOrder='';updateModels(0);updateUI();updateCamera(1,true);}
const trialPanel=document.createElement('section');trialPanel.className='trial-hud';trialPanel.setAttribute('aria-label','计时挑战');trialPanel.innerHTML='<span class="trial-eyebrow">TIME TRIAL · PERSONAL BEST</span><h3 id="trial-title">挑战自己的每一个弯</h3><div class="trial-best" id="trial-best">首跑建立纪录</div><div class="trial-section"><span id="trial-sector">第 1 圈 · 分段 1 / 4</span><strong class="trial-delta" id="trial-delta">—</strong><span class="trial-detail" id="trial-detail">完成三圈后保存个人幽灵</span></div><button class="ghost-toggle" id="ghost-toggle" type="button" aria-pressed="true">个人幽灵：显示</button>';app.append(trialPanel);
el('ghost-toggle').addEventListener('click',()=>{ghostEnabled=!ghostEnabled;ghostView.update(referenceGhost,raceTime*1000,ghostEnabled&&raceMode==='time-trial'&&mode!=='ready');updateTrialUI();});
const modeSwitch=document.createElement('div');modeSwitch.className='race-mode-switch';modeSwitch.setAttribute('role','group');modeSwitch.setAttribute('aria-label','比赛模式');modeSwitch.innerHTML='<button type="button" data-race-mode="grand-prix" aria-pressed="true">道具竞速</button><button type="button" data-race-mode="time-trial" aria-pressed="false">计时挑战</button>';el('menu').querySelector('.race-settings')!.before(modeSwitch);
const modeNote=document.createElement('p');modeNote.className='race-mode-note';modeNote.id='race-mode-note';modeSwitch.after(modeNote);modeSwitch.querySelectorAll<HTMLButtonElement>('button').forEach(button=>button.addEventListener('click',()=>selectRaceMode(button.dataset.raceMode as RaceMode)));
const trickView=mountTrickView(app);
const cupView=mountCupView(app);
const eliminationView=mountEliminationView(app,roster.map(r=>({id:r.key,name:r.name})),()=>player.key);
const eliminationSelect=document.createElement('button');eliminationSelect.type='button';eliminationSelect.id='elimination-select';eliminationSelect.setAttribute('aria-pressed','false');eliminationSelect.textContent='末位淘汰赛';eliminationSelect.onclick=selectEliminationMode;
const cupSelect=document.createElement('button');cupSelect.type='button';cupSelect.id='cup-select';cupSelect.setAttribute('aria-pressed','false');cupSelect.textContent='双站杯赛';cupSelect.onclick=selectCupMode;modeSwitch.append(cupSelect,eliminationSelect);
const combatDifficulty=document.createElement('div');combatDifficulty.className='combat-difficulty';combatDifficulty.setAttribute('role','group');combatDifficulty.setAttribute('aria-label','道具对抗难度');combatDifficulty.innerHTML='<span>对抗难度</span><button type="button" data-combat-difficulty="casual" aria-pressed="false">休闲</button><button type="button" data-combat-difficulty="standard" aria-pressed="true">标准</button>';modeNote.after(combatDifficulty);const combatNote=document.createElement('p');combatNote.id='combat-note';combatNote.className='combat-note';combatNote.textContent='标准攻防 · AI 使用道具，成绩计入新版标准竞速榜';combatDifficulty.after(combatNote);combatDifficulty.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.onclick=()=>selectDifficulty(b.dataset.combatDifficulty as Difficulty));
const warning=document.createElement('div');warning.id='incoming-warning';warning.setAttribute('role','status');app.append(warning);
const courseStatus=document.createElement('div');courseStatus.id='course-status';courseStatus.setAttribute('role','status');app.append(courseStatus);
const courseTip=document.createElement('p');courseTip.className='course-tip';courseTip.textContent='双捷径已开放 · 绿灯通行 / 黄灯预警 / 红灯绕行';el('menu').append(courseTip);
const drivingStatus=document.createElement('div');drivingStatus.id='driving-status';app.append(drivingStatus);
garage=mountGarage(roster,selectDriver);
loadoutView=mountLoadoutView({getSelected:()=>selectedLoadout,onSelect:selectLoadout,onTestDrive:startTestDrive,canOpen:()=>mode==='ready'&&!testDrive});
progression=mountProgression({isTest:qa,onEquip:applyCosmetics,onOpen:()=>{clearInputs();if(mode==='racing'||mode==='countdown')showPause();}});
cloud=mountCloud({isTest:qa,onAccount:id=>progression?.setAccount(id),onProgress:value=>progression?.acceptCloud(value),onOpen:()=>{clearInputs();if(mode==='racing'||mode==='countdown')showPause();}});
selectRaceMode('grand-prix');reset();mode='ready';el('loading').remove();
let previous=performance.now(),accumulator=0;
function loop(now:number){requestAnimationFrame(loop);const dt=Math.min((now-previous)/1000,.1);previous=now;pollGamepad();
 if(!freeze&&mode!=='paused'&&mode!=='finished'){accumulator+=dt;while(accumulator>=1/60){step(1/60);accumulator-=1/60;frame++;}}
 if(!freeze)updateCamera(dt);if(frame%3===0)updateUI();updateAudio();renderer.render(scene,camera);
 if(qa)testWindow.__THREE_GAME_DIAGNOSTICS__={techniques:{...techniqueStats,draft:{...drafts.get(player.key)},ramp:{height:playerRamp().height,airborne:playerRamp().airborne,trickReady:playerRamp().trickReady,trick:playerRamp().trick,activeRamp:playerRamp().activeRamp}},loadout:selectedLoadout,practice:testDrive?{...practiceStats}:null,audio:audio.snapshot(),elimination:elimination?.snapshot()??null,eliminationOvertakes,mode,raceMode,track:activeTrack,cup:cup?.snapshot()??null,trial:{splits:[...trialSplits],bestMs:personalGhost?.durationMs??null,referenceMs:referenceGhost?.durationMs??null,ghostVisible:ghostView.mesh?.visible??false,ghostPosition:ghostView.mesh?.position.toArray()??null,notice:trialNotice},frame,raceTime,coins,item:inventory.item,inventory:inventory.slots.map(s=>({...s})),rolling:inventory.rolling,interactions:{...interactionStats},shards:shards.filter(p=>p.life>0).length,boost,charge,rank,lap:driving.lap,projectiles:projectiles.map(p=>({kind:p.kind,x:p.position.x,z:p.position.z,age:p.age,routeT:p.routeT,roadDistance:p.position.distanceTo(world.sample(p.routeT).position)})),lookBack,course:{hits:courseStats.hits,clears:courseStats.clears,shortcut:driving.shortcutId,hazards:courseHazards.map(h=>({id:h.id,kind:h.kind,phase:h.phase,seconds:h.seconds,x:h.position.x,z:h.position.z}))},trackLength:world.trackLength,player:{t:player.t,lane:player.lane,speed:player.speed,heading:driving.heading,travelHeading:driving.travelHeading,hopHeight:driving.hopHeight,stun:driving.stun,driftDirection:driving.driftDirection,driftStage:driving.driftStage,nextGate:driving.nextGate,routeT:driving.routeT,offRoad:driving.offRoad,wrongWay:driving.wrongWay,recoverySeconds:driving.recoverySeconds,recoveryFlash:driving.recoveryFlash,checkpointMissed:driving.checkpointMissed,driver:player.key,hitTime:player.hitTime,immune:player.immune,modelYaw:player.mesh.rotation.y,impactFlash:driving.impactFlash,x:player.mesh.position.x,y:player.mesh.position.y,z:player.mesh.position.z},renderer:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures},render:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles},memory:renderer.info.memory,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
}
requestAnimationFrame(loop);
