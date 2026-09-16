import * as THREE from 'three';
import {BOMB_RADIUS,BOMB_FUSE} from './tactical-combat';
const body=new THREE.SphereGeometry(.8,16,12),foot=new THREE.SphereGeometry(.28,8,6),fuse=new THREE.CylinderGeometry(.06,.06,.5,6);
const dark=new THREE.MeshStandardMaterial({color:0x263242,metalness:.55,roughness:.32}),gold=new THREE.MeshStandardMaterial({color:0xffd653,emissive:0xe98b12,emissiveIntensity:.45}),white=new THREE.MeshBasicMaterial({color:0xffffff});
const starShape=new THREE.Shape();for(let i=0;i<10;i++){const a=i*Math.PI/5+Math.PI/2,r=i%2?.43:.9;const x=Math.cos(a)*r,y=Math.sin(a)*r;if(i===0)starShape.moveTo(x,y);else starShape.lineTo(x,y);}starShape.closePath();
const starGeometry=new THREE.ExtrudeGeometry(starShape,{depth:.2,bevelEnabled:true,bevelSize:.05,bevelThickness:.05,bevelSegments:1,steps:1});
const ringGeometry=new THREE.RingGeometry(.96,1,48);
export function tacticalItem(kind:'bomb'|'star'){
 const g=new THREE.Group();
 if(kind==='star'){g.add(new THREE.Mesh(starGeometry,gold));for(const x of [-.18,.18]){const eye=new THREE.Mesh(foot,dark);eye.scale.set(.2,.55,.2);eye.position.set(x,.08,.24);g.add(eye);}return g;}
 g.add(new THREE.Mesh(body,dark));for(const x of [-.4,.4]){const f=new THREE.Mesh(foot,gold);f.scale.set(1.4,.6,1.8);f.position.set(x,-.63,.25);g.add(f);const eye=new THREE.Mesh(foot,white);eye.scale.set(.35,.65,.18);eye.position.set(x*.6,.05,.76);g.add(eye);}
 const wick=new THREE.Mesh(fuse,gold);wick.position.set(.1,1,0);wick.rotation.z=-.35;g.add(wick);const spark=new THREE.Mesh(foot,gold);spark.scale.setScalar(.4);spark.position.set(.18,1.24,0);g.add(spark);return g;
}
export function bombWarning(){const material=new THREE.MeshBasicMaterial({color:0xff914c,transparent:true,opacity:.5,side:THREE.DoubleSide,depthWrite:false});const ring=new THREE.Mesh(ringGeometry,material);ring.rotation.x=-Math.PI/2;ring.scale.setScalar(BOMB_RADIUS);return ring;}
export function updateBombWarning(ring:ReturnType<typeof bombWarning>,position:THREE.Vector3,age:number){ring.position.set(position.x,.19,position.z);ring.material.color.setHex(age>BOMB_FUSE-.7?0xff4135:0xffbf55);ring.material.opacity=.35+.35*(.5+.5*Math.sin(age*(age>BOMB_FUSE-.7?30:12)));}
export function createTacticalEffects(scene:THREE.Scene,ids:string[]){
 const auras=new Map(ids.map(id=>{const g=new THREE.Group();for(let i=0;i<3;i++){const s=tacticalItem('star');s.scale.setScalar(.45);s.position.set(Math.cos(i*2*Math.PI/3)*2.3,1+Math.sin(i)*.5,Math.sin(i*2*Math.PI/3)*2.3);g.add(s);}g.visible=false;scene.add(g);return [id,g];}));
 const pulses=Array.from({length:6},()=>{const mesh=bombWarning();scene.add(mesh);mesh.visible=false;return {mesh,life:0};});let cursor=0;
 return {reset(){auras.forEach(g=>g.visible=false);pulses.forEach(p=>{p.life=0;p.mesh.visible=false;});},star(id:string,position:THREE.Vector3,time:number,remaining:number){const g=auras.get(id)!;g.visible=remaining>0;if(g.visible){g.position.copy(position);g.rotation.y=time*3;g.scale.setScalar(remaining<1?.9+.1*Math.sin(time*22):1);}},explode(position:THREE.Vector3){const p=pulses[cursor++%pulses.length];p.life=.5;p.mesh.position.set(position.x,.25,position.z);p.mesh.material.color.setHex(0xff7733);p.mesh.visible=true;},step(dt:number){for(const p of pulses){p.life=Math.max(0,p.life-dt);p.mesh.visible=p.life>0;p.mesh.scale.setScalar(BOMB_RADIUS*(1-p.life/.5));p.mesh.material.opacity=p.life/.5;}}};
}
