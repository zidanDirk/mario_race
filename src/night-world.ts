import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createTrack, castleBoundarySegments } from './tracks';
import type { Pickup, BoostPad } from './world';
import type { Collider } from './collision';
import type { Shortcut } from './routes';

/** Moonlit stone circuit. All architecture is baked by material; only pickups animate. */
export function buildNightWorld(scene: THREE.Scene) {
  const {id,config,curve,trackLength,sample,widthAt}=createTrack('castle');
  const colliders: Collider[]=[], animated: THREE.Object3D[]=[], pickups: Pickup[]=[],shortcuts:Shortcut[]=[];
  const staticRoot=new THREE.Group();
  const material=(color:number,emissive=0,intensity=0)=>new THREE.MeshStandardMaterial({color,roughness:.82,emissive,emissiveIntensity:intensity});
  const stone=material(0x526584),trim=material(0x8ea5bd),dark=material(0x202b48),road=material(0x657286),cyan=material(0x77dfec,0x3caac2,.7),gold=material(0xffd77c,0xffaa3d,.3),flame=material(0xffd58b,0xff941f,2),roof=material(0x343451),white=material(0xeaf5fc),water=material(0x16344b,0x124961,.16);
  const box=new THREE.BoxGeometry(1,1,1),sphere=new THREE.SphereGeometry(1,10,7);
  function mesh(g:THREE.BufferGeometry,m:THREE.Material,p:number[],scale:number[]=[1,1,1],ry=0,parent:THREE.Object3D=staticRoot) {
    const o=new THREE.Mesh(g,m);o.position.set(p[0],p[1],p[2]);o.scale.set(scale[0],scale[1],scale[2]);o.rotation.y=ry;o.receiveShadow=true;o.castShadow=true;parent.add(o);return o;
  }
  const cube=(m:THREE.Material,p:number[],s:number[],ry=0,parent:THREE.Object3D=staticRoot)=>mesh(box,m,p,s,ry,parent);
  function ribbon(m:THREE.Material,laneA:(t:number)=>number,laneB:(t:number)=>number,y:number,from=0,to=1,n=800) {
    const p:number[]=[],index:number[]=[];
    for(let i=0;i<=n;i++){const t=from+(to-from)*i/n;for(const lane of[laneA(t),laneB(t)]){const v=sample(t,lane).position;p.push(v.x,v.y+y,v.z)}if(i<n){const a=i*2;index.push(a,a+2,a+1,a+1,a+2,a+3)}}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(index);g.computeVertexNormals();const o=mesh(g,m,[0,0,0]);o.castShadow=false;
  }
  cube(material(0x28384d),[0,-.5,0],[1300,.8,1300]);
  ribbon(stone,t=>-widthAt(t)-2.2,t=>widthAt(t)+2.2,-.05);
  ribbon(road,t=>-widthAt(t),t=>widthAt(t),0);
  for(const side of[-1,1]) {
    ribbon(cyan,t=>side*(widthAt(t)-.32),t=>side*(widthAt(t)-.12),.024);
    ribbon(trim,t=>side*(widthAt(t)+.05),t=>side*(widthAt(t)+.52),.02);
  }
  // Road slabs and alternating curb blocks give useful speed and curvature cues.
  for(let i=0;i<180;i++) {
    const t=i/180,s=sample(t),heading=Math.atan2(s.tangent.x,s.tangent.z),w=widthAt(t);
    cube(trim,[s.position.x,.153,s.position.z],[w*2-.7,.01,.07],heading).castShadow=false;
    for(const side of[-1,1]){const p=sample(t,side*(w+.72)).position;cube(i%2?stone:cyan,[p.x,.25,p.z],[.55,.25,2.6],heading)}
  }
  // The same sampled endpoints author visible parapets and capsule collision.
  for(const {a,b,bridge,post,radius,kind} of castleBoundarySegments()) {
    const center=a.clone().add(b).multiplyScalar(.5),heading=Math.atan2(b.x-a.x,b.z-a.z),length=a.distanceTo(b);
    cube(stone,[center.x,.72,center.z],[.55,1.25,length+.07],heading);
    cube(bridge?cyan:trim,[center.x,1.38,center.z],[.68,.14,length+.09],heading);
    if(post)cube(trim,[a.x,1.12,a.z],[.84,2,.84],heading);
    colliders.push({a:{x:a.x,z:a.z},b:{x:b.x,z:b.z},radius,kind});
  }
  // Wide water moat is visible beside the bridge; its deck remains level with the road.
  const bridgeMid=(config.bridge!.from+config.bridge!.to)/2,bs=sample(bridgeMid),bh=Math.atan2(bs.tangent.x,bs.tangent.z);
  cube(water,[bs.position.x,-.065,bs.position.z],[105,.08,150],bh).castShadow=false;
  for(let i=0;i<24;i++) {
    const t=config.bridge!.from+(config.bridge!.to-config.bridge!.from)*i/23;
    for(const side of[-1,1]){const p=sample(t,side*(13+(i%3)*4)).position;cube(cyan,[p.x,-.018,p.z],[2.5,.015,.14],bh).castShadow=false}
  }
  function tower(x:number,z:number,size=1) {
    const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(size);staticRoot.add(g);
    mesh(new THREE.CylinderGeometry(4.4,5,16,12),stone,[0,8,0],[1,1,1],0,g);
    mesh(new THREE.CylinderGeometry(5.1,5.1,1.4,12),trim,[0,15.3,0],[1,1,1],0,g);
    for(let i=0;i<8;i++){const a=i*Math.PI/4;cube(stone,[Math.cos(a)*4.2,17,Math.sin(a)*4.2],[2.2,3.1,2.2],a,g)}
    for(const a of[0,Math.PI/2,Math.PI,Math.PI*1.5])cube(gold,[Math.sin(a)*4.47,10,Math.cos(a)*4.47],[1.05,3.1,.12],a,g);
    colliders.push({a:{x,z},b:{x,z},radius:5*size,kind:'prop'});
  }
  // Gate towers anchor start/finish, with clear full-width opening below the sign.
  const start=sample(0),heading=Math.atan2(start.tangent.x,start.tangent.z),gate=new THREE.Group();gate.position.copy(start.position);gate.rotation.y=heading;staticRoot.add(gate);
  for(const side of[-1,1]){const p=sample(0,side*17).position;tower(p.x,p.z,1.2)}
  cube(stone,[0,13,0],[35,4,3],0,gate);cube(trim,[0,15.2,0],[36,.65,3.6],0,gate);
  for(let i=-7;i<=7;i++)cube(stone,[i*2.4,16.6,0],[1.2,2.2,3],0,gate);
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=128;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#1d2b45';ctx.fillRect(0,0,768,128);ctx.fillStyle='#bff6ff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='900 78px Arial';ctx.fillText(config.title,384,69);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const banner=new THREE.MeshStandardMaterial({map:texture,roughness:.8,emissive:0x5597b5,emissiveIntensity:.35});
  for(const side of[-1,1])cube(banner,[0,13,side*1.52],[24,3,.04],side<0?Math.PI:0,gate);
  for(let row=0;row<3;row++)for(let col=0;col<18;col++)cube((row+col)%2?white:dark,[-8.5+col,.025,row-1],[1,.03,1],0,gate);
  // Courtyard keep and distant perimeter silhouettes read from several sectors.
  tower(-45,20,1.6);tower(15,30,1.8);tower(-35,75,1.2);tower(30,75,1.2);
  cube(stone,[-10,10,45],[65,20,42]);cube(trim,[-10,20.5,45],[68,1.2,45]);
  for(let x=-37;x<=20;x+=6)cube(stone,[x,22.3,23],[3.1,3.2,3]);
  cube(dark,[-10,7,23.8],[8,14,.5]);
  for(let x=-32;x<=18;x+=10)cube(gold,[x,14,23.7],[2.2,4.3,.4]);
  mesh(new THREE.ConeGeometry(16,23,4),roof,[-10,38,46],[1,1,1],Math.PI/4);
  // Torch clusters light by emissive surface rather than many expensive point lights.
  for(let i=0;i<34;i++)for(const side of[-1,1]) {
    const t=(i+.45)/34,s=sample(t,side*(widthAt(t)+3.5)),p=s.position;
    cube(dark,[p.x,2.1,p.z],[.35,4.2,.35]);
    mesh(new THREE.CylinderGeometry(.75,.4,.7,8),trim,[p.x,4.1,p.z]);
    mesh(sphere,flame,[p.x,4.85,p.z],[.55,.9,.55]);mesh(sphere,gold,[p.x,4.75,p.z],[.3,.55,.3]);
  }
  for(const t of[.17,.3,.62,.78,.91]){const p=sample(t,-23).position;tower(p.x,p.z,.8)}
  // Stars are a single draw call and the moon is an opaque low-poly silhouette.
  const starPositions:number[]=[];
  for(let i=0;i<130;i++){const a=i*2.399963,r=280+(i%7)*22;starPositions.push(Math.cos(a)*r,75+(i*47%135),Math.sin(a)*r)}
  const starGeo=new THREE.BufferGeometry();starGeo.setAttribute('position',new THREE.Float32BufferAttribute(starPositions,3));scene.add(new THREE.Points(starGeo,new THREE.PointsMaterial({color:0xd9edff,size:1.1,sizeAttenuation:true})));
  mesh(new THREE.SphereGeometry(13,24,16),new THREE.MeshBasicMaterial({color:0xe3eeff}),[170,115,-210]).castShadow=false;
  // Bake all static meshes into material batches with consistent vertex layouts.
  staticRoot.updateMatrixWorld(true);const batches=new Map<THREE.Material,THREE.BufferGeometry[]>();
  staticRoot.traverse(o=>{if(!(o instanceof THREE.Mesh)||Array.isArray(o.material))return;let g=o.geometry.clone().applyMatrix4(o.matrixWorld);if(g.index){const raw=g;g=raw.toNonIndexed();raw.dispose()}for(const key of Object.keys(g.attributes))if(!['position','normal','uv'].includes(key))g.deleteAttribute(key);if(!g.getAttribute('uv'))g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count*2),2));const list=batches.get(o.material)??[];list.push(g);batches.set(o.material,list)});
  for(const[m,gs]of batches){const geometry=mergeGeometries(gs,false);if(geometry){const o=new THREE.Mesh(geometry,m);o.castShadow=true;o.receiveShadow=true;scene.add(o)}gs.forEach(g=>g.dispose())}

  const coinGeo=new THREE.CylinderGeometry(.72,.72,.22,16).rotateX(Math.PI/2),coinRing=new THREE.TorusGeometry(.74,.085,6,16).translate(0,0,.13);
  const coinMeshGeometry=mergeGeometries([coinGeo,coinRing],false)!;
  for(const t of config.coinTs)for(let k=0;k<3;k++){
    const progress=t+k*.007,lane=(Math.floor(t*100)%3-1)*4.3,object=new THREE.Group();
    object.add(new THREE.Mesh(coinMeshGeometry,gold));
    object.position.copy(sample(progress,lane).position);object.position.y+=1.45;scene.add(object);pickups.push({object,t:progress,lane,kind:'coin',cooldown:0});animated.push(object);
  }
  const qc=document.createElement('canvas');qc.width=128;qc.height=128;const qctx=qc.getContext('2d')!;qctx.fillStyle='#48a8c6';qctx.fillRect(0,0,128,128);qctx.fillStyle='#ffffff';qctx.font='900 96px Arial';qctx.textAlign='center';qctx.textBaseline='middle';qctx.fillText('?',64,70);const qt=new THREE.CanvasTexture(qc);qt.colorSpace=THREE.SRGBColorSpace;
  const itemMat=new THREE.MeshStandardMaterial({map:qt,emissive:0x2b98b8,emissiveIntensity:.6,roughness:.3});
  const itemGeo=new RoundedBoxGeometry(1.9,1.9,1.9,2,.13);
  for(const t of config.itemTs)for(const lane of[-5,0,5]){const object=new THREE.Group();object.add(new THREE.Mesh(itemGeo,itemMat));object.position.copy(sample(t,lane).position);object.position.y+=2.15;object.rotation.set(.15,.5,.08);scene.add(object);pickups.push({object,t,lane,kind:'item',cooldown:0});animated.push(object)}
  const boostPads:BoostPad[]=config.boostPads.map(p=>({...p}));
  // Independent pads use one material batch instead of per-arrow scene draws.
  const pads=new THREE.Group();
  for(const pad of boostPads){const s=sample(pad.t,pad.lane),g=new THREE.Group();g.position.copy(s.position);g.rotation.y=Math.atan2(s.tangent.x,s.tangent.z);pads.add(g);cube(gold,[0,.035,0],[4.8,.07,7],0,g);for(let i=-1;i<=1;i++){const path=new THREE.Shape();path.moveTo(-1.8,-1+i*1.7);path.lineTo(0,.4+i*1.7);path.lineTo(1.8,-1+i*1.7);path.lineTo(1.8,-.2+i*1.7);path.lineTo(0,1.2+i*1.7);path.lineTo(-1.8,-.2+i*1.7);path.closePath();const o=new THREE.Mesh(new THREE.ShapeGeometry(path),white);o.rotation.set(-Math.PI/2,0,Math.PI);o.position.y=.08;g.add(o)}}scene.add(pads);
  return {id,trackLength,sample,curve,animated,pickups,boostPads,colliders,shortcuts,widthAt};
}
