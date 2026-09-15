import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {Shortcut} from './routes.ts';
import type {CourseHazard} from './course.ts';
import type {Collider} from './collision.ts';

/** Visuals use the same route samples, hazard positions and race clock as driving. */
export function buildCourseVisuals(scene:THREE.Scene,routes:Shortcut[],hazards:CourseHazard[],colliders:Collider[]) {
  const staticRoot=new THREE.Group(),movingRoot=new THREE.Group();
  staticRoot.name='shortcut-scenery';movingRoot.name='course-hazards';scene.add(movingRoot);
  const materials=new Map<number,THREE.MeshStandardMaterial>();
  const material=(color:number)=>{let m=materials.get(color);if(!m){m=new THREE.MeshStandardMaterial({color,roughness:.78});materials.set(color,m);}return m;};
  const boxGeometry=new THREE.BoxGeometry(1,1,1);
  const cylinderGeometry=new THREE.CylinderGeometry(1,1,1,20);
  const dark=material(0x243e4b),cream=material(0xfff7d9),amber=material(0xffc23a);
  function mesh(parent:THREE.Object3D,geometry:THREE.BufferGeometry,mat:THREE.Material,p:number[],scale:number[]) {
    const object=new THREE.Mesh(geometry,mat);object.position.set(p[0],p[1],p[2]);object.scale.set(scale[0],scale[1],scale[2]);object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;
  }
  function cube(parent:THREE.Object3D,mat:THREE.Material,p:number[],scale:number[]) {return mesh(parent,boxGeometry,mat,p,scale);}
  function placed(route:Shortcut,u:number,lane=0,parent:THREE.Object3D=staticRoot) {
    const s=route.sample(u,lane),g=new THREE.Group();g.position.copy(s.position);g.rotation.y=Math.atan2(s.tangent.x,s.tangent.z);parent.add(g);return g;
  }
  function ribbon(route:Shortcut,left:number,right:number,height:number,mat:THREE.Material) {
    const positions:number[]=[],uvs:number[]=[],indices:number[]=[];
    for(let i=0;i<=128;i++) {
      for(const lane of [left,right]){const p=route.sample(i/128,lane).position;positions.push(p.x,p.y+height,p.z);uvs.push(lane===left?0:1,i/8);}
      if(i<128){const j=i*2;indices.push(j,j+2,j+1,j+1,j+2,j+3);}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
    const road=new THREE.Mesh(geometry,mat);road.receiveShadow=true;staticRoot.add(road);
  }
  function label(title:string,subtitle:string,bg:string,width=1024,height=256) {
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const c=canvas.getContext('2d')!;c.fillStyle=bg;c.fillRect(0,0,width,height);c.strokeStyle='#fff4cd';c.lineWidth=10;c.strokeRect(10,10,width-20,height-20);
    c.fillStyle='#fff9e8';c.textAlign='center';c.textBaseline='middle';c.font=`900 ${subtitle?86:100}px system-ui, sans-serif`;c.fillText(title,width/2,subtitle?height*.37:height*.5,width*.94);
    if(subtitle){c.font='600 43px system-ui, sans-serif';c.fillStyle='#ffe7a4';c.fillText(subtitle,width/2,height*.78,width*.92);}
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
    return new THREE.MeshStandardMaterial({map:texture,roughness:.8});
  }
  function postCollider(g:THREE.Group,lane:number,radius:number){const x=g.position.x+Math.cos(g.rotation.y)*lane,z=g.position.z-Math.sin(g.rotation.y)*lane;colliders.push({a:{x,z},b:{x,z},radius,kind:'prop'});}
  function board(g:THREE.Group,title:string,subtitle:string,bg:string,w:number,h:number,y:number) {
    cube(g,dark,[0,y,0],[w+.22,h+.22,.34]);
    const mat=label(title,subtitle,bg);
    for(const side of [-1,1]){const face=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);face.position.set(0,y,side*.181);face.rotation.y=side===-1?Math.PI:0;g.add(face);}
  }
  const arrowShape=new THREE.Shape();arrowShape.moveTo(-1.3,-1);arrowShape.lineTo(0,.35);arrowShape.lineTo(1.3,-1);arrowShape.lineTo(1.3,-.25);arrowShape.lineTo(0,1.1);arrowShape.lineTo(-1.3,-.25);arrowShape.closePath();
  const arrowGeometry=new THREE.ShapeGeometry(arrowShape);arrowGeometry.rotateX(-Math.PI/2);arrowGeometry.rotateY(Math.PI);
  function chevron(g:THREE.Group,mat:THREE.Material,x:number,z:number,scale=1) {const a=mesh(g,arrowGeometry,mat,[x,.075,z],[scale,1,scale]);a.castShadow=false;}

  for(const route of routes) {
    const color=material(route.color),half=route.width/2;
    ribbon(route,-half-.8,half+.8,.015,material(0xd9ce9e));
    ribbon(route,-half,half,.04,material(route.id==='garden'?0x597b78:0x697078));
    for(const side of [-1,1]) {
      const edge=side*half;
      ribbon(route,edge-.32,edge+.32,.055,color);
      ribbon(route,edge-.07,edge+.07,.06,cream);
    }
    // Close repetition makes the fork legible well before its first obstacle.
    for(const u of [.07,.12,.20,.30,.40,.68,.76,.94])chevron(placed(route,u),cream,0,0,.75);
    const entry=placed(route,.17),postX=half+1.75;
    for(const side of [-1,1]) {
      postCollider(entry,side*postX,.3);
      cube(entry,color,[side*postX,4.25,0],[.55,8.5,.55]);
      cube(entry,cream,[side*postX,1.05,0],[.7,.35,.7]);
      mesh(entry,new THREE.SphereGeometry(.46,10,8),amber,[side*postX,8.7,0],[1,1,1]);
    }
    board(entry,route.name,'主路 稳妥  /  捷径 冒险',route.id==='garden'?'#116756':'#775012',postX*2,2.65,7.1);
    for(const u of [.25,.33,.67,.74])for(const side of [-1,1]) {
      const p=placed(route,u,side*(half+1.8));
      postCollider(p,0,.17);
      cube(p,color,[0,.65,0],[.3,1.3,.3]);cube(p,cream,[0,1.06,0],[.36,.28,.36]);
    }
    const reward=placed(route,.86);
    cube(reward,dark,[0,.045,0],[Math.min(route.width-1,7),.04,4.9]).castShadow=false;
    cube(reward,color,[0,.07,0],[Math.min(route.width-1.4,6.6),.025,4.55]).castShadow=false;
    for(const x of [-2,0,2])for(const z of [-1.2,.8])chevron(reward,amber,x,z,.64);
    const exit=placed(route,.91,half+2);
    postCollider(exit,0,.14);
    cube(exit,dark,[0,1.8,0],[.2,3.6,.2]);board(exit,'汇入主路','注意来车','#225d69',3.9,1.4,3.6);
  }

  type Animated={hazard:CourseHazard;body:THREE.Group;light:THREE.MeshStandardMaterial;puffs?:THREE.InstancedMesh};
  const animated:Animated[]=[];
  const steamMaterial=new THREE.MeshBasicMaterial({color:0xe6fff4,transparent:true,opacity:.52,depthWrite:false});
  const stripeCanvas=document.createElement('canvas');stripeCanvas.width=256;stripeCanvas.height=128;
  const ctx=stripeCanvas.getContext('2d')!;ctx.fillStyle='#ffc238';ctx.fillRect(0,0,256,128);ctx.fillStyle='#243e4b';
  for(let i=-2;i<7;i++){ctx.beginPath();ctx.moveTo(i*64,0);ctx.lineTo(i*64+30,0);ctx.lineTo(i*64+96,128);ctx.lineTo(i*64+66,128);ctx.fill();}
  const stripeTexture=new THREE.CanvasTexture(stripeCanvas);stripeTexture.colorSpace=THREE.SRGBColorSpace;
  const stripeMaterial=new THREE.MeshStandardMaterial({map:stripeTexture,roughness:.65});
  for(const hazard of hazards) {
    const route=hazard.route,half=route.width/2;
    const warning=placed(route,Math.max(.17,hazard.u-.10),-half-2.2);
    postCollider(warning,0,.14);
    cube(warning,dark,[0,1.8,0],[.22,3.6,.22]);
    board(warning,hazard.kind==='vent'?'间歇蒸汽':'移动路障',hazard.kind==='vent'?'绿灯通行 · 红灯绕行':'观察空隙 · 减速避让','#73511b',5,1.8,3.4);
    const body=new THREE.Group();body.position.copy(hazard.position);body.rotation.y=Math.atan2(route.sample(hazard.u).tangent.x,route.sample(hazard.u).tangent.z);movingRoot.add(body);
    const light=new THREE.MeshStandardMaterial({color:0x2befa2,emissive:0x2befa2,emissiveIntensity:.65,roughness:.4});
    if(hazard.kind==='vent') {
      const base=placed(route,hazard.u,2.4);
      mesh(base,cylinderGeometry,dark,[0,.09,0],[hazard.radius,.16,hazard.radius]);
      mesh(base,cylinderGeometry,material(0x9aa5a2),[0,.185,0],[hazard.radius-.2,.045,hazard.radius-.2]);
      for(let z=-1.4;z<=1.4;z+=.4){const w=2*Math.sqrt(Math.max(0,1.65**2-z*z));cube(base,dark,[0,.22,z],[w,.045,.16]).castShadow=false;}
      const ring=new THREE.Mesh(new THREE.TorusGeometry(hazard.radius-.08,.095,6,40),light);ring.rotation.x=-Math.PI/2;ring.position.y=.25;body.add(ring);
      for(const x of [-1,1])mesh(body,new THREE.SphereGeometry(.16,8,6),light,[x*1.83,.36,0],[1,1,1]);
      const puffs=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),steamMaterial,15);puffs.frustumCulled=false;puffs.visible=false;body.add(puffs);
      // A signed, unblocked passing line remains on the opposite half of the road.
      for(const u of [hazard.u-.045,hazard.u+.035])chevron(placed(route,u,-2.4),material(0xa9ffdb),0,0,.8);
      animated.push({hazard,body,light,puffs});
    } else {
      const rail=placed(route,hazard.u);
      cube(rail,dark,[0,.065,0],[8.2,.055,.45]).castShadow=false;
      for(const x of [-3.9,3.9])cube(rail,amber,[x,.075,0],[.2,.065,1.1]).castShadow=false;
      mesh(body,cylinderGeometry,dark,[0,.25,0],[hazard.radius,.38,hazard.radius]);
      mesh(body,cylinderGeometry,stripeMaterial,[0,1.12,0],[hazard.radius*.93,1.45,hazard.radius*.93]);
      mesh(body,cylinderGeometry,cream,[0,1.88,0],[hazard.radius,.14,hazard.radius]);
      mesh(body,new THREE.SphereGeometry(.35,12,8),light,[0,2.22,0],[1,1,1]);
      animated.push({hazard,body,light});
    }
  }
  // Material batching keeps the extra roads, posts, markings and grates inexpensive.
  staticRoot.updateMatrixWorld(true);
  const batches=new Map<THREE.Material,THREE.BufferGeometry[]>();
  staticRoot.traverse(o=>{
    if(!(o instanceof THREE.Mesh)||Array.isArray(o.material))return;
    const geometry=o.geometry.clone().applyMatrix4(o.matrixWorld),flat=geometry.index?geometry.toNonIndexed():geometry;
    if(flat!==geometry)geometry.dispose();
    for(const name of Object.keys(flat.attributes))if(!['position','normal','uv'].includes(name))flat.deleteAttribute(name);
    if(!flat.getAttribute('uv'))flat.setAttribute('uv',new THREE.Float32BufferAttribute(new Array(flat.getAttribute('position').count*2).fill(0),2));
    const bucket=batches.get(o.material)??[];bucket.push(flat);batches.set(o.material,bucket);
  });
  for(const [mat,parts] of batches){const geometry=mergeGeometries(parts,false);if(geometry){const combined=new THREE.Mesh(geometry,mat);combined.receiveShadow=true;combined.castShadow=true;combined.name='shortcut-static';scene.add(combined);}parts.forEach(p=>p.dispose());}
  const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3(),rotation=new THREE.Quaternion();
  function update(time:number) {
    for(const {hazard,body,light,puffs} of animated) {
      body.position.copy(hazard.position);
      const color=hazard.kind==='barrier'?0xff9d22:hazard.phase==='safe'?0x2befa2:hazard.phase==='warning'?0xffbc28:0xff4847;
      light.color.setHex(color);light.emissive.setHex(color);light.emissiveIntensity=hazard.phase==='warning'? .45+.65*(.5+.5*Math.sin(time*13)):.7;
      if(puffs){puffs.visible=hazard.phase==='active';if(!puffs.visible)continue;
        for(let i=0;i<puffs.count;i++) {
          const rise=((time*.58+i/puffs.count)%1+1)%1,angle=i*2.399+time*.22;
          position.set(Math.cos(angle)*(.4+rise*.7),.4+rise*5.6,Math.sin(angle)*(.4+rise*.7));
          scale.setScalar((.36+rise*.64)*(1-rise*.35));matrix.compose(position,rotation,scale);puffs.setMatrixAt(i,matrix);
        }
        puffs.instanceMatrix.needsUpdate=true;
      }
    }
  }
  update(0);
  return {update};
}
