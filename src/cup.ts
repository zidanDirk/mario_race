/** Two-round local cup. Race simulation supplies each round's actual snapshot order. */
export type CupDifficulty = 'standard' | 'casual';
export const CUP_TRACKS = ['mushroom', 'castle'] as const;
export type CupTrackId = typeof CUP_TRACKS[number];
export const CUP_POINTS = [15, 12, 10, 8, 6, 4] as const;
export const CUP_TRACK_LABELS: Record<CupTrackId, string> = {
  mushroom: '蘑菇赛道',
  castle: '城堡夜赛',
};
export type CupDriver = { id: string; name: string };
export type CupRound = { trackId: CupTrackId; order: string[] };
export type CupStanding = CupDriver & { points: number; places: number[]; wins: number; rank: number };
export type CupSnapshot = {
  stageIndex: number;
  complete: boolean;
  awaitingNext: boolean;
  playerId: string;
  difficulty: CupDifficulty;
  rounds: CupRound[];
  standings: CupStanding[];
};

function compareStanding(a: CupStanding, b: CupStanding) {
  return b.points - a.points || b.wins - a.wins
    || a.places.reduce((sum, place) => sum + place, 0) - b.places.reduce((sum, place) => sum + place, 0)
    || (a.places.at(-1) ?? 0) - (b.places.at(-1) ?? 0);
}

export class CupSeries {
  private readonly roster: CupDriver[];
  readonly playerId: string;
  readonly difficulty: CupDifficulty;
  private index = 0;
  private rounds: CupRound[] = [];

  constructor(roster: CupDriver[], playerId: string, difficulty: CupDifficulty) {
    if (!Array.isArray(roster) || roster.length !== 6
      || roster.some(driver => !driver || typeof driver.id !== 'string' || !driver.id.trim()
        || typeof driver.name !== 'string' || !driver.name.trim())
      || new Set(roster.map(driver => driver.id)).size !== 6
      || !roster.some(driver => driver.id === playerId)
      || (difficulty !== 'standard' && difficulty !== 'casual')) {
      throw new Error('Cup requires six unique named drivers, a roster player, and a valid difficulty.');
    }
    this.roster = roster.map(driver => ({ ...driver }));
    this.playerId = playerId;
    this.difficulty = difficulty;
  }

  get stageIndex() { return this.index; }
  get complete() { return this.rounds.length === CUP_TRACKS.length; }

  /** Invalid or repeated results do not change the series. No times are invented. */
  finishRound(order: string[]): boolean {
    if (this.rounds.length !== this.index || !Array.isArray(order) || order.length !== this.roster.length
      || new Set(order).size !== this.roster.length
      || order.some(id => !this.roster.some(driver => driver.id === id))) return false;
    this.rounds.push({ trackId: CUP_TRACKS[this.index], order: [...order] });
    return true;
  }

  advance(): boolean {
    if (this.complete || this.rounds.length !== this.index + 1) return false;
    this.index += 1;
    return true;
  }

  /** Retry current round only, rolling back its committed points if needed. */
  retryRound(): boolean {
    this.rounds = this.rounds.slice(0, this.index);
    return true;
  }

  snapshot(): CupSnapshot {
    const standings: CupStanding[] = this.roster.map(driver => {
      const places = this.rounds.map(round => round.order.indexOf(driver.id) + 1);
      return { ...driver, places, points: places.reduce((sum, place) => sum + CUP_POINTS[place - 1], 0),
        wins: places.filter(place => place === 1).length, rank: 1 };
    }).sort(compareStanding);
    for (let index = 1; index < standings.length; index++) {
      standings[index].rank = compareStanding(standings[index - 1], standings[index]) === 0
        ? standings[index - 1].rank : index + 1;
    }
    return {
      stageIndex: this.index, complete: this.complete,
      awaitingNext: !this.complete && this.rounds.length === this.index + 1,
      playerId: this.playerId, difficulty: this.difficulty,
      rounds: this.rounds.map(round => ({ trackId: round.trackId, order: [...round.order] })), standings,
    };
  }
}
