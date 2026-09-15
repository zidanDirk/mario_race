/** Horizontal capsule proxies shared by karts, scenery and shells. */
export type Point2 = { x: number; z: number };
export type Collider = { a: Point2; b: Point2; radius: number; kind: 'rail' | 'prop'; rampId?: string };
export type Contact = { normal: Point2; point: Point2; impact: number; kind: Collider['kind'] };
const dot = (a: Point2, b: Point2) => a.x * b.x + a.z * b.z;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export function closestPoint(p: Point2, a: Point2, b: Point2): Point2 {
  const x=b.x-a.x,z=b.z-a.z,l=x*x+z*z;
  const u=l?clamp(((p.x-a.x)*x+(p.z-a.z)*z)/l,0,1):0;
  return {x:a.x+x*u,z:a.z+z*u};
}
export function segmentDistance(p: Point2,a: Point2,b: Point2) {const q=closestPoint(p,a,b);return Math.hypot(p.x-q.x,p.z-q.z);}

/** Earliest swept circle contact; end caps also prevent tunnelling at rail tips. */
export function sweepCircle(p:Point2,delta:Point2,radius:number,colliders:readonly Collider[]) {
  let best: {time:number;normal:Point2;point:Point2;kind:Collider['kind']}|null=null;
  const consider=(time:number,normal:Point2,point:Point2,c:Collider)=>{if(time>=-1e-7&&time<=1&&dot(delta,normal)<-1e-7&&(!best||time<best.time))best={time:Math.max(0,time),normal,point,kind:c.kind};};
  const speed2=dot(delta,delta);if(speed2<1e-12)return best;
  for(const c of colliders){
    const r=radius+c.radius,ex=c.b.x-c.a.x,ez=c.b.z-c.a.z,len=Math.hypot(ex,ez);
    if(p.x+Math.max(0,delta.x)+r<Math.min(c.a.x,c.b.x)||p.x+Math.min(0,delta.x)-r>Math.max(c.a.x,c.b.x)||p.z+Math.max(0,delta.z)+r<Math.min(c.a.z,c.b.z)||p.z+Math.min(0,delta.z)-r>Math.max(c.a.z,c.b.z))continue;
    if(len>1e-8){
      const n={x:-ez/len,z:ex/len},dist=(p.x-c.a.x)*n.x+(p.z-c.a.z)*n.z,vn=dot(delta,n);
      for(const side of [-1,1]){if(Math.abs(vn)<1e-10)continue;const t=(side*r-dist)/vn;const x=p.x+delta.x*t,z=p.z+delta.z*t;const along=((x-c.a.x)*ex+(z-c.a.z)*ez)/(len*len);
        if(along>=0&&along<=1)consider(t,{x:n.x*side,z:n.z*side},{x:c.a.x+ex*along,z:c.a.z+ez*along},c);
      }
    }
    for(const end of [c.a,c.b]){
      const x=p.x-end.x,z=p.z-end.z,b=x*delta.x+z*delta.z,disc=b*b-speed2*(x*x+z*z-r*r);
      if(disc<0)continue;const t=(-b-Math.sqrt(disc))/speed2;const nx=x+delta.x*t,nz=z+delta.z*t,l=Math.hypot(nx,nz);
      if(l>1e-8)consider(t,{x:nx/l,z:nz/l},end,c);
    }
  }
  return best as {time:number;normal:Point2;point:Point2;kind:Collider['kind']}|null;
}

export function moveCircle(start:Point2,velocity:Point2,dt:number,radius:number,colliders:readonly Collider[]) {
  const position={...start},motion={x:velocity.x*dt,z:velocity.z*dt};const contacts:Contact[]=[];
  // Resolve overlap every step, including secondary pushes from another racer.
  for(let pass=0;pass<3;pass++)for(const c of colliders){const p=closestPoint(position,c.a,c.b),dx=position.x-p.x,dz=position.z-p.z,d=Math.hypot(dx,dz),r=radius+c.radius;
    if(d>=r-.0001)continue;let normal:Point2;
    if(d>1e-8)normal={x:dx/d,z:dz/d};else{const l=Math.hypot(c.b.x-c.a.x,c.b.z-c.a.z);normal=l?{x:-(c.b.z-c.a.z)/l,z:(c.b.x-c.a.x)/l}:{x:1,z:0};if(dot(normal,velocity)>0){normal.x*=-1;normal.z*=-1;}}
    position.x+=normal.x*(r-d+.002);position.z+=normal.z*(r-d+.002);
    const inward=dot(motion,normal);if(inward<0){motion.x-=inward*normal.x;motion.z-=inward*normal.z;}
    contacts.push({normal,point:p,impact:Math.max(0,-dot(velocity,normal)),kind:c.kind});
  }
  for(let pass=0;pass<4;pass++){
    const hit=sweepCircle(position,motion,radius,colliders);
    if(!hit){position.x+=motion.x;position.z+=motion.z;break;}
    position.x+=motion.x*hit.time+hit.normal.x*.002;position.z+=motion.z*hit.time+hit.normal.z*.002;
    contacts.push({normal:hit.normal,point:hit.point,impact:Math.max(0,-dot(velocity,hit.normal)),kind:hit.kind});
    motion.x*=1-hit.time;motion.z*=1-hit.time;
    const inward=dot(motion,hit.normal);motion.x-=inward*hit.normal.x;motion.z-=inward*hit.normal.z;
    motion.x*=.96;motion.z*=.96;
  }
  return {position,contacts};
}
