import * as THREE from 'three';
/** Bounded, reused effects: six draft wakes and six short horn pulses. */
export function createTechniqueEffects(scene:THREE.Scene,ids:string[]){
 const wakes=new Map<string,THREE.LineSegments>();
 const vertices:number[]=[];
 for(const side of [-1,1])for(let row=0;row<3;row++)for(let part=0;part<4;part++){
  const z=-1-part*1.6;vertices.push(side*(1.9+part*.15),.9+row*.35,z,side*(2.05+part*.15),.9+row*.35,z-1.05);
 }
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
 const mat=new THREE.LineBasicMaterial({color:0xb2f6ed,transparent:true,opacity:.85,depthWrite:false});
 for(const id of ids){const wake=new THREE.LineSegments(geo,mat);wake.visible=false;scene.add(wake);wakes.set(id,wake);}
 const ringGeometry=new THREE.RingGeometry(.91,1,64);
 const pulses=Array.from({length:6},()=>{const material=new THREE.MeshBasicMaterial({color:0xffdb55,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false});const mesh=new THREE.Mesh(ringGeometry,material);mesh.rotation.x=-Math.PI/2;mesh.visible=false;scene.add(mesh);return {mesh,life:0};});let next=0;
 return {
  reset(){for(const wake of wakes.values())wake.visible=false;for(const pulse of pulses){pulse.life=0;pulse.mesh.visible=false;}},
  draft(id:string,position:THREE.Vector3,heading:number,visible:boolean){const wake=wakes.get(id)!;wake.visible=visible;if(visible){wake.position.copy(position);wake.rotation.y=heading;}},
  horn(position:THREE.Vector3){const pulse=pulses[next++%pulses.length];pulse.life=.45;pulse.mesh.position.copy(position);pulse.mesh.position.y+=.8;pulse.mesh.scale.setScalar(.4);pulse.mesh.visible=true;},
  step(dt:number){for(const p of pulses){p.life=Math.max(0,p.life-dt);p.mesh.visible=p.life>0;p.mesh.scale.setScalar(12*(1-p.life/.45));p.mesh.material.opacity=p.life/.45*.8;}},
 };
}
