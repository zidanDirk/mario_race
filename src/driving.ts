import * as THREE from 'three';
import {LEGACY_HANDLING,type Handling} from './loadouts.ts';
import { moveCircle } from './collision.ts';
import { projectShortcut, type Shortcut } from './routes.ts';
import type { Collider, Contact } from './collision.ts';

export type DriveInput = { throttle: boolean; brake: boolean; steer: number; hop: boolean };
export type TrackSample = { position: THREE.Vector3; tangent: THREE.Vector3; normal: THREE.Vector3 };
export type Track = { widthAt?: (t:number)=>number; shortcuts?: readonly Shortcut[]; colliders?: readonly Collider[]; trackLength: number; sample: (t: number, lane?: number) => TrackSample };
export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
export const DRIFT_THRESHOLDS = [.95, 2.05, 3.35] as const;
export const DRIVE_TUNING = { topSpeed: 47, reverseSpeed: 10, offRoadSpeed: 19, boostSpeed: 65, maxRoadLane: 8.8, checkpointWidth: 24, recoveryDistance: 60, recoveryDelay: 3 };

/** World-space arcade handling. The road is queried for surfaces and checkpoints,
 * never used to steer or move the kart. Nose heading and travel direction are separate. */
export class KartDriving {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  heading = 0;
  travelHeading = 0;
  speed = 0;
  steer = 0;
  routeT = 0;
  lane = 0;
  roadDistance = 0;
  shortcutId: string | null = null;
  nextGate = 0;
  lapLimit: number | null = 3;
  handling: Readonly<Handling> = LEGACY_HANDLING;
  rampPassId: string|null = null;
  hopHeight = 0;
  hopVelocity = 0;
  driftDirection = 0;
  charge = 0;
  boost = 0;
  stun = 0;
  offRoad = false;
  wrongWay = false;
  recoveryTimer = 0;
  recoveryFlash = 0;
  releasedTurbo = 0;
  recovered = false;
  contact: Contact | null = null;
  impactFlash = 0;
  private bumpVelocity = new THREE.Vector3();
  private contactCooldown = 0;
  private hopWasHeld = false;
  private lastSafeT = -.028;
  
  private track: Track;
  private points: THREE.Vector3[];
  private count = 1024;

  constructor(track: Track) {
    this.track = track;
    this.points = Array.from({ length: this.count + 1 }, (_, i) => track.sample(i / this.count).position);
  }

  get lap() { return Math.min(this.lapLimit ?? Infinity, 1 + Math.max(0, Math.floor((this.nextGate - 1) / 8))); }
  get checkpointMissed() { return this.routeT > this.nextGate / 8 + .02; }
  get recoverySeconds() { return this.recoveryTimer > 0 ? Math.max(1, Math.ceil(DRIVE_TUNING.recoveryDelay - this.recoveryTimer)) : 0; }
  get finished() { return this.lapLimit !== null && this.nextGate > this.lapLimit * 8; }
  get progress() { return Math.min(this.routeT, this.nextGate / 8); }
  get driftStage() { return DRIFT_THRESHOLDS.filter(t => this.charge >= t).length; }
  get drifting() { return this.driftDirection !== 0 && this.hopHeight <= 0 && this.speed > 12; }

  reset(t = -.028, lane = -3, speed = 0, gate?: number) {
    const point = this.track.sample(t, lane);
    this.position.copy(point.position);
    this.heading = this.travelHeading = Math.atan2(point.tangent.x, point.tangent.z);
    this.speed = speed; this.steer = 0; this.routeT = t; this.lane = lane;
    this.nextGate = gate ?? Math.max(0, Math.floor(t * 8) + 1);
    this.velocity.copy(point.tangent).multiplyScalar(speed);
    this.rampPassId=null;this.hopHeight = this.hopVelocity = 0; this.driftDirection = this.charge = this.boost = this.stun = 0;
    this.hopWasHeld = false; this.offRoad = this.wrongWay = false;
    this.recoveryTimer = this.recoveryFlash = this.roadDistance = 0;
    this.releasedTurbo = 0; this.recovered = false; this.lastSafeT = t;
    this.shortcutId=null;this.contact=null;this.impactFlash=0;this.contactCooldown=0;this.bumpVelocity.set(0,0,0);
  }

