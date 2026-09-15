/** Low, optional ramps. Heights are relative to the normal road surface. */
export type Ramp = Readonly<{ id: string; t: number; lane: number; width: number; length: number; height: number }>;
export const MUSHROOM_RAMPS: readonly Ramp[] = [
  {id:'meadow-hop',t:.72,lane:3.5,width:5,length:9,height:1.6},
  {id:'meadow-hop-two',t:.785,lane:3.5,width:5,length:9,height:1.6},
];
export const TRICK_WINDOW = .15;
const GRAVITY=23;
export function rampDistance(t:number,ramp:Ramp,trackLength:number) {
  return (((t-ramp.t+.5)%1+1)%1-.5)*trackLength;
}
export function rampSurface(ramp:Ramp,distance:number) {
  const u=Math.max(0,Math.min(1,distance/ramp.length));
  return ramp.height*u*u*(2-u);
}
export type RampStep = {beforeT:number;routeT:number;lane:number;speed:number;hop:boolean;valid:boolean;dt:number;trackLength:number;ramps:readonly Ramp[]};
export class RampMotion {
  height=0; verticalVelocity=0; airborne=false; landed=false; launched=false;
  trickReady=false; trickLanded=false; trick=false; pitch=0; roll=0;
  activeRamp: string|null=null;
  private riding: Ramp|null=null;
  private held=false;
  private blocked=false;
  private buffered=Infinity;
  private flightTime=0;
  private eligible=false;
  reset() {
    this.height=this.verticalVelocity=this.pitch=this.roll=0;
    this.airborne=this.landed=this.launched=this.trickReady=this.trickLanded=this.trick=false;
    this.activeRamp=null;this.riding=null;this.held=this.blocked=false;
    this.buffered=Infinity;this.flightTime=0;this.eligible=false;
  }
  /** Pause/input cancellation cannot turn an already held drift button into a trick. */
  cancelInput() {this.buffered=Infinity;this.held=true;this.blocked=true;}
  step(input:RampStep) {
    const {beforeT,routeT,lane,speed,valid,trackLength,ramps}=input;
    const dt=Math.max(0,Math.min(input.dt,.05));
    this.landed=this.launched=this.trickLanded=false;
    if(!dt)return;
    const forward=(((routeT-beforeT+.5)%1+1)%1-.5)*trackLength;
    if(!valid||!Number.isFinite(forward)||Math.abs(forward)>Math.max(8,Math.abs(speed)*dt*3+2)) {
      this.reset();this.held=input.hop;this.blocked=input.hop;return;
    }
    if(!input.hop)this.blocked=false;
    const pressed=input.hop&&!this.held&&!this.blocked;
    this.held=input.hop;this.buffered+=dt;
    if(pressed)this.buffered=0;
    if(this.airborne) {
      this.flightTime+=dt;
      if(this.eligible&&pressed&&this.flightTime<=TRICK_WINDOW+1e-8)this.trick=true;
      this.verticalVelocity-=GRAVITY*dt;
      this.height+=this.verticalVelocity*dt;
      this.pitch=Math.atan2(this.verticalVelocity,Math.max(8,Math.abs(speed)));
      this.roll=this.trick?Math.sin(Math.min(1,this.flightTime/.55)*Math.PI)*.52:0;
      this.trickReady=this.eligible&&!this.trick&&this.flightTime<=TRICK_WINDOW;
      if(this.height<=0) {
        this.height=this.verticalVelocity=this.pitch=this.roll=0;this.airborne=false;
        this.landed=true;this.trickLanded=this.trick&&this.eligible;
        this.trick=this.eligible=this.trickReady=false;this.activeRamp=null;this.buffered=Infinity;
      }
      return;
    }
    const ramp=this.riding;
    if(ramp) {
      const before=rampDistance(beforeT,ramp,trackLength),after=rampDistance(routeT,ramp,trackLength);
      const onLane=Math.abs(lane-ramp.lane)<=ramp.width/2;
      if(after>=0&&after<=ramp.length&&onLane) {
        this.height=rampSurface(ramp,after);
        const u=after/ramp.length;
        this.pitch=Math.atan(ramp.height/ramp.length*(4*u-3*u*u));
        this.trickReady=speed>8&&forward>=0&&(ramp.length-after)/speed<=TRICK_WINDOW;
        return;
      }
      const cleanLip=onLane&&before<=ramp.length&&after>=ramp.length&&forward>0&&speed>8;
      this.riding=null;
      if(this.height>.015||cleanLip) {
        this.airborne=true;this.launched=cleanLip;this.eligible=cleanLip;this.flightTime=0;
        // A side exit falls naturally. Only crossing the lip awards a launch/trick opportunity.
        if(cleanLip)this.height=ramp.height;
        this.verticalVelocity=cleanLip?Math.max(3,Math.min(5.2,speed*ramp.height/ramp.length*.75)):0;
        this.trick=cleanLip&&this.buffered<=TRICK_WINDOW;
        this.trickReady=cleanLip&&!this.trick;
      } else {this.height=this.pitch=0;this.activeRamp=null;this.trickReady=false;}
      return;
    }
    this.height=this.pitch=0;this.trickReady=false;
    if(speed<=0||forward<0)return;
    for(const candidate of ramps) {
      const d=rampDistance(routeT,candidate,trackLength);
      // Only drive onto the low entry. This avoids snapping up from the side or reverse face.
      if(d>=0&&d<=candidate.length&&rampSurface(candidate,d)<=.35&&Math.abs(lane-candidate.lane)<=candidate.width/2) {
        this.riding=candidate;this.activeRamp=candidate.id;this.height=rampSurface(candidate,d);break;
      }
    }
  }
}
