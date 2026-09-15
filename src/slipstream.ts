export type DraftRacer={id:string;x:number;z:number;height:number;heading:number;speed:number;progress:number;route:string|null;eligible:boolean};
export const DRAFT_TIME=1.1;
/** Real world cone and same-route eligibility; no ghosts, route snapping or remote targets. */
export class Slipstream {
 charge=0;cooldown=0;target:string|null=null;triggered=false;
 reset(){this.charge=this.cooldown=0;this.target=null;this.triggered=false;}
 step(dt:number,self:DraftRacer,others:readonly DraftRacer[],clear:(a:DraftRacer,b:DraftRacer)=>boolean){
  this.triggered=false;if(!Number.isFinite(dt)||dt<=0)return;
  this.cooldown=Math.max(0,this.cooldown-dt);
  if(!self.eligible||self.speed<18||this.cooldown>0){this.charge=0;this.target=null;return;}
  let chosen:DraftRacer|null=null,nearest=Infinity;
  for(const other of others){
   if(other.id===self.id||!other.eligible||other.speed<18||other.route!==self.route||Math.abs(other.height-self.height)>1.2)continue;
   const dx=other.x-self.x,dz=other.z-self.z,d=Math.hypot(dx,dz);
   const forward=dx*Math.sin(self.heading)+dz*Math.cos(self.heading),side=dx*Math.cos(self.heading)-dz*Math.sin(self.heading);
   if(d<4||d>18||forward<4||Math.abs(side)>2.5||Math.cos(other.heading-self.heading)<.94||other.progress<=self.progress||other.progress-self.progress>.045||!clear(self,other))continue;
   if(d<nearest){nearest=d;chosen=other;}
  }
  if(!chosen){this.charge=Math.max(0,this.charge-dt*2);if(this.charge===0)this.target=null;return;}
  if(this.target!==chosen.id)this.charge=0;this.target=chosen.id;this.charge=Math.min(DRAFT_TIME,this.charge+dt);
  if(this.charge>=DRAFT_TIME-1e-8){this.triggered=true;this.charge=0;this.cooldown=3;this.target=null;}
 }
}
