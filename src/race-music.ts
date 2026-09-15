/** Original 32-bar kart-racing arrangements. No downloaded music or runtime service. */
export type MusicTrack = 'mushroom' | 'castle';
export const MUSIC = {
  mushroom: { title: '晴空冲刺', bpm: 144 },
  castle: { title: '月下疾驰', bpm: 152 },
};
export const FINAL_LAP_RATE = 2 ** (2 / 12); // A whole-tone lift, with 12.2% more pace.
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

// Each phrase answers the previous one; the bridge changes melody and voicing.
const sunny = [
  [76,0,79,81,79,76,74,72], [74,76,0,79,76,74,72,0],
  [77,0,81,84,83,81,79,77], [79,77,74,71,74,0,79,0],
  [76,79,83,0,81,79,76,74], [73,76,81,83,81,0,79,76],
  [77,81,84,81,79,77,76,74], [71,74,79,0,77,74,71,0],
  [81,0,84,86,84,81,79,77], [78,81,84,0,83,81,78,74],
  [79,83,86,88,86,83,81,79], [77,0,74,71,74,77,79,0],
  [76,0,79,84,83,79,76,74], [77,81,84,0,83,81,77,74],
  [79,77,76,74,71,74,77,79], [84,0,79,76,74,71,72,0],
];
const night = [
  [76,79,83,0,86,83,79,76], [74,0,78,81,84,81,78,74],
  [79,83,86,0,88,86,83,79], [78,81,84,83,81,78,75,0],
  [76,0,79,83,86,83,81,79], [81,84,88,86,84,81,79,0],
  [78,81,84,0,83,81,78,75], [83,81,78,75,78,0,83,0],
  [79,83,86,88,86,0,83,79], [81,0,84,88,86,84,81,79],
  [83,86,90,0,88,86,83,81], [78,81,84,86,84,81,78,75],
  [76,79,83,86,88,86,83,79], [81,84,88,0,86,84,81,78],
  [83,0,81,78,75,78,81,83], [88,0,83,79,78,75,76,0],
];
const sunnyChords = [[48,52,55,59],[45,49,52,55],[50,53,57,60],[43,47,50,53],
  [52,55,59,62],[45,49,52,55],[50,53,57,60],[43,47,50,53],
  [53,57,60,64],[50,54,57,60],[55,59,62,66],[43,47,50,53],
  [48,52,55,59],[50,53,57,60],[43,47,50,53],[48,52,55,57]];
const nightChords = [[40,43,47,50],[38,42,45,48],[43,47,50,54],[47,51,54,57],
  [40,43,47,50],[45,48,52,55],[47,51,54,57],[47,51,54,57],
  [43,47,50,54],[45,48,52,55],[47,50,54,57],[47,51,54,57],
  [40,43,47,50],[45,48,52,55],[47,51,54,57],[40,43,47,50]];

