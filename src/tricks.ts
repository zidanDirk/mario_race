export type TrickKind='orange'|'purple'|'overtake'|'shortcut'|'jump';
export const TRICK_LABELS:Record<TrickKind,string>={orange:'橙色漂移',purple:'紫色漂移',overtake:'贴身超车',shortcut:'捷径挑战',jump:'跳台技巧'};
const BASE:Record<TrickKind,number>={orange:100,purple:180,overtake:120,shortcut:160,jump:120};
const MAX_SCORE=100_000_000;
const EPS=1e-7;
export type TrickSnapshot={score:number;chain:number;multiplier:number;remaining:number;maxChain:number;maxMultiplier:number;counts:Record<TrickKind,number>;last:{label:string;points:number;serial:number}|null;breakReason:string};

/** Only simulation time advances a chain: pause/menu wall time has no effect. */
export class TrickScore {
  private state:TrickSnapshot=this.empty();
  private keys=new Set<string>();
  private frozen=false;
  private serial=0;
  private empty():TrickSnapshot{return {score:0,chain:0,multiplier:1,remaining:0,maxChain:0,maxMultiplier:1,counts:{orange:0,purple:0,overtake:0,shortcut:0,jump:0},last:null,breakReason:''};}
  reset(){this.state=this.empty();this.keys.clear();this.frozen=false;this.serial=0;}
  step(dt:number){if(this.frozen||!Number.isFinite(dt)||dt<=0||!this.state.chain)return;this.state.remaining=Math.max(0,this.state.remaining-dt);if(!this.state.remaining)this.breakChain('连击结束');}
  award(kind:TrickKind,key?:string):number{
    if(this.frozen||!Object.hasOwn(BASE,kind)||(key!==undefined&&(typeof key!=='string'||!key.length||this.keys.has(key)))||this.state.score>=MAX_SCORE)return 0;
    const chain=this.state.chain+1,multiplier=Math.min(3,1+.5*(chain-1)),points=Math.min(MAX_SCORE-this.state.score,BASE[kind]*multiplier);
    if(key!==undefined)this.keys.add(key);
    Object.assign(this.state,{score:this.state.score+points,chain,multiplier,remaining:8,maxChain:Math.max(this.state.maxChain,chain),maxMultiplier:Math.max(this.state.maxMultiplier,multiplier),last:{label:TRICK_LABELS[kind],points,serial:++this.serial},breakReason:''});
    this.state.counts[kind]++;return points;
  }
  breakChain(reason:string){if(this.frozen)return;Object.assign(this.state,{chain:0,multiplier:1,remaining:0,breakReason:typeof reason==='string'?reason:''});}
  finish(){this.frozen=true;}
  snapshot():TrickSnapshot{return {...this.state,counts:{...this.state.counts},last:this.state.last?{...this.state.last}:null};}
}

type Position={progress:number;x:number;z:number};
export type PassPlayer=Position&{speed:number;valid:boolean;lap:number};
export type PassRival=Position&{id:string;finished:boolean};
type Candidate={age:number;closeCrossing:boolean};
const finitePosition=(p:Position)=>Number.isFinite(p.progress)&&Number.isFinite(p.x)&&Number.isFinite(p.z);
const displacement=(a:Position,b:Position)=>Math.hypot(a.x-b.x,a.z-b.z);