  project() {
    let best = Infinity, bestT = 0, px = 0, pz = 0, tx = 0, tz = 1;
    for (let i = 0; i < this.count; i++) {
      const a = this.points[i], b = this.points[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const u = THREE.MathUtils.clamp(((this.position.x - a.x) * dx + (this.position.z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
      const x = a.x + dx * u, z = a.z + dz * u;
      const d = (this.position.x - x) ** 2 + (this.position.z - z) ** 2;
      if (d < best) { best = d; bestT = (i + u) / this.count; px = x; pz = z; tx = dx; tz = dz; }
    }
    const len = Math.hypot(tx, tz); tx /= len; tz /= len;
    const mainDistance = Math.sqrt(best);
    let onPaved = mainDistance <= (this.track.widthAt ? Math.min(DRIVE_TUNING.maxRoadLane,this.track.widthAt(bestT)) : DRIVE_TUNING.maxRoadLane);
    let projectedLane = (this.position.x - px) * tz - (this.position.z - pz) * tx;
    this.shortcutId = null;
    for (const route of this.track.shortcuts ?? []) {
      const projected = projectShortcut(route, this.position);
      if (projected.distance <= route.width / 2) onPaved = true;
      if (projected.distance < Math.sqrt(best)) {
        best = projected.distance ** 2; bestT = projected.t;
        tx = projected.tx; tz = projected.tz; projectedLane = projected.lane;
        this.shortcutId = projected.distance <= route.width / 2 ? route.id : null;
      }
    }
    const previous = this.routeT;
    this.routeT = previous + ((bestT - previous) % 1 + 1.5) % 1 - .5;
    this.lane = projectedLane;
    this.roadDistance = Math.sqrt(best); this.offRoad = !onPaved;
    this.wrongWay = Math.abs(this.speed) > 5 && this.velocity.x * tx + this.velocity.z * tz < -3;
    // Both authored branches map continuously to the same ordered eighth-lap gates.
    const gateT = this.nextGate / 8;
    if (previous <= gateT && this.routeT >= gateT && this.routeT - previous < .02 && this.roadDistance < DRIVE_TUNING.checkpointWidth && !this.wrongWay) this.nextGate++;
    if (!this.offRoad && this.routeT >= (this.nextGate - 1) / 8 && this.routeT < this.nextGate / 8) this.lastSafeT = this.routeT;
  }

  recover() {
    const gate = this.nextGate;
    const t = Math.min(this.lastSafeT, gate / 8 - .005);
    this.reset(t, 0, 0, gate);
    this.stun = .6; this.recoveryFlash = 1.2; this.recovered = true;
  }

  interruptDrift() { this.driftDirection = 0; this.charge = 0; this.hopWasHeld = true; }

  step(input: DriveInput, coins: number, dt: number) {
    this.releasedTurbo = 0; this.recovered = false; this.contact=null;
    this.contactCooldown=Math.max(0,this.contactCooldown-dt);this.impactFlash=Math.max(0,this.impactFlash-dt);
    this.bumpVelocity.multiplyScalar(Math.exp(-7*dt));
    this.boost = Math.max(0, this.boost - dt); this.stun = Math.max(0, this.stun - dt);
    this.recoveryFlash = Math.max(0, this.recoveryFlash - dt);
    this.steer = THREE.MathUtils.damp(this.steer, THREE.MathUtils.clamp(input.steer, -1, 1), 10, dt);
    const hopPressed = input.hop && !this.hopWasHeld;
    if (hopPressed && this.hopHeight <= 0 && this.stun <= 0 && this.speed > 8) {
      this.hopVelocity = 4.5; this.hopHeight = .001;
      this.driftDirection = Math.abs(input.steer) > .12 && input.throttle ? Math.sign(input.steer) : 0;
      this.charge = 0;
    }
    if (this.hopHeight > 0 && !this.driftDirection && input.hop && input.throttle && Math.abs(input.steer) > .15) this.driftDirection = Math.sign(input.steer);
    if (!input.hop || !input.throttle || this.speed < 12 || this.stun > 0) {
      if (this.driftDirection && !input.hop && this.hopWasHeld && !this.offRoad && this.stun <= 0) {
        this.releasedTurbo = this.driftStage;
        if (this.releasedTurbo) this.boost = Math.max(this.boost, [0, .85, 1.55, 2.3][this.releasedTurbo]);
      }
      this.driftDirection = 0; this.charge = 0;
    }
    this.hopWasHeld = input.hop;
    if (this.hopHeight > 0) {
      this.hopVelocity -= 26 * dt; this.hopHeight = Math.max(0, this.hopHeight + this.hopVelocity * dt);
      if (this.hopHeight === 0) this.hopVelocity = 0;
    }
    const drifting = this.drifting;
    if (drifting && !this.offRoad) this.charge = Math.min(3.8, this.charge + dt * this.handling.chargeRate * (.6 + .6 * Math.max(0, input.steer * this.driftDirection)));
    else if (this.offRoad) this.charge = Math.max(0, this.charge - dt * 1.7);

    const top = this.stun > 0 ? 0 : this.boost > 0 ? DRIVE_TUNING.boostSpeed : this.offRoad ? DRIVE_TUNING.offRoadSpeed : this.handling.topSpeed + coins * .4;
    let target = input.throttle ? top : 0;
    // Holding brake reaches reverse only after braking to a standstill. Accel+brake enables a tight spin turn.
    if (input.brake) target = input.throttle ? 0 : -DRIVE_TUNING.reverseSpeed;
    if (this.boost > 0 && !input.brake && this.stun <= 0) target = top;
    if (this.stun > 0) target = 0;
    const rate = input.brake ? 3.0 : this.offRoad && this.boost <= 0 ? 2.6 : input.throttle ? this.handling.acceleration : .9;
    this.speed = THREE.MathUtils.damp(this.speed, target, rate, dt);
    if (!input.throttle && !input.brake && Math.abs(this.speed) < .15) this.speed = 0;
    const speedFactor = THREE.MathUtils.clamp(Math.abs(this.speed) / 28, 0, 1);
    let yaw = -this.steer * 2.2 * speedFactor * (this.speed < 0 ? -1 : 1);
    if (this.driftDirection && input.hop) yaw = -this.driftDirection * (1.15 + 1.35 * this.steer * this.driftDirection) * speedFactor * (this.hopHeight > 0 ? .65 : 1);
    if (input.throttle && input.brake && Math.abs(this.speed) < 5) yaw = -this.steer * 2;
    if (this.stun > 0) yaw *= .2;
    this.heading = wrapAngle(this.heading + yaw * this.handling.steering * dt);
    // Countersteering changes the drift radius without changing the latched drift side.
    const slip = drifting ? this.handling.slip * this.driftDirection * (.25 + .1 * Math.max(0, this.steer * this.driftDirection)) : 0;
    const desiredTravel = this.heading + slip;
    this.travelHeading = wrapAngle(this.travelHeading + wrapAngle(desiredTravel - this.travelHeading) * (1 - Math.exp(-(drifting ? this.handling.driftGrip : this.handling.grip) * dt)));
    this.velocity.set(Math.sin(this.travelHeading) * this.speed, 0, Math.cos(this.travelHeading) * this.speed);
    this.velocity.add(this.bumpVelocity);
    const moved=moveCircle(this.position,this.velocity,dt,1.6,(this.track.colliders??[]).filter(c=>!c.rampId||c.rampId!==this.rampPassId));
    this.position.x=moved.position.x;this.position.z=moved.position.z;this.position.y=.14;
    const hit=moved.contacts.sort((a,b)=>b.impact-a.impact)[0];
    if(hit){
      const ratio=Math.min(1,hit.impact/Math.max(1,Math.abs(this.speed)));
      this.speed*=Math.max(.12,1-ratio*.88);
      if(hit.impact>5&&this.contactCooldown<=0){
        this.contact=hit;this.contactCooldown=.25;this.impactFlash=.24;
        this.bumpVelocity.set(hit.normal.x*hit.impact*.22,0,hit.normal.z*hit.impact*.22);
        if(hit.impact>12){this.boost=0;this.interruptDrift();}
      }
      const inward=this.velocity.x*hit.normal.x+this.velocity.z*hit.normal.z;
      if(inward<0){this.velocity.x-=inward*hit.normal.x;this.velocity.z-=inward*hit.normal.z;}
    }
    const previousDistance = this.roadDistance;
    this.project();
    // A missed scoring gate is not a reason to move the car. Only sustained,
    // genuine out-of-bounds travel can trigger an announced rescue.
    const returning = this.roadDistance < previousDistance - dt;
    if (this.roadDistance <= DRIVE_TUNING.recoveryDistance - 5 || returning) this.recoveryTimer = 0;
    else if (this.roadDistance > DRIVE_TUNING.recoveryDistance) this.recoveryTimer += dt;
    if (this.recoveryTimer >= DRIVE_TUNING.recoveryDelay) this.recover();
  }
}