export async function renderRaceMusic(track: MusicTrack): Promise<AudioBuffer> {
  const sampleRate = 32000, beat = 60 / MUSIC[track].bpm;
  const length = Math.round(32 * 4 * beat * sampleRate), tail = Math.round(sampleRate * .8);
  const ctx = new OfflineAudioContext(2, length + tail, sampleRate);
  const dry = ctx.createGain(), room = ctx.createDelay(.4), wet = ctx.createGain();
  dry.gain.value = .72; room.delayTime.value = .105; wet.gain.value = .16;
  dry.connect(ctx.destination); dry.connect(room).connect(wet).connect(ctx.destination);
  const brass = ctx.createPeriodicWave(new Float32Array(9), new Float32Array([0,1,.5,.28,.14,.08,.035,.02,.01]));
  const noise = ctx.createBuffer(1, sampleRate, sampleRate);
  let seed = 127;
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; data[i] = seed / 2147483648 - 1; }

  function note(midi: number, time: number, duration: number, voice: 'brass' | 'bass' | 'keys', volume: number, pan = 0) {
    const osc = ctx.createOscillator(), env = ctx.createGain(), stereo = ctx.createStereoPanner();
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass';
    osc.frequency.value = hz(midi);
    if (voice === 'brass') {
      osc.setPeriodicWave(brass);
      filter.frequency.setValueAtTime(1100, time);
      filter.frequency.exponentialRampToValueAtTime(4200, time + .025);
      filter.frequency.exponentialRampToValueAtTime(1600, time + duration);
      osc.detune.setValueAtTime(-9, time); osc.detune.linearRampToValueAtTime(0, time + .025);
    } else {
      osc.type = voice === 'bass' ? 'sawtooth' : 'triangle';
      filter.frequency.setValueAtTime(voice === 'bass' ? 850 : 5500, time);
      filter.frequency.exponentialRampToValueAtTime(voice === 'bass' ? 230 : 1000, time + duration);
    }
    const attack = voice === 'brass' ? .018 : .005;
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(volume, time + attack);
    env.gain.exponentialRampToValueAtTime(Math.max(.001, volume * (voice === 'brass' ? .65 : .22)), time + duration * .75);
    env.gain.linearRampToValueAtTime(0, time + duration + .025);
    stereo.pan.value = pan; osc.connect(filter).connect(env).connect(stereo).connect(dry);
    osc.start(time); osc.stop(time + duration + .03);
    if (voice === 'keys') {
      const overtone = ctx.createOscillator(), gain = ctx.createGain();
      overtone.frequency.value = hz(midi) * 4;
      gain.gain.setValueAtTime(volume * .25, time);
      gain.gain.exponentialRampToValueAtTime(.0001, time + .065);
      overtone.connect(gain).connect(stereo); overtone.start(time); overtone.stop(time + .07);
    }
  }
  function drum(kind: 'kick' | 'snare' | 'hat' | 'open' | 'tom', time: number, volume: number) {
    const gain = ctx.createGain(), stereo = ctx.createStereoPanner();
    const duration = kind === 'open' ? .17 : kind === 'snare' ? .14 : kind === 'hat' ? .045 : .20;
    stereo.pan.value = kind === 'hat' || kind === 'open' ? .4 : kind === 'tom' ? -.35 : -.05;
    gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(volume, time + .002);
    gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
    gain.connect(stereo).connect(dry);
    if (kind === 'kick' || kind === 'tom') {
      const osc = ctx.createOscillator(); osc.frequency.setValueAtTime(kind === 'kick' ? 145 : 230, time);
      osc.frequency.exponentialRampToValueAtTime(kind === 'kick' ? 48 : 95, time + .1);
      osc.connect(gain); osc.start(time); osc.stop(time + duration);
    } else {
      const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter();
      source.buffer = noise; filter.type = kind === 'snare' ? 'bandpass' : 'highpass';
      filter.frequency.value = kind === 'snare' ? 1700 : 6800; filter.Q.value = .65;
      source.connect(filter).connect(gain); source.start(time, (time * .37) % .7); source.stop(time + duration);
      if (kind === 'snare') {
        const body = ctx.createOscillator(); body.frequency.value = 185;
        const level = ctx.createGain(); level.gain.value = .22;
        body.connect(level).connect(gain); body.start(time); body.stop(time + .07);
      }
    }
  }
  for (let bar = 0; bar < 32; bar++) {
    const phrase = bar % 16, chord = (track === 'castle' ? nightChords : sunnyChords)[phrase];
    const melody = (track === 'castle' ? night : sunny)[phrase];
    const bridge = bar >= 16 && bar < 24;
    const at = (beats: number) => (bar * 4 + beats) * beat;
    melody.forEach((midi, i) => {
      if (!midi) return;
      const pos = i * .5 + (i % 2 ? .035 : 0);
      const held = i < 7 && melody[i + 1] === 0;
      note(midi, at(pos), beat * (held ? .78 : .38), bridge ? 'keys' : 'brass', bridge ? .15 : .12, -.17);
      if (bar >= 24 && i % 2 === 0) note(midi - 12, at(pos), beat * .35, 'brass', .045, .25);
    });
    [0, .75, 1.5, 2, 2.75, 3.5].forEach((pos, i) => {
      const bass = [chord[0],chord[0]+12,chord[2],chord[0],chord[2],chord[0]+12][i];
      note(bass, at(pos), beat * .31, 'bass', .17, 0);
    });
    [.5, 1.5, 2.25, 3.5].forEach(pos => chord.slice(1).forEach(midi => {
      note(midi + 12, at(pos), beat * .22, 'keys', .042, .45);
    }));
    if (bridge || track === 'castle') [0,1,2,3].forEach((pos, i) => note(chord[(i % 3) + 1] + 24, at(pos + .25), beat * .17, 'keys', .04, -.55));
    [0, 1.5, 2, 2.75].forEach(pos => drum('kick', at(pos), pos % 1 ? .19 : .31));
    [1,3].forEach(pos => drum('snare', at(pos), .30));
    for (let i = 0; i < 8; i++) drum(i === 7 ? 'open' : 'hat', at(i * .5), i % 2 ? .095 : .13);
    if (bar % 4 === 3) [3,3.25,3.5,3.75].forEach((pos, i) => drum(i < 2 ? 'snare' : 'tom', at(pos), .15 + i * .025));
  }
  const rendered = await ctx.startRendering();
  const loop = new AudioBuffer({numberOfChannels: 2, length, sampleRate});
  let peak = 0;
  for (let c = 0; c < 2; c++) {
    const from = rendered.getChannelData(c), to = loop.getChannelData(c);
    to.set(from.subarray(0, length));
    // Fold release/reverb tails into the beginning for a continuous loop boundary.
    for (let i = 0; i < tail; i++) to[i] += from[length + i];
    for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(to[i]));
  }
  for (let c = 0; c < 2; c++) {
    const data = loop.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] *= .78 / Math.max(.001, peak);
  }
  return loop;
}
