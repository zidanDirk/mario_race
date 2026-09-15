/** Race-clock rules only. Callers supply cumulative validated course progress. */
export type EliminationDriver = { id: string; name: string };
export type EliminationProgress = { id: string; progress: number };
export type EliminationEvent = { id: string; at: number; place: number };
export type EliminationSnapshot = {
  elapsed: number;
  nextAt: number | null;
  /** Seconds until the next elimination, zero after the player's race ends. */
  remaining: number;
  warning: boolean;
  activeIds: string[];
  /** Active drivers only, ordered by cumulative course progress. */
  order: string[];
  eliminated: EliminationEvent[];
  complete: boolean;
  playerPlace: number | null;
  winnerId: string | null;
};

export class EliminationRace {
  private readonly ids: string[];
  readonly playerId: string;
  private elapsed = 0;
  private order: string[];
  private eliminated: EliminationEvent[] = [];
  private complete = false;
  private playerPlace: number | null = null;
  private winnerId: string | null = null;

  constructor(roster: EliminationDriver[], playerId: string) {
    if (!Array.isArray(roster) || roster.length !== 6
      || Array.from(roster).some(driver => !driver || typeof driver.id !== 'string' || !driver.id.trim()
        || typeof driver.name !== 'string' || !driver.name.trim())
      || new Set(roster.map(driver => driver.id)).size !== 6
      || !roster.some(driver => driver.id === playerId)) {
      throw new Error('Elimination requires six unique named drivers and a roster player.');
    }
    this.ids = roster.map(driver => driver.id);
    this.order = [...this.ids];
    this.playerId = playerId;
  }

  isActive(id: string): boolean { return this.order.includes(id); }

  /**
   * Invalid, repeated, or backwards clock updates are no-ops. Supply either all
   * six drivers or exactly the active drivers. Validate the whole input before
   * changing the clock/order so malformed snapshots cannot trigger eliminations.
   * Normal play calls at a fixed timestep. A jump across several deadlines uses
   * this one supplied order at each deadline; no intermediate positions are made
   * up. Processing stops immediately if the player is eliminated or wins.
   */
  update(time: number, racers: EliminationProgress[]): EliminationEvent[] {
    if (this.complete || !Number.isFinite(time) || time <= this.elapsed
      || !Array.isArray(racers)
      || (racers.length !== this.ids.length && racers.length !== this.order.length)
      || racers.some(racer => !racer || typeof racer.id !== 'string'
        || !this.ids.includes(racer.id) || !Number.isFinite(racer.progress))
      || new Set(racers.map(racer => racer.id)).size !== racers.length
      || this.order.some(id => !racers.some(racer => racer.id === id))) return [];

    const progress = new Map(racers.map(racer => [racer.id, racer.progress]));
    const prior = new Map(this.order.map((id, index) => [id, index]));
    this.order.sort((a, b) => progress.get(b)! - progress.get(a)! || prior.get(a)! - prior.get(b)!);
    const events: EliminationEvent[] = [];
    this.elapsed = time;
    while (!this.complete && time >= 30 + this.eliminated.length * 20) {
      const at = 30 + this.eliminated.length * 20;
      const place = this.order.length;
      const id = this.order.pop()!;
      const event = { id, at, place };
      this.eliminated.push(event);
      events.push({ ...event });
      if (id === this.playerId) {
        this.playerPlace = place;
        this.complete = true;
      }
      if (this.order.length === 1) {
        this.winnerId = this.order[0];
        if (this.winnerId === this.playerId) this.playerPlace = 1;
        this.complete = true;
      }
      if (this.complete) this.elapsed = at;
    }
    return events;
  }

  snapshot(): EliminationSnapshot {
    const nextAt = this.complete ? null : 30 + this.eliminated.length * 20;
    const remaining = nextAt === null ? 0 : Math.max(0, nextAt - this.elapsed);
    return {
      elapsed: this.elapsed, nextAt, remaining,
      warning: !this.complete && remaining <= 5,
      activeIds: this.ids.filter(id => this.isActive(id)),
      order: [...this.order], eliminated: this.eliminated.map(event => ({ ...event })),
      complete: this.complete, playerPlace: this.playerPlace, winnerId: this.winnerId,
    };
  }
}
