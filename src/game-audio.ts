import { FINAL_LAP_RATE, MUSIC, type MusicTrack } from './race-music';

type RaceAudioState = { mode: string; track: MusicTrack; lap: number; speed: number; boost: number };
const SETTINGS_KEY = 'kart-audio-v1';
const SOURCES = {
  mushroom: new URL('./audio/mushroom-race.mp3', import.meta.url).href,
  castle: new URL('./audio/castle-race.mp3', import.meta.url).href,
};

/** One loop source, separate music/effects buses, and a gesture-unlocked master. */
export class AudioEngine {
  ctx: AudioContext | null = null;
  muted = false;
  musicVolume = .55;
  effectsVolume = .7;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private effects: GainNode | null = null;
  private engine: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private sourceGain: GainNode | null = null;
  private buffers = new Map<MusicTrack, AudioBuffer>();
  private pending = new Set<MusicTrack>();
  private failed = new Set<MusicTrack>();
  private track: MusicTrack = 'mushroom';
  private offset = 0;
  private startedAt = 0;
  private rate = 1;
  private duckUntil = 0;
  private state: RaceAudioState = {mode:'ready',track:'mushroom',lap:1,speed:0,boost:0};
  private error: string | null = null;

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
      if (typeof saved?.muted === 'boolean') this.muted = saved.muted;
      if (typeof saved?.music === 'number' && Number.isFinite(saved.music)) this.musicVolume = Math.max(0, Math.min(1, saved.music));
      if (typeof saved?.effects === 'number' && Number.isFinite(saved.effects)) this.effectsVolume = Math.max(0, Math.min(1, saved.effects));
    } catch { /* Storage is optional. */ }
    document.addEventListener('visibilitychange', () => this.update(this.state));
  }

  unlock() {
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain(); this.master.gain.value = 0;
        const limiter = this.ctx.createDynamicsCompressor();
        limiter.threshold.value = -9; limiter.knee.value = 8; limiter.ratio.value = 8;
        limiter.attack.value = .003; limiter.release.value = .15;
        this.master.connect(limiter).connect(this.ctx.destination);
        this.music = this.ctx.createGain(); this.music.connect(this.master);
        this.effects = this.ctx.createGain(); this.effects.connect(this.master);
        this.engine = this.ctx.createOscillator(); this.engine.type = 'sawtooth';
        this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
        const filter = this.ctx.createBiquadFilter(); filter.frequency.value = 320;
        this.engine.connect(filter).connect(this.engineGain).connect(this.effects); this.engine.start();
      }
      void this.ctx.resume().then(() => { this.error = null; this.update(this.state); }).catch(() => { this.error = '请点击声音按钮重试'; });
      // Explicit gestures can retry loading after a recoverable browser failure.
      this.failed.delete(this.state.track);
      this.prepare(this.state.track);
    } catch { this.error = '当前浏览器未能开启音频'; }
  }

  private prepare(track: MusicTrack) {
    if (!this.ctx || this.buffers.has(track) || this.pending.has(track) || this.failed.has(track)) return;
    this.pending.add(track);
    const ctx = this.ctx;
    void fetch(SOURCES[track]).then(response => {
      if (!response.ok) throw new Error('Music asset unavailable');
      return response.arrayBuffer();
    }).then(bytes => ctx.decodeAudioData(bytes)).then(buffer => {
      this.buffers.set(track, buffer);
      this.update(this.state);
    }).catch(() => { this.failed.add(track); this.error = '配乐暂未就绪，可点击声音按钮重试'; })
      .finally(() => this.pending.delete(track));
  }

  private position() {
    return this.offset + (this.source && this.ctx ? (this.ctx.currentTime - this.startedAt) * this.rate : 0);
  }

  private stopLoop() {
    this.offset = this.position();
    if (this.source && this.ctx && this.sourceGain) {
      const source = this.source, gain = this.sourceGain, now = this.ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + .025);
      source.stop(now + .03);
      source.onended = () => { source.disconnect(); gain.disconnect(); };
      this.source = null; this.sourceGain = null;
    }
  }

  reset(track: MusicTrack) {
    this.stopLoop(); this.track = track; this.offset = 0; this.rate = 1;
    this.state = {...this.state, mode:'countdown',track,lap:1,speed:0,boost:0};
    if (this.ctx) this.prepare(track);
    this.update(this.state);
  }

  update(state: RaceAudioState) {
    this.state = {...state};
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.music || !this.effects || !this.engineGain || !this.engine) return;
    const now = ctx.currentTime, audible = !this.muted && !document.hidden && state.mode !== 'paused';
    this.master.gain.setTargetAtTime(audible ? .8 : 0, now, .015);
    this.effects.gain.setTargetAtTime(this.effectsVolume, now, .025);
    this.music.gain.setTargetAtTime(this.musicVolume * (now < this.duckUntil ? .62 : 1), now, .06);
    this.engineGain.gain.setTargetAtTime(state.mode === 'racing' ? .028 : 0, now, .06);
    this.engine.frequency.setTargetAtTime(45 + state.speed * 2.2, now, .08);
    if (state.track !== this.track) { this.stopLoop(); this.offset = 0; this.rate = 1; this.track = state.track; }
    if (state.mode === 'ready' || state.mode === 'finished' || state.mode === 'countdown') {
      this.stopLoop(); this.offset = 0; return;
    }
    if (state.mode !== 'racing' || document.hidden || ctx.state !== 'running') { this.stopLoop(); return; }
    this.prepare(this.track);
    const nextRate = state.lap >= 3 ? FINAL_LAP_RATE : 1;
    if (nextRate !== this.rate) {
      this.offset = this.position(); this.startedAt = now; this.rate = nextRate;
      this.source?.playbackRate.setValueAtTime(this.rate, now);
    }
    const buffer = this.buffers.get(this.track);
    if (!this.source && buffer) {
      this.offset %= buffer.duration;
      this.source = ctx.createBufferSource(); this.source.buffer = buffer; this.source.loop = true;
      this.source.playbackRate.value = this.rate;
      this.sourceGain = ctx.createGain(); this.sourceGain.gain.setValueAtTime(0,now);
      this.sourceGain.gain.linearRampToValueAtTime(1,now+.035);
      this.source.connect(this.sourceGain).connect(this.music);
      this.startedAt = now; this.source.start(now, this.offset);
    }
  }

  tone(freq: number, duration = .12) {
    if (this.muted || !this.ctx || !this.effects || document.hidden) return;
    const ctx = this.ctx, now = ctx.currentTime, osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.frequency.setValueAtTime(freq, now); osc.frequency.exponentialRampToValueAtTime(freq * 1.2, now + duration);
    gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(.095, now + .005);
    gain.gain.exponentialRampToValueAtTime(.001, now + duration);
    gain.gain.linearRampToValueAtTime(0, now + duration + .015);
    osc.connect(gain).connect(this.effects); osc.start(); osc.stop(now + duration + .02);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    this.duckUntil = now + Math.min(.4, duration + .06);
  }

  finish(rank: number) {
    this.update({...this.state,mode:'finished',speed:0});
    if (!this.ctx || !this.effects || this.muted || document.hidden) return;
    const ctx = this.ctx, now = ctx.currentTime, effects = this.effects;
    const melody = rank === 1 ? [72,76,79,84,79,84] : [67,72,76,79,76,72];
    melody.forEach((midi, i) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain(), at = now + i * .13;
      osc.type = 'triangle'; osc.frequency.value = 440 * 2 ** ((midi - 69) / 12);
      gain.gain.setValueAtTime(0,at); gain.gain.linearRampToValueAtTime(.13,at+.008);
      gain.gain.exponentialRampToValueAtTime(.001,at+(i===5?.65:.17));
      osc.connect(gain).connect(effects); osc.start(at); osc.stop(at+.7);
      osc.onended=()=>{osc.disconnect();gain.disconnect();};
    });
  }

  setMix(kind: 'music' | 'effects', value: number) {
    if (!Number.isFinite(value)) return;
    if (kind === 'music') this.musicVolume = Math.max(0, Math.min(1, value));
    else this.effectsVolume = Math.max(0, Math.min(1, value));
    this.save(); this.update(this.state);
  }

  toggleMute() { this.muted = !this.muted; this.save(); this.update(this.state); }
  private save() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({muted:this.muted,music:this.musicVolume,effects:this.effectsVolume})); } catch { /* Keep session controls usable. */ }
  }
  get problem() { return this.error; }
  snapshot() {
    return {muted:this.muted,musicVolume:this.musicVolume,effectsVolume:this.effectsVolume,
      context:this.ctx?.state ?? 'locked',track:this.track,title:MUSIC[this.track].title,
      bpm:Math.round(MUSIC[this.track].bpm * this.rate),finalLap:this.rate > 1,
      sources:this.source ? 1 : 0,position:this.position(),ready:[...this.buffers.keys()],error:this.error};
  }
}
