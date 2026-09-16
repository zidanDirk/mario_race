import { ItemInventory, isBoostItem, type Item, type ItemSlot } from './items.ts';
import { BOMB_RADIUS } from './tactical-combat.ts';
export { BOMB_RADIUS, BOMB_FUSE, STAR_DURATION } from './tactical-combat.ts';

export type Difficulty = 'casual' | 'standard';
export type CombatRacer = {
  id: string; t: number; lane: number; speed: number; stun: number; immune: number; finished: boolean; starred?: boolean;
};
export type AiUse = { racerId: string; item: Item; targetId: string | null; rear: boolean };
export type CombatContext = {
  time: number; difficulty: Difficulty; playerId: string; trackLength: number;
  racers: CombatRacer[]; playerProtected: boolean; playerRedThreat: boolean;
  /** IDs of karts with an incoming projectile inside the horn defense radius. */
  hornThreatIds?: string[];
  canFire?: (action: AiUse) => boolean;
};
type Brain = { inventory: ItemInventory; offset: number; lastUse: number; visibleAt: number | null; lastSlot: ItemSlot | null };
export const HORN_RADIUS = 12;
const SETTINGS = {
  standard: { opening: 7, personal: 6, playerGap: 8 },
  casual: { opening: 11, personal: 9, playerGap: 14 },
};
const forwardDistance = (from: number, to: number, length: number) => ((to - from) % 1 + 1) % 1 * length;

/** Pure race-clock decisions. Call only for active Grand Prix simulation steps. */
export class AiCombat {
  private brains = new Map<string, Brain>();
  private lastPlayerAttack = -Infinity;
  readonly stats = { collected: 0, used: 0, playerAttacks: 0 };

  reset(ids: string[]): void {
    this.brains.clear();
    this.lastPlayerAttack = -Infinity;
    this.stats.collected = this.stats.used = this.stats.playerAttacks = 0;
    // Stable across racer array reordering, with distinct launch windows for each AI.
    [...new Set(ids)].sort().forEach((id, i) => this.brains.set(id, this.brain(i * .45)));
  }

  private brain(offset: number): Brain {
    return { inventory: new ItemInventory(), offset, lastUse: -Infinity, visibleAt: null, lastSlot: null };
  }

  inventory(id: string): ItemInventory {
    if (!this.brains.has(id)) this.brains.set(id, this.brain(this.brains.size * .45));
    return this.brains.get(id)!.inventory;
  }

  collect(id: string, rank: number, random: () => number, time: number, gap = 0): boolean {
    if (!Number.isFinite(time) || time < 0) return false;
    if (!this.inventory(id).acquire(rank, random, { time, gap })) return false;
    this.stats.collected++;
    return true;
  }