/** Absolute lap progress avoids mistaking a lapped kart for a ranking overtake. */
export class NearPassTracker {
  private previous:PassPlayer|null=null;
  private rivals=new Map<string,PassRival>();
  private candidates=new Map<string,Candidate>();
  private awarded=new Set<string>();
  private highWater=-Infinity;
  private length=0;
  reset(){this.previous=null;this.rivals.clear();this.candidates.clear();this.awarded.clear();this.highWater=-Infinity;this.length=0;}
  invalidate(){this.previous=null;this.rivals.clear();this.candidates.clear();}
  step(dt:number,player:PassPlayer,rivals:PassRival[],trackLength:number):string[]{
    if(dt===0)return [];
    if(!Number.isFinite(dt)||dt<0||!Number.isFinite(trackLength)||trackLength<=0||!player.valid||!finitePosition(player)||!Number.isFinite(player.speed)||player.speed<12||!Number.isInteger(player.lap)||player.lap<0){this.invalidate();return [];}
    if(this.length&&this.length!==trackLength){this.invalidate();this.highWater=-Infinity;}this.length=trackLength;
    const previous=this.previous,validRivals=rivals.filter(r=>typeof r.id==='string'&&r.id.length&&finitePosition(r)&&!r.finished),oldRivals=this.rivals;
    this.previous={...player};this.rivals=new Map(validRivals.map(r=>[r.id,{...r}]));
    const movement=previous?(player.progress-previous.progress)*trackLength:0;
    const wasHighWater=this.highWater;this.highWater=Math.max(this.highWater,player.progress);
    if(!previous){this.candidates.clear();for(const rival of validRivals){const gap=(player.progress-rival.progress)*trackLength;if(gap<=-2+EPS&&gap>=-40-EPS)this.candidates.set(rival.id,{age:0,closeCrossing:false});}return [];}
    if(movement<-.001||movement>5+EPS||displacement(previous,player)>5+EPS||player.lap<previous.lap||player.lap>previous.lap+1||player.progress<wasHighWater-.001/trackLength){this.candidates.clear();return [];}
    const result:string[]=[],present=new Set(validRivals.map(r=>r.id));
    for(const id of this.candidates.keys())if(!present.has(id))this.candidates.delete(id);
    for(const rival of validRivals){
      const before=oldRivals.get(rival.id),gap=(player.progress-rival.progress)*trackLength,key=`${rival.id}:${player.lap}`;
      if(this.awarded.has(key)||!before||Math.abs(rival.progress-before.progress)*trackLength>5+EPS||displacement(before,rival)>5+EPS){this.candidates.delete(rival.id);continue;}
      let candidate=this.candidates.get(rival.id);
      if(candidate){candidate.age+=dt;if(candidate.age>6){this.candidates.delete(rival.id);candidate=undefined;}}
      // A bounded approach must actually be observed behind the same kart.
      if(!candidate&&gap<=-2+EPS&&gap>=-40-EPS){candidate={age:0,closeCrossing:false};this.candidates.set(rival.id,candidate);}
      if(!candidate)continue;
      const priorGap=(previous.progress-before.progress)*trackLength;
      if(priorGap<0&&gap>=0){
        const t=-priorGap/(gap-priorGap),px=previous.x+(player.x-previous.x)*t,pz=previous.z+(player.z-previous.z)*t,rx=before.x+(rival.x-before.x)*t,rz=before.z+(rival.z-before.z)*t;
        candidate.closeCrossing=Math.hypot(px-rx,pz-rz)<=8;
      }
      if(gap>=2-EPS){
        if(candidate.closeCrossing&&movement>0){this.awarded.add(key);result.push(rival.id);}
        this.candidates.delete(rival.id);
      }
    }
    return result;
  }
}

const validScore=(score:unknown):score is number=>typeof score==='number'&&Number.isFinite(score)&&Number.isInteger(score)&&score>=0&&score<=MAX_SCORE;
function parseScore(raw:string|null):number|null{if(raw===null||!raw.trim())return null;try{const parsed:unknown=JSON.parse(raw);return validScore(parsed)?parsed:null;}catch{return null;}}
export function loadTrickBest(storage:Pick<Storage,'getItem'>,key:string):number|null{
  try{return typeof key==='string'&&key?parseScore(storage.getItem(key)):null;}catch{return null;}
}
export function saveTrickBest(storage:Pick<Storage,'getItem'|'setItem'>,key:string,score:number):boolean{
  if(typeof key!=='string'||!key||!validScore(score))return false;
  try{const old=parseScore(storage.getItem(key));if(old!==null&&old>=score)return false;storage.setItem(key,String(score));return true;}catch{return false;}
}
export function trickRating(score:number):string{return !validScore(score)||score<800?'新秀车手':score<1800?'技巧高手':score<3200?'赛道达人':'特技大师';}
