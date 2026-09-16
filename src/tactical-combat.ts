import * as THREE from 'three';
import {sweepCircle,type Collider} from './collision.ts';
export const BOMB_FUSE=2.2,BOMB_RADIUS=12,STAR_DURATION=5;
export class BombMotion {
 readonly position:THREE.Vector3;readonly velocity:THREE.Vector3;
 age=0;done=false;
 constructor(position:THREE.Vector3,heading:number,rear=false,speed=0){this.position=position.clone();this.position.y+=.8;this.velocity=new THREE.Vector3(Math.sin(heading)*(rear?10:32+Math.max(0,speed)*.25),rear?3:7,Math.cos(heading)*(rear?10:32+Math.max(0,speed)*.25));}
 step(dt:number,colliders:readonly Collider[]){
  if(this.done||dt<=0||!Number.isFinite(dt))return;
  this.age+=dt;this.velocity.y-=20*dt;
  const delta=this.velocity.clone().multiplyScalar(dt),hit=sweepCircle(this.position,delta,.8,colliders);
  this.position.x+=delta.x*(hit?hit.time:1);this.position.z+=delta.z*(hit?hit.time:1);
  if(hit){this.velocity.x=this.velocity.z=0;this.position.x+=hit.normal.x*.02;this.position.z+=hit.normal.z*.02;}
  this.position.y=Math.max(.6,this.position.y+delta.y);
  if(this.position.y<=.6){this.velocity.y=0;this.velocity.x*=Math.exp(-8*dt);this.velocity.z*=Math.exp(-8*dt);}
 }
 get ready(){return this.age>=BOMB_FUSE;}
 detonate(){if(this.done)return false;this.done=true;return true;}
}
export function blastAffects(origin:{x:number;y:number;z:number},target:{x:number;y:number;z:number},clear:(a:{x:number;z:number},b:{x:number;z:number})=>boolean){return Math.hypot(origin.x-target.x,origin.z-target.z)<=BOMB_RADIUS&&Math.abs(origin.y-target.y)<=3&&clear(origin,target);}