  plan(dt: number, context: CombatContext): AiUse[] {
    if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(context.time) || context.time < 0 ||
        !Number.isFinite(context.trackLength) || context.trackLength <= 0) return [];
    const { time, trackLength, racers, playerId } = context;
    const settings = SETTINGS[context.difficulty];
    const actions: AiUse[] = [];
    let playerRedThreat = context.playerRedThreat;
    for (const [id, brain] of this.brains) {
      if (id === playerId) continue;
      const racer = racers.find(candidate => candidate.id === id);
      if (!racer || racer.finished) continue;
      brain.inventory.step(dt);
      const item = brain.inventory.item;
      if (!item) { brain.visibleAt = null; continue; }
      if (brain.visibleAt === null) brain.visibleAt = time;
      const continuingTriple = item === 'triple-mushroom' && brain.inventory.slots[0] === brain.lastSlot;
      const personalGap = continuingTriple ? 2 : settings.personal;
      if (racer.stun > 0 || racer.speed < 6 || time < settings.opening + brain.offset ||
          time < brain.lastUse + personalGap + (continuingTriple ? 0 : brain.offset) || time < brain.visibleAt + .25 + brain.offset) continue;
      const other = racers.filter(candidate => candidate.id !== id && !candidate.finished);
      const ahead = other.map(target => ({ target, distance: (target.t - racer.t) * trackLength }))
        .filter(candidate => candidate.distance > .01).sort((a, b) => a.distance - b.distance)[0];
      let target: CombatRacer | null = null;
      let rear = false;
      let splashPlayer = false;
      if (isBoostItem(item)) {
        // A trailing kart can catch up, but a stationary/stunned kart never overwrites its hit state.
        const chasing = other.some(candidate => candidate.t > racer.t &&
          (candidate.t - racer.t) * trackLength >= 8 && (candidate.t - racer.t) * trackLength <= 180);
        if (!chasing) continue;
      } else if (item === 'star') {
        if (racer.starred) continue;
        const chasing = other.some(candidate => candidate.t > racer.t && (candidate.t - racer.t) * trackLength <= 180);
        if (!chasing && !context.hornThreatIds?.includes(id)) continue;
      } else if (item === 'bomb') {
        const behind = other.map(candidate => ({ target: candidate, distance: (racer.t - candidate.t) * trackLength }))
          .filter(candidate => candidate.distance >= 18 && candidate.distance <= 55 && Math.abs(candidate.target.lane - racer.lane) <= 3.5)
          .sort((a, b) => a.distance - b.distance)[0];
        if (ahead && ahead.distance >= 22 && ahead.distance <= 65 && Math.abs(ahead.target.lane - racer.lane) <= 4.5) target = ahead.target;
        else if (behind) { target = behind.target; rear = true; }
        else continue;
        // Reserve the shared player budget for a possible splash victim, even when
        // aiming at another AI. World geometry and detonation protection are checked by the caller.
        const player = other.find(candidate => candidate.id === playerId);
        if (player) {
          const progress = Math.abs(player.t - racer.t) % 1;
          splashPlayer = Math.hypot(Math.min(progress, 1 - progress) * trackLength, player.lane - racer.lane) <= 65 + BOMB_RADIUS;
          if (splashPlayer && (context.playerProtected || player.immune > 0 || player.starred || player.stun > 0 || time < this.lastPlayerAttack + settings.playerGap)) continue;
        }
      } else if (item === 'super-horn') {
        // Route/lane proximity is a conservative broad phase; canFire checks world distance.
        // Include physically adjacent lapped racers, and reserve the player budget for any
        // splash victim, even when the nominal target is another AI or a projectile.
        const near = other.map(candidate => {
          const progress = Math.abs(candidate.t - racer.t) % 1;
          return { target: candidate, distance: Math.hypot(Math.min(progress, 1 - progress) * trackLength, candidate.lane - racer.lane) };
        }).filter(candidate => candidate.distance <= HORN_RADIUS).sort((a, b) => a.distance - b.distance);
        const nearbyPlayer = near.find(candidate => candidate.target.id === playerId)?.target;
        if (nearbyPlayer && (context.playerProtected || nearbyPlayer.immune > 0 || nearbyPlayer.starred || nearbyPlayer.stun > 0 || time < this.lastPlayerAttack + settings.playerGap)) continue;
        target = nearbyPlayer ?? near.find(candidate => candidate.target.immune <= 0 && !candidate.target.starred && candidate.target.stun <= 0)?.target ?? null;
        if (!target && !context.hornThreatIds?.includes(id)) continue;
      } else if (item === 'red-shell') {
        if (!ahead || ahead.distance < 28 || ahead.distance > 95) continue;
        target = ahead.target;
      } else if (item === 'green-shell') {
        if (!ahead || ahead.distance < 18 || ahead.distance > 50 || Math.abs(ahead.target.lane - racer.lane) > 1.8) continue;
        target = ahead.target;
      } else {
        const behind = other.map(candidate => ({ target: candidate, distance: (racer.t - candidate.t) * trackLength }))
          .filter(candidate => candidate.distance > .01).sort((a, b) => a.distance - b.distance)[0];
        if (!behind || behind.distance < 18 || behind.distance > 65 || Math.abs(behind.target.lane - racer.lane) > 2.8) continue;
        target = behind.target;
        rear = true;
      }
      if (target && (target.immune > 0 || target.starred || target.stun > 0)) continue;
      if (target?.id === playerId && (context.playerProtected || time < this.lastPlayerAttack + settings.playerGap ||
          (item === 'red-shell' && playerRedThreat))) continue;
      const action: AiUse = { racerId: id, item, targetId: target?.id ?? null, rear };
      if (context.canFire && !context.canFire(action)) continue;
      const usedSlot = brain.inventory.slots[0];
      if (brain.inventory.consume() !== item) continue;
      brain.lastSlot = usedSlot;
      brain.lastUse = time;
      if (brain.inventory.slots[0] !== usedSlot) brain.visibleAt = null;
      this.stats.used++;
      if (target?.id === playerId || splashPlayer) {
        this.lastPlayerAttack = time;
        this.stats.playerAttacks++;
        if (item === 'red-shell') playerRedThreat = true;
      }
      actions.push(action);
    }
    return actions;
  }
}

/** Steer toward the closest available box ahead, including across the start line. */
export function boxLane(racer: CombatRacer, boxes: { t: number; lane: number; available: boolean }[], trackLength: number): number | null {
  if (racer.finished || !Number.isFinite(trackLength) || trackLength <= 0) return null;
  const candidates = boxes.filter(box => box.available && Number.isFinite(box.t) && Number.isFinite(box.lane))
    .map(box => ({ box, distance: forwardDistance(racer.t, box.t, trackLength) }))
    .filter(candidate => candidate.distance >= 8 - 1e-8 && candidate.distance <= 60 + 1e-8)
    .sort((a, b) => a.distance - b.distance || Math.abs(a.box.lane - racer.lane) - Math.abs(b.box.lane - racer.lane));
  return candidates[0]?.box.lane ?? null;
}
