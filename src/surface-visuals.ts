import * as THREE from 'three';
import type {createTrack} from './tracks.ts';
import {CASTLE_SURFACES,beltPhase,type SurfaceStrip} from './surfaces.ts';
type TrackLike=Pick<ReturnType<typeof createTrack>,'sample'|'trackLength'>;
/** Shared authored regions drive physics and ribbons; decorations never add collision walls. */
export function buildSurfaceVisuals(scene:THREE.Object3D,track:TrackLike) {
  const root=new THREE.Group();root.name='castle-tactical-surfaces';scene.add(root);
  const materials:THREE.Material[]=[];
  const standard=(parameters:THREE.MeshStandardMaterialParameters)=>{const m=new THREE.MeshStandardMaterial({...parameters,side:THREE.DoubleSide});materials.push(m);return m;};
  const wet=standard({color:0x2b9dab,roughness:.13,metalness:.33});
  const foam=standard({color:0xaffafa,roughness:.4,emissive:0x215b65,emissiveIntensity:.3});
  const dark=standard({color:0x263d4d,roughness:.75,metalness:.5});
  const metal=standard({color:0x6e8693,roughness:.46,metalness:.6});
  const amber=standard({color:0xffca54,roughness:.55,emissive:0x785322,emissiveIntensity:.4});
  function geometry(positions:number[],indices:number[]) {
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
  }
  function addRibbon(strip:SurfaceStrip,left:number,right:number,from:number,to:number,mat:THREE.Material,y=.028,steps=32) {
    const positions:number[]=[],indices:number[]=[];
    for(let i=0;i<=steps;i++) {
      const t=from+(to-from)*i/steps;
      for(const lane of [left,right]) {const p=track.sample(t,lane).position;positions.push(p.x,p.y+y,p.z);}
      if(i<steps){const j=i*2;indices.push(j,j+2,j+1,j+1,j+2,j+3);}
    }
    const mesh=new THREE.Mesh(geometry(positions,indices),mat);mesh.name=strip.id;mesh.receiveShadow=true;root.add(mesh);return mesh;
  }
  // An upward point in local +Z denotes race-forward on the ground.
  const arrowGeometry=geometry([-1,0,-.35,-.4,0,-.35,-.4,0,-1.3,.4,0,-1.3,.4,0,-.35,1,0,-.35,0,0,1.2],[0,1,6,1,4,6,1,2,3,1,3,4,4,5,6]);
  const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3(1,1,1),up=new THREE.Vector3(0,1,0);
  const animated:{strip:SurfaceStrip;arrows:THREE.InstancedMesh;material:THREE.MeshStandardMaterial;signArrow:THREE.Mesh;signFrame:THREE.Group}[]=[];
  for(const strip of CASTLE_SURFACES) {
    const left=strip.lane-strip.width/2,right=strip.lane+strip.width/2;
    if(strip.kind==='wet') {
      addRibbon(strip,left,right,strip.from,strip.to,wet);
      // Broken pale edges distinguish a slippery puddle from a solid blue barrier.
      const positions:number[]=[],indices:number[]=[];
      for(let d=2;d<(strip.to-strip.from)*track.trackLength-2;d+=5)for(const lane of [left+.12,right-.12]) {
        const base=positions.length/3;
        for(const [offset,side] of [[0,-.1],[0,.1],[2.5,-.1],[2.5,.1]]) {const p=track.sample(strip.from+(d+offset)/track.trackLength,lane+side).position;positions.push(p.x,p.y+.042,p.z);}
        indices.push(base,base+2,base+1,base+1,base+2,base+3);
      }
      // Soft narrow glints break up the broad wet sheet without noisy transparent layers.
      for(let i=0;i<9;i++) {
        const t=strip.from+(strip.to-strip.from)*(i+1)/10,lane=strip.lane+Math.sin(i*2.7)*1.8,base=positions.length/3;
        for(const [dt,dl] of [[-.001,-.5],[-.001,.5],[.001,-.25],[.001,.75]]) {const p=track.sample(t+dt,lane+dl).position;positions.push(p.x,p.y+.045,p.z);}
        indices.push(base,base+2,base+1,base+1,base+2,base+3);
      }
      root.add(new THREE.Mesh(geometry(positions,indices),foam));
      // A water-drop silhouette above the entry announces the wet inner route.
      const frame=new THREE.Group(),sample=track.sample(strip.from-.01,10.7);
      frame.position.copy(sample.position);frame.rotation.y=Math.atan2(sample.tangent.x,sample.tangent.z);root.add(frame);
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,3,6),metal);pole.position.y=1.5;frame.add(pole);
      const plate=new THREE.Mesh(new THREE.BoxGeometry(2.3,2.5,.16),dark);plate.position.y=3;frame.add(plate);
      const drop=new THREE.Shape();drop.moveTo(0,1);drop.bezierCurveTo(-.1,.6,-.8,.05,-.7,-.4);drop.bezierCurveTo(-.6,-1,.6,-1,.7,-.4);drop.bezierCurveTo(.8,.05,.1,.6,0,1);
      const icon=new THREE.Mesh(new THREE.ShapeGeometry(drop),foam);icon.position.set(0,3,-.1);frame.add(icon);
      continue;
    }
    addRibbon(strip,left,right,strip.from,strip.to,dark);
    // Merge dozens of conveyor slats into one mesh per strip.
    const positions:number[]=[],indices:number[]=[],length=(strip.to-strip.from)*track.trackLength;
    for(let d=.4;d<length-.4;d+=1.9) {
      const base=positions.length/3;
      for(const [offset,lane] of [[0,left+.15],[0,right-.15],[.28,left+.15],[.28,right-.15]]) {const p=track.sample(strip.from+(d+offset)/track.trackLength,lane).position;positions.push(p.x,p.y+.044,p.z);}
      indices.push(base,base+2,base+1,base+1,base+2,base+3);
    }
    root.add(new THREE.Mesh(geometry(positions,indices),metal));
    for(const lane of [left+.08,right-.08])addRibbon(strip,lane-.065,lane+.065,strip.from,strip.to,amber,.047);
    const signal=standard({color:0x65f0ab,emissive:0x65f0ab,emissiveIntensity:.35,roughness:.5});
    const arrows=new THREE.InstancedMesh(arrowGeometry,signal,Math.max(2,Math.floor(length/9)));arrows.name=strip.id+'-arrows';arrows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);root.add(arrows);
    // Roadside signs sit beyond the road/guardrail, facing approaching drivers.
    const signFrame=new THREE.Group(),sample=track.sample(strip.from-.013,Math.sign(strip.lane)*10.8);
    signFrame.position.copy(sample.position);signFrame.rotation.y=Math.atan2(sample.tangent.x,sample.tangent.z);root.add(signFrame);
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.10,.10,3.2,6),metal);pole.position.y=1.6;signFrame.add(pole);
    const plate=new THREE.Mesh(new THREE.BoxGeometry(2.6,3.5,.2),dark);plate.position.y=3.5;signFrame.add(plate);
    const signArrow=new THREE.Mesh(arrowGeometry,signal);signArrow.position.set(0,3.5,-.13);signArrow.rotation.x=-Math.PI/2;signFrame.add(signArrow);
    animated.push({strip,arrows,material:signal,signArrow,signFrame});
  }
  function update(time:number) {
    const clock=Number.isFinite(time)?Math.max(0,time):0;
    for(const entry of animated) {
      const {strip,arrows,material,signArrow}=entry,phase=beltPhase(clock,strip.lane);
      const color=phase.warning?0xffbf45:phase.direction>0?0x65f0ab:0xff826b;
      material.color.setHex(color);material.emissive.setHex(color);material.emissiveIntensity=phase.warning?.45:.25;
      // Sign flips vertically; the arrows' pointed ends communicate direction without color.
      signArrow.rotation.x=phase.direction>0?-Math.PI/2:Math.PI/2;
      const length=(strip.to-strip.from)*track.trackLength,usable=length-5,spacing=usable/arrows.count;
      const travel=phase.direction*(clock%12)*3;
      for(let i=0;i<arrows.count;i++) {
        const distance=2.5+((i*spacing+travel)%usable+usable)%usable;
        const sample=track.sample(strip.from+distance/track.trackLength,strip.lane);
        position.copy(sample.position);position.y+=.070;
        rotation.setFromAxisAngle(up,Math.atan2(sample.tangent.x,sample.tangent.z)+(phase.direction<0?Math.PI:0));
        matrix.compose(position,rotation,scale);arrows.setMatrixAt(i,matrix);
      }
      arrows.instanceMatrix.needsUpdate=true;arrows.computeBoundingSphere();
      arrows.userData.direction=phase.direction;arrows.userData.warning=phase.warning;
    }
  }
  update(0);
  return {root,update,dispose(){scene.remove(root);const geometries=new Set<THREE.BufferGeometry>();root.traverse(o=>{if(o instanceof THREE.Mesh)geometries.add(o.geometry);});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();}};
}
