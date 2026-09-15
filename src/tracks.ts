import * as THREE from 'three';

export type TrackId = 'mushroom' | 'castle';
export interface TrackConfig {
  id: TrackId; name: string; title: string;
  points: readonly (readonly [number, number])[];
  coinTs: readonly number[]; itemTs: readonly number[];
  boostPads: readonly { t: number; lane: number }[];
  bridge: { from: number; to: number; halfWidth: number } | null;
  roadHalfWidth: number;
}
export const TRACKS: Record<TrackId, TrackConfig> = {
  mushroom: {
    id: 'mushroom', name: '蘑菇赛道', title: 'MUSHROOM CUP',
    points: [[-90,0],[-80,80],[-20,130],[65,105],[105,40],[65,-15],[110,-75],[60,-130],[-30,-130],[-95,-70]],
    coinTs: [.045,.075,.16,.21,.3,.38,.46,.56,.64,.73,.81,.9], itemTs: [.11,.34,.6,.85],
    boostPads: [{t:.19,lane:4.2},{t:.43,lane:-3.8},{t:.69,lane:3.8},{t:.95,lane:-4}],
    bridge: null, roadHalfWidth: 9,
  },
  castle: {
    id: 'castle', name: '城堡夜赛', title: 'CASTLE NIGHT',
    points: [[-135,0],[-135,85],[-80,145],[15,155],[85,110],[125,40],[100,-30],[130,-100],[75,-155],[-20,-160],[-105,-115],[-135,-60]],
    coinTs: [.04,.09,.17,.25,.32,.39,.47,.55,.62,.7,.8,.9], itemTs: [.12,.34,.63,.86],
    boostPads: [{t:.055,lane:3.8},{t:.26,lane:-3.8},{t:.72,lane:3.8},{t:.94,lane:-3.8}],
    bridge: {from:.435,to:.555,halfWidth:6}, roadHalfWidth: 9,
  },
};

/** Arc-length sampling is shared by visuals, driving, pickups and AI. */
export function createTrack(id: TrackId = 'mushroom') {
  const config = TRACKS[id];
  const curve = new THREE.CatmullRomCurve3(config.points.map(([x,z])=>new THREE.Vector3(x,.14,z)),true,'catmullrom',.6);
  curve.arcLengthDivisions = 2400;
  const trackLength = curve.getLength();
  function sample(t: number, lateral = 0) {
    t = ((t%1)+1)%1;
    const position=curve.getPointAt(t), tangent=curve.getTangentAt(t).normalize();
    const normal=new THREE.Vector3(tangent.z,0,-tangent.x).normalize();
    position.addScaledVector(normal,lateral);
    return {position,tangent,normal};
  }
  function widthAt(t: number) {
    t=((t%1)+1)%1;
    const bridge=config.bridge;
    if(!bridge || t<bridge.from || t>bridge.to)return config.roadHalfWidth;
    // Fifteen-metre transitions make the narrowing visible before the bridge.
    const blend=Math.min(1,(t-bridge.from)*trackLength/15,(bridge.to-t)*trackLength/15);
    const smooth=blend*blend*(3-2*blend);
    return THREE.MathUtils.lerp(config.roadHalfWidth,bridge.halfWidth,smooth);
  }
  return {id,config,curve,trackLength,sample,widthAt};
}

/** These exact points drive both the night parapet meshes and their collision capsules. */
export function castleBoundarySegments(track = createTrack('castle')) {
  const bridge=track.config.bridge!;
  const edge=(t:number)=>{
    const blend=Math.max(0,Math.min(1,(t-bridge.from)*track.trackLength/10,(bridge.to-t)*track.trackLength/10));
    return track.widthAt(t)+2-1.55*blend;
  };
  return Array.from({length:660},(_,index)=>{
    const i=Math.floor(index/2),side=index%2?1:-1,t=i/330,u=(i+1)/330;
    return {a:track.sample(t,side*edge(t)).position,b:track.sample(u,side*edge(u)).position,radius:.3 as number,kind:'rail' as const,bridge:t>=bridge.from&&t<=bridge.to,post:i%3===0};
  });
}
