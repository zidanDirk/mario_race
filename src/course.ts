import * as THREE from 'three';
import type {Collider, Point2} from './collision.ts';
import {segmentDistance} from './collision.ts';
import type {Shortcut} from './routes.ts';
export type HazardPhase='safe'|'warning'|'active';
export type CourseHazard={id:string;kind:'vent'|'barrier';route:Shortcut;u:number;radius:number;position:THREE.Vector3;previous:THREE.Vector3;phase:HazardPhase;seconds:number;collider:Collider|null};
export const VENT_CYCLE=8;
export function ventPhase(time:number):{phase:HazardPhase;seconds:number}{const t=((time%VENT_CYCLE)+VENT_CYCLE)%VENT_CYCLE;return t<3?{phase:'safe',seconds:3-t}:t<5?{phase:'warning',seconds:5-t}:{phase:'active',seconds:8-t};}
export function createCourseHazards(routes:Shortcut[]):CourseHazard[]{
 return routes.map((route,i)=>{const position=route.sample(i?.56:.51,i?0:2.4).position;return {id:route.id+'-hazard',kind:i?'barrier':'vent',route,u:i?.56:.51,radius:i?1.35:2,position,previous:position.clone(),phase:'safe',seconds:0,collider:i?{a:{x:position.x,z:position.z},b:{x:position.x,z:position.z},radius:1.35,kind:'prop'}:null};});
}
export function updateCourseHazards(hazards:CourseHazard[],time:number){for(const h of hazards){h.previous.copy(h.position);if(h.kind==='vent'){Object.assign(h,ventPhase(time));}else{const s=h.route.sample(h.u,Math.sin(time*.9)*2.75);h.position.copy(s.position);h.phase='active';h.seconds=0;h.collider!.a.x=h.collider!.b.x=h.position.x;h.collider!.a.z=h.collider!.b.z=h.position.z;}}}
/** Relative sweep also detects a moving barrier hitting a stopped kart. */
export function courseContact(h:CourseHazard,before:Point2,after:Point2){if(h.phase!=='active')return false;return segmentDistance({x:0,z:0},{x:before.x-h.previous.x,z:before.z-h.previous.z},{x:after.x-h.position.x,z:after.z-h.position.z})<=h.radius+1.65;}
