/** Local time-trial replay data. World poses never feed back into race physics. */
export type Pose = { x: number; y: number; z: number; heading: number };
export type GhostRun = {
  version: 1;
  rulesVersion: 2;
  character: string;
  durationMs: number;
  splits: number[];
  frames: [number, number, number, number, number][];
};

type Frame = GhostRun['frames'][number];
export const DEFAULT_GHOST_KEY = 'mushroom-time-trial-ghost-v1-course2';
const STEP_MS = 50;
const MIN_DURATION_MS = 30_000;
const MAX_DURATION_MS = 30 * 60_000;
const MAX_FRAMES = MAX_DURATION_MS / STEP_MS + 2;
const MAX_JSON_LENGTH = 6 * 1024 * 1024;
const CHARACTERS = new Set(['mario', 'luigi', 'peach', 'yoshi', 'toad', 'wario']);
const EPSILON = 0.000_001;

function validPose(pose: Pose): boolean {
  return !!pose && [pose.x, pose.y, pose.z].every(n => Number.isFinite(n) && Math.abs(n) <= 10_000)
    && Number.isFinite(pose.heading) && Math.abs(pose.heading) <= 1_000_000;
}
function poseOf(frame: Frame): Pose {
  return { x: frame[1], y: frame[2], z: frame[3], heading: frame[4] };
}
function frameOf(timeMs: number, pose: Pose): Frame {
  return [timeMs, pose.x, pose.y, pose.z, pose.heading];
}
function interpolate(a: Pose, b: Pose, fraction: number): Pose {
  // A recovery is a cut, not a drive through the intervening scenery.
  if (Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) > 15) return { ...(fraction < 1 ? a : b) };
  const delta = Math.atan2(Math.sin(b.heading - a.heading), Math.cos(b.heading - a.heading));
  return {
    x: a.x + (b.x - a.x) * fraction,
    y: a.y + (b.y - a.y) * fraction,
    z: a.z + (b.z - a.z) * fraction,
    heading: a.heading + delta * fraction,
  };
}

function validRun(value: unknown): value is GhostRun {
  if (!value || typeof value !== 'object') return false;
  const run = value as GhostRun;
  if (run.version !== 1 || run.rulesVersion !== 2 || !CHARACTERS.has(run.character)) return false;
  if (!Number.isFinite(run.durationMs) || run.durationMs < MIN_DURATION_MS || run.durationMs > MAX_DURATION_MS) return false;
  if (!Array.isArray(run.splits) || run.splits.length !== 12) return false;
  let previous = 0;
  for (const split of run.splits) {
    if (!Number.isFinite(split) || split <= previous || split > run.durationMs) return false;
    previous = split;
  }
  if (previous !== run.durationMs) return false;
  if (!Array.isArray(run.frames) || run.frames.length < 2 || run.frames.length > MAX_FRAMES) return false;
  previous = -1;
  for (const frame of run.frames) {
    if (!Array.isArray(frame) || frame.length !== 5 || !frame.every(Number.isFinite)) return false;
    if (frame[0] < 0 || frame[0] <= previous || frame[0] > run.durationMs || !validPose(poseOf(frame))) return false;
    if (previous >= 0 && frame[0] - previous > STEP_MS + EPSILON) return false;
    previous = frame[0];
  }
  return run.frames[0][0] === 0 && previous === run.durationMs;
}

export class GhostRecorder {
  private readonly character: string;
  private readonly frames: Frame[] = [];
  private readonly splits: number[] = [];
  private previous: { timeMs: number; pose: Pose } | null = null;
  private nextSampleMs = STEP_MS;
  private invalid = false;
  private closed = false;

  constructor(character: string) {
    this.character = character;
    this.invalid = !CHARACTERS.has(character);
  }

  capture(timeMs: number, pose: Pose): void {
    if (this.closed || this.invalid) return;
    if (!Number.isFinite(timeMs) || timeMs < 0 || timeMs > MAX_DURATION_MS || !validPose(pose)
      || (this.previous && timeMs < this.previous.timeMs)) {
      this.invalid = true;
      return;
    }
    if (!this.previous) {
      this.frames.push(frameOf(0, pose));
      this.previous = { timeMs: 0, pose: { ...pose } };
    }
    const previous = this.previous;
    while (this.nextSampleMs <= timeMs) {
      const fraction = timeMs === previous.timeMs ? 1 : (this.nextSampleMs - previous.timeMs) / (timeMs - previous.timeMs);
      this.frames.push(frameOf(this.nextSampleMs, interpolate(previous.pose, pose, fraction)));
      this.nextSampleMs += STEP_MS;
    }
    this.previous = { timeMs, pose: { ...pose } };
  }

  split(timeMs: number): void {
    if (this.closed || this.invalid) return;
    if (!Number.isFinite(timeMs) || timeMs <= (this.splits.at(-1) ?? 0)
      || timeMs > MAX_DURATION_MS || this.splits.length >= 12) {
      this.invalid = true;
      return;
    }
    this.splits.push(timeMs);
  }

  finish(durationMs: number, pose: Pose): GhostRun | null {
    if (this.closed) return null;
    this.capture(durationMs, pose);
    this.closed = true;
    if (this.invalid || !this.previous || durationMs < MIN_DURATION_MS || this.splits.length !== 12
      || Math.abs(this.splits[11] - durationMs) > 1) return null;
    const last = this.frames.at(-1)!;
    if (last[0] === durationMs) this.frames[this.frames.length - 1] = frameOf(durationMs, pose);
    else this.frames.push(frameOf(durationMs, pose));
    const splits = [...this.splits];
    splits[11] = durationMs;
    const run: GhostRun = {
      version: 1, rulesVersion: 2, character: this.character, durationMs,
      splits, frames: this.frames.map(frame => [...frame] as Frame),
    };
    return validRun(run) ? run : null;
  }
}

/** O(log n) replay lookup; replays stop at the line and never wrap to their start. */
export function sampleGhost(run: GhostRun, timeMs: number): Pose | null {
  if (!Number.isFinite(timeMs) || timeMs < 0 || timeMs > run.durationMs || !run.frames.length) return null;
  let low = 0;
  let high = run.frames.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (run.frames[middle][0] <= timeMs) low = middle;
    else high = middle - 1;
  }
  const a = run.frames[low];
  const b = run.frames[low + 1];
  if (!b || timeMs === a[0]) return poseOf(a);
  return interpolate(poseOf(a), poseOf(b), (timeMs - a[0]) / (b[0] - a[0]));
}

export function loadGhost(storage: Pick<Storage, 'getItem'>, key: string): GhostRun | null {
  try {
    const raw = storage.getItem(key);
    if (!raw || raw.length > MAX_JSON_LENGTH) return null;
    const value: unknown = JSON.parse(raw);
    return validRun(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveGhost(storage: Pick<Storage, 'setItem'>, key: string, run: GhostRun): boolean {
  try {
    if (!validRun(run)) return false;
    const raw = JSON.stringify(run);
    if (raw.length > MAX_JSON_LENGTH) return false;
    storage.setItem(key, raw);
    return true;
  } catch {
    return false;
  }
}
