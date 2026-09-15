import * as THREE from 'three';
import type {TrackSample} from './driving.ts';

export type Shortcut = {id:string; name:string; from:number; to:number; width:number; length:number; savedMeters:number; color:number; sample:(u:number,lane?:number)=>TrackSample; points:THREE.Vector3[]};
export function createShortcuts(sample:(t:number,lane?:number)=>TrackSample,trackLength:number):Shortcut[] {
  return [
    {id:'garden',name:'花园捷径',from:.10,to:.35,width:12,color:0x20bba3},
    {id:'workshop',name:'工坊捷径',from:.60,to:.89,width:9,color:0xffb52d},
  ].map(def=>{
    const a=sample(def.from),b=sample(def.to);
    const curve=new THREE.CubicBezierCurve3(a.position,a.position.clone().addScaledVector(a.tangent,22),b.position.clone().addScaledVector(b.tangent,-22),b.position);
    curve.arcLengthDivisions=400;
    const length=curve.getLength();
    function at(u:number,lane=0){u=THREE.MathUtils.clamp(u,0,1);const position=curve.getPointAt(u),tangent=curve.getTangentAt(u).normalize(),normal=new THREE.Vector3(tangent.z,0,-tangent.x);position.addScaledVector(normal,lane);return {position,tangent,normal};}
    return {...def,length,savedMeters:(def.to-def.from)*trackLength-length,sample:at,points:Array.from({length:129},(_,i)=>at(i/128).position)};
  });
}
export function projectShortcut(route:Shortcut,p:{x:number;z:number}) {
  let distance=Infinity,u=0,lane=0,tx=0,tz=1;
  for(let i=0;i<route.points.length-1;i++){
    const a=route.points[i],b=route.points[i+1],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
    const s=THREE.MathUtils.clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(length*length),0,1);
    const x=p.x-a.x-dx*s,z=p.z-a.z-dz*s,d=Math.hypot(x,z);
    if(d<distance){distance=d;u=(i+s)/(route.points.length-1);lane=(x*dz-z*dx)/length;tx=dx/length;tz=dz/length;}
  }
  return {distance,u,lane,tx,tz,t:route.from+(route.to-route.from)*u};
}
