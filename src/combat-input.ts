import {isHoldableItem, type ItemSlot} from './items.ts';

/** A slot identity keeps a held item's removal from firing the reserve slot. */
export class ItemGesture {
  down=false;
  slot:ItemSlot|null=null;
  attached=false;
  private elapsed=0;
  press(slot:ItemSlot|null):'use'|'wait'|'none'{
    if(this.down)return 'none';this.down=true;this.elapsed=0;
    if(slot?.item&&isHoldableItem(slot.item)){this.slot=slot;return 'wait';}
    return 'use';
  }
  step(dt:number){
    if(!this.down||!this.slot||this.attached||!Number.isFinite(dt)||dt<=0)return false;
    this.elapsed+=dt;if(this.elapsed<.22)return false;this.attached=true;return true;
  }
  release(){const slot=this.slot;this.cancel();return slot;}
  breakHold(){this.slot=null;this.attached=false;}
  cancel(){this.down=false;this.slot=null;this.attached=false;this.elapsed=0;}
}

/** Earliest entry into a circle on a finite segment, including stationary overlaps. */
export function segmentHitTime(a:{x:number;z:number},b:{x:number;z:number},p:{x:number;z:number},radius:number){
 const x=a.x-p.x,z=a.z-p.z,dx=b.x-a.x,dz=b.z-a.z,c=x*x+z*z-radius*radius;
 if(c<=0)return 0;const l=dx*dx+dz*dz;if(l<1e-12)return null;
 const v=x*dx+z*dz,disc=v*v-l*c;if(disc<0)return null;const t=(-v-Math.sqrt(disc))/l;return t>=0&&t<=1?t:null;
}
