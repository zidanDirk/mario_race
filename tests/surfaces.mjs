import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CASTLE_SURFACES,DRY_SURFACE,surfaceAt,surfaceLane,beltPhase} from '../src/surfaces.ts';
import {buildSurfaceVisuals} from '../src/surface-visuals.ts';
import {createTrack} from '../src/tracks.ts';
let checks=0;
const track=createTrack('castle'),length=track.trackLength;
const at=(t,lane,time=0,id='castle')=>surfaceAt(id,t,lane,time,length);
assert.equal(at(.20,3.5,0,'mushroom'),DRY_SURFACE);assert.equal(at(.20,-3.5),DRY_SURFACE);assert.equal(at(.34,0),DRY_SURFACE);assert.equal(at(.34,3),DRY_SURFACE);assert.equal(at(.34,-3),DRY_SURFACE);checks++;
assert.deepEqual(at(.20,3.5),{kind:'wet',grip:.5800000000000001,speedScale:.9,beltSpeed:0,warning:false,seconds:0});assert.equal(at(.17,3.5),DRY_SURFACE);assert.equal(at(.24,3.5),DRY_SURFACE);assert.equal(at(.2,.5),DRY_SURFACE);assert.equal(at(.2,6.5),DRY_SURFACE);checks++;
for(const strip of CASTLE_SURFACES) {
 const mid=(strip.from+strip.to)/2,center=at(mid,strip.lane);
 const entry=at(strip.from+1e-7,strip.lane),exit=at(strip.to-1e-7,strip.lane),edge=at(mid,strip.lane-strip.width/2+1e-7);
 for(const state of [entry,exit,edge]){assert(Math.abs(state.grip-1)<1e-6);assert(Math.abs(state.speedScale-1)<1e-6);assert(Math.abs(state.beltSpeed)<1e-6);}
 assert(center.kind===strip.kind);
}checks++;
assert.equal(at(.34,5,0).beltSpeed,9);assert.equal(at(.34,-5,0).beltSpeed,-9);assert.equal(at(.34,5,12).beltSpeed,-9);assert.equal(at(.34,-5,12).beltSpeed,9);assert.equal(at(.34,5,24).beltSpeed,9);checks++;
assert.equal(beltPhase(9.999,5).warning,false);assert.equal(beltPhase(10,5).warning,true);assert.equal(beltPhase(11.999,5).direction,1);assert.equal(beltPhase(12,5).warning,false);assert.equal(beltPhase(12,5).seconds,12);checks++;
const frozen=at(.34,5,11);for(let i=0;i<120;i++)assert.deepEqual(at(.34,5,11),frozen,'same race clock freezes warning and belt direction');checks++;
// Query result is world motion data: it has no throttle, heading, or speed dependency.
for(const kartSpeed of [-10,0,30])assert.equal(kartSpeed+at(.34,5).beltSpeed,kartSpeed+9);checks++;
assert.equal(surfaceLane(.12,0,3,0),null);assert.equal(surfaceLane(.15,0,3,1),-3.5);assert.equal(surfaceLane(.20,0,3,3),3.5);assert.equal(surfaceLane(.2,0,-3,1,true),3.5);assert.equal(surfaceLane(.28,0,0,1),5);assert.equal(surfaceLane(.34,12,0,1),-5);assert.equal(surfaceLane(.29,10,5,1),0);assert.equal(surfaceLane(.34,22,-5,1,true),0);assert.equal(surfaceLane(.4,0,5,1),null);checks++;
for(const value of [NaN,Infinity,-Infinity]){assert.equal(surfaceAt('castle',value,5,0,length),DRY_SURFACE);assert.equal(surfaceAt('castle',.34,value,0,length),DRY_SURFACE);assert.equal(surfaceAt('castle',.34,5,0,value),DRY_SURFACE);assert(Number.isFinite(beltPhase(value,5).speed));}assert.equal(surfaceAt('castle',.34,5,0,0),DRY_SURFACE);checks++;
assert.deepEqual(at(1.2,3.5),at(.2,3.5));assert.deepEqual(at(-.8,3.5),at(.2,3.5));checks++;
const scene=new THREE.Scene(),view=buildSurfaceVisuals(scene,track);let meshes=0,disposedGeometries=0,disposedMaterials=0;
const geometries=new Set(),materials=new Set();
view.root.traverse(o=>{if(o.isMesh){meshes++;geometries.add(o.geometry);materials.add(o.material);const p=o.geometry.getAttribute('position');for(let i=0;i<p.count;i++)for(const value of [p.getX(i),p.getY(i),p.getZ(i)])assert(Number.isFinite(value));}});
assert(meshes<=24,`surface mesh budget: ${meshes}`);assert.equal(scene.children.length,1);
const arrows=view.root.children.filter(o=>o.isInstancedMesh);assert.equal(arrows.length,2);
view.update(10.4);const matrices=arrows.map(o=>Array.from(o.instanceMatrix.array));for(const a of arrows){assert(a.userData.warning);for(const value of a.instanceMatrix.array)assert(Number.isFinite(value));}
view.update(10.4);assert.deepEqual(arrows.map(o=>Array.from(o.instanceMatrix.array)),matrices,'paused clock keeps all animated arrows still');checks++;
view.update(12);assert.equal(arrows[0].userData.direction,1);assert.equal(arrows[1].userData.direction,-1);assert.equal(arrows[1].userData.warning,false);checks++;
for(const g of geometries)g.addEventListener('dispose',()=>disposedGeometries++);for(const m of materials)m.addEventListener('dispose',()=>disposedMaterials++);
view.dispose();assert.equal(scene.children.length,0);assert.equal(disposedGeometries,geometries.size);assert.equal(disposedMaterials,materials.size);checks++;
console.log(JSON.stringify({passed:true,checks,trackLength:length,meshes,geometries:geometries.size,materials:materials.size},null,2));
