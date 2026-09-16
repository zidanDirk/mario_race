/** Surface effects are queried from the race clock, never wall-clock time. */
export type SurfaceState = Readonly<{kind:'dry'|'wet'|'belt';grip:number;speedScale:number;beltSpeed:number;warning:boolean;seconds:number}>;
export type SurfaceStrip = Readonly<{id:string;kind:'wet'|'belt';from:number;to:number;lane:number;width:number}>;
export const DRY_SURFACE:SurfaceState=Object.freeze({kind:'dry',grip:1,speedScale:1,beltSpeed:0,warning:false,seconds:0});
export const CASTLE_SURFACES:readonly SurfaceStrip[]=[
  {id:'castle-wet',kind:'wet',from:.17,to:.24,lane:3.5,width:6},
  {id:'castle-belt-left',kind:'belt',from:.30,to:.39,lane:-5,width:4},
  {id:'castle-belt-right',kind:'belt',from:.30,to:.39,lane:5,width:4},
];
export const BELT_SPEED=9;
export const BELT_PERIOD=12;
export const BELT_WARNING=2;
const smooth=(value:number)=>{const u=Math.max(0,Math.min(1,value));return u*u*(3-2*u);};
/** Positive speed always means race-forward, even when a kart stops or reverses. */
export function beltPhase(time:number,lane:number) {
  const clock=Number.isFinite(time)?Math.max(0,time):0;
  const phase=clock%BELT_PERIOD,seconds=BELT_PERIOD-phase;
  const direction=(Math.floor(clock/BELT_PERIOD)%2===0?1:-1)*(lane>=0?1:-1);
  return {direction,speed:direction*BELT_SPEED,warning:seconds<=BELT_WARNING,seconds};
}
export function surfaceAt(trackId:string,t:number,lane:number,time:number,trackLength:number):SurfaceState {
  if(trackId!=='castle'||!Number.isFinite(t)||!Number.isFinite(lane)||!Number.isFinite(trackLength)||trackLength<=0)return DRY_SURFACE;
  t=((t%1)+1)%1;
  for(const strip of CASTLE_SURFACES) {
    const along=Math.min(t-strip.from,strip.to-t)*trackLength;
    const across=strip.width/2-Math.abs(lane-strip.lane);
    if(along<=0||across<=0)continue;
    const amount=smooth(along/6)*smooth(across/.7);
    if(strip.kind==='wet')return {kind:'wet',grip:1-.42*amount,speedScale:1-.10*amount,beltSpeed:0,warning:false,seconds:0};
    const phase=beltPhase(time,strip.lane);
    return {kind:'belt',grip:1,speedScale:1,beltSpeed:phase.speed*amount,warning:phase.warning,seconds:phase.seconds};
  }
  return DRY_SURFACE;
}
/** AI changes its requested lane ahead of each visible surface; callers still steer gradually. */
export function surfaceLane(t:number,time:number,preferredLane:number,index:number,starActive=false):number|null {
  if(!Number.isFinite(t))return null;
  t=((t%1)+1)%1;
  if(t>=.135&&t<=.24) {
    // A minority takes the inner wet line; their surface speed/grip still applies.
    return starActive||(index%3===0&&preferredLane>0)?3.5:-3.5;
  }
  if(t>=.265&&t<=.39) {
    const phase=beltPhase(time,5);
    // Do not enter a lane just before it reverses. Center is always normal road.
    if(phase.warning||phase.seconds<3.5)return 0;
    return phase.direction>0?5:-5;
  }
  return null;
}
