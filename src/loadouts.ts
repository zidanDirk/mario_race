export type LoadoutId = 'light' | 'speed' | 'drift';
export type Handling = {topSpeed:number;acceleration:number;grip:number;driftGrip:number;steering:number;chargeRate:number;slip:number};
export const LEGACY_HANDLING:Readonly<Handling> = Object.freeze({topSpeed:47,acceleration:1.65,grip:14,driftGrip:7,steering:1,chargeRate:1,slip:1});
export const LOADOUTS:Readonly<Record<LoadoutId,{name:string;tagline:string;tradeoff:string;handling:Readonly<Handling>}>> = Object.freeze({
  light:{name:'轻巧型',tagline:'快速起步，碰撞后更快恢复速度',tradeoff:'极速较低，适合频繁争位',handling:Object.freeze({topSpeed:45,acceleration:2.1,grip:14,driftGrip:7,steering:1,chargeRate:1,slip:1})},
  speed:{name:'极速型',tagline:'长直道更快，拉开冲刺距离',tradeoff:'起步较慢，入弯需提前松油门',handling:Object.freeze({topSpeed:51,acceleration:1.3,grip:12,driftGrip:6,steering:.96,chargeRate:.95,slip:1.08})},
  drift:{name:'漂移型',tagline:'过弯稳定，漂移蓄力更快',tradeoff:'极速适中，依靠出弯涡轮争先',handling:Object.freeze({topSpeed:46,acceleration:1.65,grip:18,driftGrip:9,steering:1.04,chargeRate:1.2,slip:.8})},
});
export function isLoadout(value:unknown):value is LoadoutId{return value==='light'||value==='speed'||value==='drift';}
export function loadLoadout(){try{const value=localStorage.getItem('kart-loadout-v1');return isLoadout(value)?value:'light';}catch{return 'light' as const;}}
export function saveLoadout(id:LoadoutId){try{localStorage.setItem('kart-loadout-v1',id);return true;}catch{return false;}}
