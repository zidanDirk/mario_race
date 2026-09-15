import * as THREE from 'three';
import type { Ramp } from './ramps.ts';
import type { Collider } from './collision.ts';
import { rampSurface } from './ramps.ts';
import type { createTrack } from './tracks.ts';

/** The mesh samples the exact same surface as RampMotion. All resources belong to this group. */
export function buildRampVisuals(scene:THREE.Object3D,track:Pick<ReturnType<typeof createTrack>,'sample'|'trackLength'>,ramps:readonly Ramp[]) {
  const root=new THREE.Group();root.name='optional-trick-ramps';scene.add(root);
  const deck=new THREE.MeshStandardMaterial({color:0x10969a,roughness:.7,side:THREE.DoubleSide});
  const cream=new THREE.MeshStandardMaterial({color:0xfff7c2,roughness:.65,side:THREE.DoubleSide});
  const orange=new THREE.MeshStandardMaterial({color:0xffaa22,roughness:.6,side:THREE.DoubleSide});
  const poleMat=new THREE.MeshStandardMaterial({color:0xf8eee0,roughness:.7});
  function ribbon(r:Ramp,left:number,right:number,from:number,to:number,mat:THREE.Material,raise=.018,flat=false) {
    const positions:number[]=[],indices:number[]=[];
    for(let i=0;i<=16;i++) {
      const d=from+(to-from)*i/16;
      for(const lane of [left,right]) {const p=track.sample(r.t+d/track.trackLength,lane).position;positions.push(p.x,p.y+(flat?0:rampSurface(r,d))+raise,p.z);}
      if(i<16){const j=i*2;indices.push(j,j+2,j+1,j+1,j+2,j+3);}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,mat);mesh.receiveShadow=true;root.add(mesh);
  }
  for(const r of ramps) {
    ribbon(r,r.lane-r.width/2,r.lane+r.width/2,0,r.length,deck);
    // Closed wedge sides keep the incline visibly supported instead of floating over the road.
    for(const side of [-1,1]) {
      const positions:number[]=[],indices:number[]=[];
      for(let i=0;i<=16;i++) {
        const d=r.length*i/16,p=track.sample(r.t+d/track.trackLength,r.lane+side*r.width/2).position;
        positions.push(p.x,p.y+.015,p.z,p.x,p.y+rampSurface(r,d)+.018,p.z);
        if(i<16){const j=i*2;indices.push(j,j+1,j+2,j+1,j+3,j+2);}
      }
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();root.add(new THREE.Mesh(g,deck));
    }
    {
      const positions:number[]=[];
      for(const lane of [r.lane-r.width/2,r.lane+r.width/2]) {const p=track.sample(r.t+r.length/track.trackLength,lane).position;positions.push(p.x,p.y+.015,p.z,p.x,p.y+r.height+.018,p.z);}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex([0,1,2,1,3,2]);g.computeVertexNormals();root.add(new THREE.Mesh(g,orange));
    }
    for(const side of [-1,1])ribbon(r,r.lane+side*r.width/2-.10,r.lane+side*r.width/2+.10,0,r.length,cream,.035);
    for(let d=1.2;d<r.length-1;d+=2.7) {
      // Clear forward chevrons follow the incline, with no external textures.
      for(const side of [-1,1]) {
        const vertices:number[]=[];
        for(const [offset,lane] of [[0,r.lane+side*1.2],[.3,r.lane+side*1.2],[1.35,r.lane],[1.05,r.lane]]) {
          const p=track.sample(r.t+(d+offset)/track.trackLength,lane).position;
          vertices.push(p.x,p.y+rampSurface(r,d+offset)+.045,p.z);
        }
        const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex([0,1,2,0,2,3]);geometry.computeVertexNormals();root.add(new THREE.Mesh(geometry,cream));
      }
    }
    ribbon(r,r.lane-r.width/2,r.lane+r.width/2,r.length-.5,r.length,orange,.045);
    // A pair of flags announces the entry without obstructing either driving line.
    for(const side of [-1,1]) {
      const p=track.sample(r.t,r.lane+side*(r.width/2+.4));
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,2.6,6),poleMat);pole.position.copy(p.position);pole.position.y+=1.3;root.add(pole);
      const flag=new THREE.Mesh(new THREE.PlaneGeometry(.8,.48),orange);flag.position.copy(p.position);flag.position.y+=2.35;flag.position.addScaledVector(p.normal,side*.4);flag.rotation.y=Math.atan2(p.tangent.x,p.tangent.z);root.add(flag);
    }
    // Flat dashed landing guides remain driveable and do not fence off the left ground route.
    for(let d=r.length+17;d<r.length+37;d+=5)for(const side of [-1,1])ribbon(r,r.lane+side*3.1-.07,r.lane+side*3.1+.07,d,d+2,cream,.025,true);
  }
  return {root,dispose(){scene.remove(root);root.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});deck.dispose();cream.dispose();orange.dispose();poleMat.dispose();}};
}

/** Low entry is open; side/rear walls stop ground-level karts entering the tall wedge.
 * The driving layer ignores its own active ramp's walls while riding or leaving it.
 */
export function buildRampColliders(track:Pick<ReturnType<typeof createTrack>,'sample'|'trackLength'>,ramps:readonly Ramp[]):(Collider&{rampId:string})[] {
  const colliders:(Collider&{rampId:string})[]=[];
  for(const r of ramps) {
    for(const side of [-1,1]) {
      for(let i=0;i<4;i++) {
        const from=3.5+(r.length-3.5)*i/4,to=3.5+(r.length-3.5)*(i+1)/4;
        const a=track.sample(r.t+from/track.trackLength,r.lane+side*r.width/2).position;
        const b=track.sample(r.t+to/track.trackLength,r.lane+side*r.width/2).position;
        colliders.push({a:{x:a.x,z:a.z},b:{x:b.x,z:b.z},radius:.10,kind:'prop',rampId:r.id});
      }
    }
    const a=track.sample(r.t+r.length/track.trackLength,r.lane-r.width/2).position,b=track.sample(r.t+r.length/track.trackLength,r.lane+r.width/2).position;
    colliders.push({a:{x:a.x,z:a.z},b:{x:b.x,z:b.z},radius:.1,kind:'prop',rampId:r.id});
  }
  return colliders;
}
