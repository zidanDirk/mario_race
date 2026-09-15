import * as THREE from 'three';
import type {GhostRun} from './ghost';
import {sampleGhost} from './ghost';

/** Clone materials, not the live racer's mutable transforms. Ghost never enters physics. */
export class GhostView {
  mesh:THREE.Group|null=null;
  private materials:THREE.Material[]=[];
  constructor(private scene:THREE.Scene,private source:(character:string)=>THREE.Group){}
  setRun(run:GhostRun|null){
    if(this.mesh)this.scene.remove(this.mesh);
    this.materials.forEach(m=>m.dispose());this.materials=[];this.mesh=null;
    if(!run)return;
    const ghost=this.source(run.character).clone(true);
    ghost.name='personal-best-ghost';ghost.visible=false;
    ghost.traverse(object=>{
      object.castShadow=false;object.receiveShadow=false;
      if(object instanceof THREE.Mesh){
        const clone=(material:THREE.Material)=>{const m=material.clone();m.transparent=true;m.opacity=.3;m.depthWrite=false;
          if(m instanceof THREE.MeshStandardMaterial){m.color.lerp(new THREE.Color('#63e9f4'),.65);m.emissive.set('#166c7f');m.emissiveIntensity=.35;}
          this.materials.push(m);return m;};
        object.material=Array.isArray(object.material)?object.material.map(clone):clone(object.material);
        object.renderOrder=1;
      }
    });
    this.mesh=ghost;this.scene.add(ghost);
  }
  update(run:GhostRun|null,timeMs:number,visible:boolean){
    if(!this.mesh)return;
    const pose=run?sampleGhost(run,timeMs):null;this.mesh.visible=visible&&pose!==null;
    if(pose){this.mesh.position.set(pose.x,pose.y+.04,pose.z);this.mesh.rotation.set(0,pose.heading,0);}
  }
}

/** Quarter-lap lines are drawn on every legal route crossing the same scoring gate. */
export function buildSplitMarkers(scene:THREE.Scene,track:{sample:(t:number)=>{position:THREE.Vector3;tangent:THREE.Vector3};shortcuts:readonly {from:number;to:number;width:number;sample:(u:number)=>{position:THREE.Vector3;tangent:THREE.Vector3}}[]}){
  const root=new THREE.Group();root.visible=false;scene.add(root);
  const geometry=new THREE.BoxGeometry(1,1,1),paint=new THREE.MeshBasicMaterial({color:0x8ef6e4});
  function line(sample:{position:THREE.Vector3;tangent:THREE.Vector3},width:number){const mesh=new THREE.Mesh(geometry,paint);mesh.position.copy(sample.position);mesh.position.y+=.09;mesh.rotation.y=Math.atan2(sample.tangent.x,sample.tangent.z);mesh.scale.set(width,.015,.45);root.add(mesh);}
  for(const t of [.25,.5,.75]){line(track.sample(t),16);for(const route of track.shortcuts)if(t>route.from&&t<route.to)line(route.sample((t-route.from)/(route.to-route.from)),route.width-.8);}
  return root;
}
