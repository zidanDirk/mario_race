import type { Collider } from './collision';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createDriver } from './characters';
import { createShortcuts, projectShortcut } from './routes';
import { createTrack, TRACKS, type TrackId } from './tracks';
import { buildNightWorld } from './night-world';

export interface Pickup { object: THREE.Object3D; t: number; lane: number; kind: 'coin' | 'item'; cooldown: number }
export interface BoostPad { t: number; lane: number }

const materials = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: number, roughness = .7, metalness = 0) {
  const key = `${color}/${roughness}/${metalness}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  return materials.get(key)!;
}
const white = mat(0xfff9e9), red = mat(0xef384b), dark = mat(0x253940), gold = mat(0xffce38,.35,.35);
const sphere = new THREE.SphereGeometry(1, 14, 10);
const flowerSphere = new THREE.SphereGeometry(1, 6, 4);
const box = new THREE.BoxGeometry(1, 1, 1);
const rounded = new RoundedBoxGeometry(1, 1, 1, 2, .16);
function shape(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, p: number[], s: number[], ry = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(p[0],p[1],p[2]); mesh.scale.set(s[0],s[1],s[2]); mesh.rotation.y = ry;
  mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function ball(parent: THREE.Object3D, material: THREE.Material, p: number[], s: number[]) { return shape(parent, sphere, material, p,s); }
function cube(parent: THREE.Object3D, material: THREE.Material, p: number[], s: number[], ry=0) { return shape(parent,box,material,p,s,ry); }
function round(parent: THREE.Object3D, material: THREE.Material, p: number[], s: number[], ry=0) { return shape(parent,rounded,material,p,s,ry); }
function cylinder(parent: THREE.Object3D, material: THREE.Material, p: number[], r1: number,r2: number,h: number,sides=12) {
  return shape(parent,new THREE.CylinderGeometry(r1,r2,h,sides),material,p,[1,1,1]);
}
function textTexture(text: string, background: string, foreground: string, width=512,height=128) {
  const canvas = document.createElement('canvas'); canvas.width=width; canvas.height=height;
  const ctx=canvas.getContext('2d')!; ctx.fillStyle=background;ctx.fillRect(0,0,width,height);
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`900 ${height*.6}px Arial, sans-serif`;
  ctx.fillStyle=foreground;ctx.fillText(text,width/2,height*.53,width*.91);
  const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace; return texture;
}
// Static props are baked into a small number of material batches. This keeps the
// decorative world affordable while racers and collectibles remain independent.
function bake(root: THREE.Object3D, destination: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const batches=new Map<string,{material:THREE.Material;castShadow:boolean;receiveShadow:boolean;geometries:THREE.BufferGeometry[]}>();
  root.traverse(object=>{
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
    const geometry=object.geometry.clone().applyMatrix4(object.matrixWorld);
    const clean=geometry.index ? geometry.toNonIndexed() : geometry;
    for(const name of Object.keys(clean.attributes)) if(!['position','normal','uv'].includes(name))clean.deleteAttribute(name);
    if(!clean.getAttribute('uv')) clean.setAttribute('uv',new THREE.Float32BufferAttribute(new Array(clean.getAttribute('position').count*2).fill(0),2));
    const key=`${object.material.uuid}/${object.castShadow}/${object.receiveShadow}`;
    let batch=batches.get(key);
    if(!batch){batch={material:object.material,castShadow:object.castShadow,receiveShadow:object.receiveShadow,geometries:[]};batches.set(key,batch);}
    batch.geometries.push(clean);
  });
  for(const {material,castShadow,receiveShadow,geometries} of batches.values()) {
    const geometry=mergeGeometries(geometries,false); if(!geometry)continue;
    const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=castShadow;mesh.receiveShadow=receiveShadow;destination.add(mesh);
    geometries.forEach(g=>g.dispose());
  }
}

export function buildWorld(scene: THREE.Scene, id: TrackId = 'mushroom') {
  if(id === 'castle') return buildNightWorld(scene);
  const {curve,trackLength,sample,widthAt}=createTrack(id);
  const shortcuts=createShortcuts(sample,trackLength);
  const inShortcut=(x:number,z:number,margin=3)=>shortcuts.some(route=>projectShortcut(route,{x,z}).distance<route.width/2+margin);
  const colliders:Collider[]=[];
  const obstacle=(x:number,z:number,radius:number)=>colliders.push({a:{x,z},b:{x,z},radius,kind:'prop'});
  const staticProps=new THREE.Group();
  const animated:THREE.Object3D[]=[];
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1500,1500),mat(0x79c85b));
  ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);

  function ribbon(left:number,right:number,y:number,material:THREE.Material,from=0,to=1,segments=700) {
    const positions:number[]=[],uvs:number[]=[],indices:number[]=[];
    for(let i=0;i<=segments;i++) {
      const t=from+(to-from)*i/segments;
      for(const lane of [left,right]) {const p=sample(t,lane).position;positions.push(p.x,p.y+y,p.z);uvs.push(lane===left?0:1,t*trackLength/9);}
      if(i<segments){const j=i*2;indices.push(j,j+2,j+1,j+1,j+2,j+3);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();
    const mesh=new THREE.Mesh(g,material);mesh.receiveShadow=true;scene.add(mesh);return mesh;
  }
  // Broad gravel shoulder, saturated curb bands, then clean pale edge markings.
  ribbon(-11.2,11.2,-.035,mat(0xe6dba3));
  ribbon(-9,9,0,mat(0x4c6670,.94));
  ribbon(-8.95,-8.67,.012,white);ribbon(8.67,8.95,.012,white);
  const curbSegments=210;
  for(let i=0;i<curbSegments;i++) {
    for(const side of [-1,1]) {
      const mesh=ribbon(side<0?-10.25:9.03,side<0?-9.03:10.25,.02,i%2?white:red,i/curbSegments,(i+1)/curbSegments,4);
      scene.remove(mesh);staticProps.add(mesh);
    }
  }
  for(let i=0;i<80;i++) {
    const p=sample(i/80);
    const stripe=cube(staticProps,white,[p.position.x,.17,p.position.z],[.18,.016,3.1],Math.atan2(p.tangent.x,p.tangent.z));
    stripe.castShadow=false;
  }
  // Checkered start line: physical decals survive any camera distance and angle.
  const start=sample(0), startHeading=Math.atan2(start.tangent.x,start.tangent.z);
  const startGroup=new THREE.Group(); startGroup.position.copy(start.position);startGroup.rotation.y=startHeading;
  for(let row=0;row<3;row++)for(let col=0;col<18;col++)cube(startGroup,(row+col)%2?white:dark,[-8.5+col,.025,-1+row],[1,.025,1]);
  for(const x of [-11.2,11.2]){
    const post=sample(0,x).position;obstacle(post.x,post.z,1);
    round(startGroup,red,[x,5.5,0],[1.4,11,1.4]);
    round(startGroup,white,[x,1.2,0],[2,2.4,2]);
    ball(startGroup,gold,[x,11.6,0],[.85,.85,.85]);
  }
  round(startGroup,red,[0,10.7,0],[24,3,1.4]);
  const bannerMat=new THREE.MeshStandardMaterial({map:textTexture('MUSHROOM CUP','#fff7de','#ec364a'),roughness:.8});
  cube(startGroup,bannerMat,[0,10.65,-.73],[18,2,.04]);
  cube(startGroup,bannerMat,[0,10.65,.73],[18,2,.04],Math.PI);
  for(let i=0;i<6;i++) for(const side of [-1,1])cube(startGroup,i%2?white:dark,[side*(9.2+i*.32),9.5,0],[.3,.5,1.6]);
  staticProps.add(startGroup);

  let seed=123423;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const nearestRoad=(x:number,z:number)=>{
    let distance=Infinity;for(let i=0;i<180;i++){const p=curve.getPointAt(i/180);distance=Math.min(distance,Math.hypot(x-p.x,z-p.z));}return distance;
  };
  function mushroom(x:number,z:number,size:number,color:number) {
    obstacle(x,z,.85*size);
    const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=random()*Math.PI*2;g.scale.setScalar(size);
    cylinder(g,mat(0xffefca),[0,2,0],.7,1,4);
    ball(g,mat(color),[0,4,0],[3.2,1.75,3.2]);
    // Raised white spots sit on the cap ellipsoid, making an unmistakable mushroom silhouette.
    for(let i=0;i<7;i++){
      const angle=i*2.399,rad=i?1.9:0;
      const px=Math.cos(angle)*rad,pz=Math.sin(angle)*rad;
      const py=4+1.75*Math.sqrt(Math.max(0,1-rad*rad/(3.2*3.2)));
      const dot=ball(g,white,[px,py,pz],[.63,.12,.63]);
      dot.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(px/(3.2*3.2),(py-4)/(1.75*1.75),pz/(3.2*3.2)).normalize());
    }
    staticProps.add(g);
  }
  function tree(x:number,z:number,size:number,variant:number) {
    obstacle(x,z,.65*size);
    const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(size);
    cylinder(g,mat(0xb57b46),[0,2,0],.48,.72,4,8);
    const leaf=mat(variant?0x288f67:0x43a95a);
    ball(g,leaf,[0,5,0],[2.9,3.6,2.6]);
    ball(g,leaf,[-1.7,4.1,.3],[1.8,2.2,1.8]);
    ball(g,mat(variant?0x48ad70:0x62bd63),[1.2,5.7,.3],[1.9,2.35,1.8]);
    staticProps.add(g);
  }
  // Near-course mushrooms and trees form distinct clusters with open sight lines.
  for(let i=0;i<72;i++) {
    const t=(i+.2)/72,side=i%2?1:-1;
    const p=sample(t,side*(16+random()*18)).position;
    if(nearestRoad(p.x,p.z)<14 || inShortcut(p.x,p.z,7))continue;
    if(i%3===0) tree(p.x,p.z,.8+random()*.75,i%2);
    else mushroom(p.x,p.z,.55+random()*1.1,[0xf54b4f,0xf4ba3e,0xe98bb4][i%3]);
  }
  for(let i=0;i<65;i++) {
    const x=(random()-.5)*470,z=(random()-.5)*430;
    if(inShortcut(x,z,7) || nearestRoad(x,z)<28 || Math.hypot(x+10,z-20)<37)continue;
    tree(x,z,.9+random()*1.3,i%2);
  }
  // Distant rounded landforms provide a soft three-layer horizon.
  for(let i=0;i<19;i++) {
    const a=i/19*Math.PI*2,r=230+random()*130;
    const h=22+random()*45;
    const hill=ball(staticProps,mat([0x87ca85,0x61b794,0x90d293,0x70c39a][i%4]),[Math.cos(a)*r,-3,Math.sin(a)*r],[35+random()*35,h,35+random()*35]);
    hill.castShadow=false;
    if(i%3===0)for(const ox of [-3,3])ball(staticProps,mat(0x418e77),[Math.cos(a)*r+ox,h*.62,Math.sin(a)*r-30],[.9,2.9,.8]);
  }
  // The castle sits inside the circuit, visible beyond several corners.
  const castle=new THREE.Group();castle.position.set(-14,0,39);castle.rotation.y=-.35;
  const stone=mat(0xffefc9),roof=mat(0xf1647b),window=mat(0x55899c);
  round(castle,mat(0xe1cfac),[0,1,0],[28,2,20]);
  cube(castle,stone,[0,7,0],[23,12,15]);
  round(castle,mat(0xd6b892),[0,2.4,-7.7],[8,4.8,.7]);
  round(castle,window,[0,4.2,-8.1],[4.7,7.8,.5]);
  for(let x=-10;x<=10;x+=4)cube(castle,stone,[x,14,0],[2.4,3,15]);
  for(const x of [-12,12])for(const z of [-8,8]){
    cylinder(castle,stone,[x,9,z],3.8,4.1,18,16);
    cylinder(castle,mat(0xe6d4b2),[x,17,z],4,4,1.4,16);
    cylinder(castle,roof,[x,22,z],0,5.1,10,16);
    cylinder(castle,gold,[x,28,z],.13,.13,3,8);
    const flag=new THREE.Shape();flag.moveTo(0,0);flag.lineTo(3.4,-.8);flag.lineTo(0,-1.7);flag.closePath();
    const flagMesh=new THREE.Mesh(new THREE.ShapeGeometry(flag),red);flagMesh.position.set(x,29,z);castle.add(flagMesh);
    round(castle,window,[x,11,z-3.81],[1.5,3.3,.15]);
  }
  cube(castle,stone,[0,16,2],[11,13,10]);
  cylinder(castle,roof,[0,26,2],0,8.5,9,4).rotation.y=Math.PI/4;
  const crest=ball(castle,white,[0,18,-3.3],[2.1,2.1,.2]);crest.castShadow=false;
  ball(castle,roof,[0,18.2,-3.6],[1.2,.7,.2]);
  staticProps.add(castle);

  // Scenic little pond, flower beds, fences and racing signs reward each sector.
  const pond=shape(staticProps,new THREE.CircleGeometry(19,48),mat(0x54cbd3,.18,.1),[53,.055,49],[1,1,1]);pond.rotation.x=-Math.PI/2;pond.scale.y=.6;pond.castShadow=false;
  for(let i=0;i<130;i++) {
    const p=sample(random(),(random()<.5?-1:1)*(12+random()*13)).position;
    if(nearestRoad(p.x,p.z)<11.5 || inShortcut(p.x,p.z,1))continue;
    const flowerColor=mat([0xfff1a6,0xfffcf0,0xef87ab][i%3]);
    for(let j=0;j<4;j++){const a=j*Math.PI/2;shape(staticProps,flowerSphere,flowerColor,[p.x+Math.cos(a)*.22,.3,p.z+Math.sin(a)*.22],[.25,.12,.25]).castShadow=false;}
    shape(staticProps,flowerSphere,gold,[p.x,.4,p.z],[.16,.13,.16]).castShadow=false;
  }
  // Rails follow the bend; the same endpoints author both visuals and collision.
  for(const t of [.18,.25,.36,.47,.55,.66,.74,.87])for(const side of [-1,1]) {
    for(let i=0;i<8;i++){
      const a=sample(t+(i-4)*2/trackLength,side*13.5).position;
      const b=sample(t+(i-3)*2/trackLength,side*13.5).position;
      if(inShortcut(a.x,a.z)||inShortcut(b.x,b.z))continue;
      const length=a.distanceTo(b),heading=Math.atan2(b.x-a.x,b.z-a.z);
      const g=new THREE.Group();g.position.copy(a).add(b).multiplyScalar(.5);g.rotation.y=heading;
      for(const y of [.7,1.6])cube(g,white,[0,y,0],[.28,.24,length+.08]);
      cube(g,i%2?red:white,[0,1.1,-length/2],[.3,2.2,.3]);
      if(i===7)cube(g,white,[0,1.1,length/2],[.3,2.2,.3]);
      staticProps.add(g);colliders.push({a:{x:a.x,z:a.z},b:{x:b.x,z:b.z},radius:.16,kind:'rail'});
    }
  }
  const arrowMat=new THREE.MeshStandardMaterial({map:textTexture('› › ›','#ffcf40','#293c44',256,128),roughness:.8});
  for(const t of [.25,.38,.5,.63,.77,.91]) {
    const p=sample(t,-12.5); if(inShortcut(p.position.x,p.position.z,5))continue; const g=new THREE.Group();g.position.copy(p.position);g.rotation.y=Math.atan2(p.tangent.x,p.tangent.z)+Math.PI;
    for(const x of [-1.5,1.5]){cylinder(g,dark,[x,1.7,0],.13,.13,3.4,6);const post=p.position.clone().addScaledVector(p.normal,-x);obstacle(post.x,post.z,.13);}
    round(g,dark,[0,3.5,0],[4.6,2.5,.35]);cube(g,arrowMat,[0,3.5,.19],[4.25,2.15,.025]);staticProps.add(g);
  }
  // Puffy clouds are opaque, inexpensive geometry and do not obscure the track.
  for(let i=0;i<20;i++) {
    const a=i/20*Math.PI*2,r=140+random()*170;
    const x=Math.cos(a)*r,z=Math.sin(a)*r,y=65+random()*40;
    for(let j=0;j<4;j++){const cloud=ball(staticProps,mat(0xfffef4),[x+j*6,y+(j===1?3:0),z],[7+j%2*2,4+j%2*3,5]);cloud.castShadow=false;cloud.receiveShadow=false;}
  }
  // Balloon bunches near the start lend height and a festive grand-prix silhouette.
  const stringMat=mat(0xf8f1d3);
  for(let side=0;side<2;side++) {
    const p=sample(.015,side?-23:23).position;
    for(let i=0;i<3;i++) {
      const x=p.x+(i-1)*3,z=p.z+i%2*2,y=17+i%2*3;
      cylinder(staticProps,stringMat,[x,y/2,z],.035,.035,y,5);
      ball(staticProps,[red,gold,mat(0x49bddb)][i],[x,y,z],[2,2.6,2]);
    }
  }
  bake(staticProps,scene);

  const pickups:Pickup[]=[];
  const coinCore=new THREE.CylinderGeometry(.72,.72,.22,20);
  const coinRing=new THREE.TorusGeometry(.74,.085,6,20);
  const coinMark=new THREE.BoxGeometry(.16,.78,.035);
  for(const t of TRACKS.mushroom.coinTs) {
    for(let k=0;k<3;k++) {
      const progress=t+k*.007,lane=(Math.floor(t*100)%3-1)*4.8;
      const object=new THREE.Group();
      const disk=new THREE.Mesh(coinCore,gold);disk.rotation.x=Math.PI/2;object.add(disk);
      const rim=new THREE.Mesh(coinRing,mat(0xffee85,.3,.45));rim.position.z=.13;object.add(rim);
      const mark=new THREE.Mesh(coinMark,mat(0xc28616,.5,.3));mark.position.z=.14;object.add(mark);
      object.position.copy(sample(progress,lane).position);object.position.y+=1.45;scene.add(object);
      pickups.push({object,t:progress,lane,kind:'coin',cooldown:0});animated.push(object);
    }
  }
  const questionTexture=textTexture('?','#58ccde','#ffffff',128,128);
  const questionMat=new THREE.MeshStandardMaterial({map:questionTexture,color:0xffffff,roughness:.3,metalness:.08,emissive:0x0a343e,emissiveIntensity:.3});
  const itemEdges=new THREE.EdgesGeometry(new THREE.BoxGeometry(1.9,1.9,1.9));
  for(const t of TRACKS.mushroom.itemTs)for(const lane of [-5,0,5]) {
    const object=new THREE.Group();
    const item=new THREE.Mesh(new RoundedBoxGeometry(1.9,1.9,1.9,2,.13),questionMat);object.add(item);
    const edges=new THREE.LineSegments(itemEdges,new THREE.LineBasicMaterial({color:0xd9fcff}));object.add(edges);
    object.position.copy(sample(t,lane).position);object.position.y+=2.15;object.rotation.set(.15,.5,.08);scene.add(object);
    pickups.push({object,t,lane,kind:'item',cooldown:0});animated.push(object);
  }
  const boostPads:BoostPad[]=TRACKS.mushroom.boostPads.map(pad=>({...pad}));
  for(const pad of boostPads) {
    const s=sample(pad.t,pad.lane),g=new THREE.Group();g.position.copy(s.position);g.rotation.y=Math.atan2(s.tangent.x,s.tangent.z);
    round(g,mat(0xf39a31),[0,.035,0],[4.8,.07,7]);
    for(let i=-1;i<=1;i++) {
      const path=new THREE.Shape();path.moveTo(-1.8,-1+i*1.7);path.lineTo(0,.4+i*1.7);path.lineTo(1.8,-1+i*1.7);path.lineTo(1.8,-.2+i*1.7);path.lineTo(0,1.2+i*1.7);path.lineTo(-1.8,-.2+i*1.7);path.closePath();
      const mesh=new THREE.Mesh(new THREE.ShapeGeometry(path),mat(0xfff294));mesh.rotation.set(-Math.PI/2,0,Math.PI);mesh.position.y=.08;g.add(mesh);
    }
    scene.add(g);
  }
  return {id,trackLength,sample,curve,animated,pickups,boostPads,colliders,shortcuts,widthAt};
}

export function createKart(color:number,character:string):THREE.Group {
  const kart=new THREE.Group();kart.name=`kart-${character}`;
  const bodyParts=new THREE.Group(),body=mat(color,.33,.16).clone(),paintDark=mat(new THREE.Color(color).multiplyScalar(.56).getHex(),.45,.12).clone();
  body.userData={kartPaint:'base',originalColor:body.color.getHex()};paintDark.userData={kartPaint:'dark',originalColor:paintDark.color.getHex()};
  const rubber=mat(0x181d26,.94),metal=mat(0xbecbd9,.27,.65),seat=mat(0x342d30,.84);
  const heroSphere=new THREE.SphereGeometry(1,24,16);
  const bulb=(material:THREE.Material,p:number[],s:number[])=>shape(bodyParts,heroSphere,material,p,s);
  const pipe=(material:THREE.Material,points:number[][],radius:number)=>shape(bodyParts,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p as [number,number,number]))),18,radius,8,false),material,[0,0,0],[1,1,1]);
  // Low standard-kart frame, a rounded split nose, swept wheel arches and metal
  // bumper tubing leave the driver's overalls and characteristic face visible.
  round(bodyParts,paintDark,[0,.57,0],[2.36,.32,3.52]);
  bulb(body,[0,.78,.47],[1.06,.35,1.37]);
  bulb(body,[0,.80,1.62],[1.13,.30,.65]);
  bulb(white,[0,1.049,1.63],[.27,.028,.47]);
  round(bodyParts,paintDark,[0,.71,-1.15],[2.35,.46,.68]);
  pipe(metal,[[-1.30,.55,1.56],[-1.37,.55,2.04],[0,.55,2.29],[1.37,.55,2.04],[1.30,.55,1.56]],.105);
  pipe(metal,[[-1.23,.57,-1.48],[-1.15,.57,-1.97],[0,.57,-2.07],[1.15,.57,-1.97],[1.23,.57,-1.48]],.09);
  for(const s of [-1,1]) {
    bulb(body,[s*1.15,.86,-1.07],[.36,.25,.75]);
    bulb(body,[s*1.17,.89,1.18],[.32,.18,.61]);
    pipe(metal,[[s*.72,.62,-.75],[s*1.36,.55,-1.20]],.075);
    pipe(metal,[[s*.72,.62,.9],[s*1.38,.55,1.24]],.075);
    const exhaust=cylinder(bodyParts,metal,[s*.87,.72,-1.92],.17,.20,.58,16);exhaust.rotation.x=Math.PI/2;
    const hole=cylinder(bodyParts,rubber,[s*.87,.72,-2.215],.125,.125,.012,16);hole.rotation.x=Math.PI/2;
    round(bodyParts,metal,[s*.81,.99,-1.35],[.29,.28,.32]);
    for(let i=0;i<3;i++)round(bodyParts,dark,[s*.815,1.11-i*.085,-1.39],[.30,.025,.29]);
  }
  round(bodyParts,seat,[0,1.15,-.23],[1.25,.25,1.13]);
  round(bodyParts,seat,[0,1.63,-.80],[1.36,1.05,.27]);
  round(bodyParts,paintDark,[0,1.67,-.98],[1.39,.93,.13]);
  for(const x of [-.41,.41])pipe(body,[[x,1.23,-.99],[x,1.87,-.99],[x,2.01,-.82]],.075);
  pipe(metal,[[0,.98,1.20],[0,1.85,.85]],.065);
  const steering=new THREE.Mesh(new THREE.TorusGeometry(.47,.059,10,28),rubber);steering.position.set(0,2.02,.88);steering.rotation.x=-.40;bodyParts.add(steering);
  for(let i=0;i<3;i++) {
    const a=i*Math.PI*2/3;pipe(metal,[[0,2.02,.88],[Math.cos(a)*.42,2.02+Math.sin(a)*.38,.88-Math.sin(a)*.16]],.024);
  }
  bulb(body,[0,2.02,.905],[.11,.10,.055]);
  bake(bodyParts,kart);
  const {driver,head}=createDriver(character);kart.add(driver);kart.userData.driver=driver;kart.userData.head=head;
  const wheels:THREE.Group[]=[],frontWheels:THREE.Group[]=[];
  for(const x of [-1.36,1.36])for(const z of [-1.23,1.22]) {
    const steeringPivot=new THREE.Group();steeringPivot.position.set(x,.54,z);kart.add(steeringPivot);
    const spin=new THREE.Group();spin.name=z>0?'front-wheel-spin':'rear-wheel-spin';steeringPivot.add(spin);
    const tire=new THREE.Mesh(new THREE.CylinderGeometry(.54,.54,.43,24),rubber);tire.rotation.z=Math.PI/2;tire.castShadow=true;spin.add(tire);
    const wheelParts=new THREE.Group();
    for(const side of [-1,1]) {
      const rim=new THREE.Mesh(new THREE.TorusGeometry(.30,.046,8,18),metal);rim.rotation.y=Math.PI/2;rim.position.x=side*.219;wheelParts.add(rim);
      const hub=new THREE.Mesh(new THREE.CylinderGeometry(.135,.135,.46,14),gold);hub.rotation.z=Math.PI/2;wheelParts.add(hub);
      for(let i=0;i<5;i++) {
        const a=i/5*Math.PI*2;
        const spoke=round(wheelParts,metal,[side*.223,Math.cos(a)*.17,Math.sin(a)*.17],[.036,.26,.06]);spoke.rotation.x=a;
      }
    }
    bake(wheelParts,spin);wheels.push(spin);if(z>0)frontWheels.push(steeringPivot);
  }
  const shadow=new THREE.Mesh(new THREE.CircleGeometry(1,24),new THREE.MeshBasicMaterial({color:0x253f38,transparent:true,opacity:.17,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2;shadow.scale.set(1.73,2.24,1);shadow.position.y=.025;kart.add(shadow);
  kart.userData.wheels=wheels;kart.userData.frontWheels=frontWheels;
  return kart;
}
