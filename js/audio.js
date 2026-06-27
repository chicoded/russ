/**
 * Procedural audio — action music loop + game SFX (Web Audio API, no external files).
 */

const STORAGE_MUSIC = 'rr_audio_music';
const STORAGE_SFX = 'rr_audio_sfx';

let ctx = null;
let masterGain = null;
let musicGain = null;
let sfxGain = null;
let musicEnabled = true;
let sfxEnabled = true;
let musicTimer = null;
let musicStep = 0;
let musicRunning = false;

function readBool(key, fallback) {
  const v = localStorage.getItem(key);
  if (v === null) return fallback;
  return v === '1' || v === 'true';
}

function savePrefs() {
  localStorage.setItem(STORAGE_MUSIC, musicEnabled ? '1' : '0');
  localStorage.setItem(STORAGE_SFX, sfxEnabled ? '1' : '0');
}

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.85;
    masterGain.connect(ctx.destination);

    musicGain = ctx.createGain();
    musicGain.gain.value = musicEnabled ? 0.22 : 0;
    musicGain.connect(masterGain);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = sfxEnabled ? 0.9 : 0;
    sfxGain.connect(masterGain);
  }
  return ctx;
}

export async function ensureAudioContext() {
  const c = getCtx();
  if (!c) return false;
  if (c.state === 'suspended') {
    try {
      await c.resume();
    } catch {
      return false;
    }
  }
  return c.state === 'running';
}

function sfxOut() {
  return sfxEnabled && sfxGain ? sfxGain : null;
}

function playTone({
  freq = 440,
  type = 'sine',
  duration = 0.08,
  volume = 0.25,
  attack = 0.005,
  decay = 0.06,
  detune = 0,
  out = sfxGain,
} = {}) {
  const c = getCtx();
  const bus = out || sfxOut();
  if (!c || !bus || !sfxEnabled) return;

  const t = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (detune) osc.detune.setValueAtTime(detune, t);

  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(Math.max(volume, 0.0001), t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);

  osc.connect(gain);
  gain.connect(bus);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

function playNoise({ duration = 0.15, volume = 0.2, filterFreq = 800, type = 'bandpass' } = {}) {
  const c = getCtx();
  const bus = sfxOut();
  if (!c || !bus || !sfxEnabled) return;

  const t = c.currentTime;
  const bufferSize = Math.floor(c.sampleRate * duration);
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }

  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = filterFreq;
  const gain = c.createGain();
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(bus);
  src.start(t);
  src.stop(t + duration + 0.02);
}

export function playHammerCock() {
  playTone({ freq: 180, type: 'triangle', duration: 0.06, volume: 0.18, decay: 0.04 });
  setTimeout(() => playTone({ freq: 320, type: 'square', duration: 0.04, volume: 0.08, decay: 0.03 }), 30);
}

export function playEmptyClick() {
  playTone({ freq: 920, type: 'square', duration: 0.05, volume: 0.12, decay: 0.035 });
  playTone({ freq: 480, type: 'triangle', duration: 0.07, volume: 0.1, decay: 0.05 });
  playNoise({ duration: 0.04, volume: 0.06, filterFreq: 2200, type: 'highpass' });
}

export function playGunshot() {
  playNoise({ duration: 0.35, volume: 0.55, filterFreq: 400, type: 'lowpass' });
  playNoise({ duration: 0.12, volume: 0.35, filterFreq: 1200, type: 'bandpass' });
  playTone({ freq: 95, type: 'sawtooth', duration: 0.25, volume: 0.35, attack: 0.001, decay: 0.22 });
  playTone({ freq: 55, type: 'sine', duration: 0.4, volume: 0.25, attack: 0.001, decay: 0.35 });
}

export function playCylinderSpin() {
  const c = getCtx();
  const bus = sfxOut();
  if (!c || !bus || !sfxEnabled) return;

  const t = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(120, t);
  osc.frequency.exponentialRampToValueAtTime(680, t + 0.55);
  osc.frequency.exponentialRampToValueAtTime(90, t + 1.05);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.07, t + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
  osc.connect(gain);
  gain.connect(bus);
  osc.start(t);
  osc.stop(t + 1.15);

  playNoise({ duration: 0.9, volume: 0.04, filterFreq: 900, type: 'bandpass' });
}

export function playCinemaTension() {
  playTone({ freq: 110, type: 'sine', duration: 1.2, volume: 0.08, attack: 0.3, decay: 0.85 });
  playTone({ freq: 116, type: 'sine', duration: 1.2, volume: 0.06, attack: 0.3, decay: 0.85, detune: 8 });
}

export function playCinemaAim() {
  playTone({ freq: 220, type: 'triangle', duration: 0.15, volume: 0.07, attack: 0.02, decay: 0.12 });
}

export function playShotResult(survived) {
  if (survived) playEmptyClick();
  else playGunshot();
}

export function playWin() {
  [523, 659, 784, 1047].forEach((f, i) => {
    setTimeout(() => playTone({ freq: f, type: 'triangle', duration: 0.35, volume: 0.2, attack: 0.01, decay: 0.3 }), i * 90);
  });
}

export function playLose() {
  [220, 185, 147, 98].forEach((f, i) => {
    setTimeout(() => playTone({ freq: f, type: 'sawtooth', duration: 0.4, volume: 0.15, attack: 0.01, decay: 0.35 }), i * 120);
  });
}

export function playCashOut() {
  playTone({ freq: 880, type: 'sine', duration: 0.12, volume: 0.18, decay: 0.1 });
  setTimeout(() => playTone({ freq: 1175, type: 'triangle', duration: 0.2, volume: 0.16, decay: 0.16 }), 80);
}

export function playUiClick() {
  playTone({ freq: 640, type: 'sine', duration: 0.04, volume: 0.08, decay: 0.03 });
}

const MUSIC_PATTERN = [
  { bass: 55, lead: 220, dur: 0.22 },
  { bass: 55, lead: 262, dur: 0.22 },
  { bass: 49, lead: 196, dur: 0.22 },
  { bass: 49, lead: 233, dur: 0.22 },
  { bass: 44, lead: 175, dur: 0.22 },
  { bass: 44, lead: 208, dur: 0.22 },
  { bass: 55, lead: 330, dur: 0.22 },
  { bass: 55, lead: 294, dur: 0.22 },
];

function playMusicStep() {
  const c = getCtx();
  if (!c || !musicGain || !musicEnabled || !musicRunning) return;

  const step = MUSIC_PATTERN[musicStep % MUSIC_PATTERN.length];
  musicStep += 1;
  const t = c.currentTime;

  const bass = c.createOscillator();
  const bassGain = c.createGain();
  bass.type = 'sawtooth';
  bass.frequency.value = step.bass;
  bassGain.gain.setValueAtTime(0.0001, t);
  bassGain.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
  bassGain.gain.exponentialRampToValueAtTime(0.0001, t + step.dur);
  bass.connect(bassGain);
  bassGain.connect(musicGain);
  bass.start(t);
  bass.stop(t + step.dur + 0.02);

  const lead = c.createOscillator();
  const leadGain = c.createGain();
  lead.type = 'triangle';
  lead.frequency.value = step.lead;
  leadGain.gain.setValueAtTime(0.0001, t);
  leadGain.gain.exponentialRampToValueAtTime(0.06, t + 0.015);
  leadGain.gain.exponentialRampToValueAtTime(0.0001, t + step.dur * 0.85);
  lead.connect(leadGain);
  leadGain.connect(musicGain);
  lead.start(t);
  lead.stop(t + step.dur + 0.02);

  if (musicStep % 4 === 0) {
    const pad = c.createOscillator();
    const padGain = c.createGain();
    pad.type = 'sine';
    pad.frequency.value = step.bass * 2;
    padGain.gain.setValueAtTime(0.0001, t);
    padGain.gain.exponentialRampToValueAtTime(0.035, t + 0.08);
    padGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    pad.connect(padGain);
    padGain.connect(musicGain);
    pad.start(t);
    pad.stop(t + 0.5);
  }
}

export function startGameMusic() {
  if (!musicEnabled) return;
  void ensureAudioContext();
  if (musicRunning) return;
  musicRunning = true;
  musicStep = 0;
  if (musicGain) {
    musicGain.gain.cancelScheduledValues(getCtx()?.currentTime || 0);
    musicGain.gain.value = 0.22;
  }
  playMusicStep();
  musicTimer = setInterval(playMusicStep, 240);
}

export function stopGameMusic() {
  musicRunning = false;
  if (musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
  if (musicGain && ctx) {
    const t = ctx.currentTime;
    musicGain.gain.cancelScheduledValues(t);
    musicGain.gain.setValueAtTime(musicGain.gain.value, t);
    musicGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    setTimeout(() => {
      if (!musicRunning && musicGain) musicGain.gain.value = musicEnabled ? 0.22 : 0;
    }, 450);
  }
}

export function duckMusic(active = true) {
  if (!musicGain || !ctx || !musicEnabled) return;
  const t = ctx.currentTime;
  musicGain.gain.cancelScheduledValues(t);
  musicGain.gain.setValueAtTime(musicGain.gain.value, t);
  musicGain.gain.exponentialRampToValueAtTime(active ? 0.06 : 0.22, t + 0.25);
}

export function isMusicEnabled() {
  return musicEnabled;
}

export function isSfxEnabled() {
  return sfxEnabled;
}

export function setMusicEnabled(on) {
  musicEnabled = !!on;
  savePrefs();
  if (musicGain) musicGain.gain.value = musicEnabled ? 0.22 : 0;
  if (!musicEnabled) stopGameMusic();
  updateToggleButtons();
}

export function setSfxEnabled(on) {
  sfxEnabled = !!on;
  savePrefs();
  if (sfxGain) sfxGain.gain.value = sfxEnabled ? 0.9 : 0;
  updateToggleButtons();
}

function updateToggleButtons() {
  const musicBtn = document.getElementById('toggle-music-btn');
  const sfxBtn = document.getElementById('toggle-sfx-btn');
  if (musicBtn) {
    musicBtn.classList.toggle('off', !musicEnabled);
    musicBtn.setAttribute('aria-pressed', musicEnabled ? 'true' : 'false');
    musicBtn.title = musicEnabled ? 'Music on — click to mute' : 'Music off — click to enable';
  }
  if (sfxBtn) {
    sfxBtn.classList.toggle('off', !sfxEnabled);
    sfxBtn.setAttribute('aria-pressed', sfxEnabled ? 'true' : 'false');
    sfxBtn.title = sfxEnabled ? 'Sound effects on — click to mute' : 'Sound effects off — click to enable';
  }
}

export function initAudio() {
  musicEnabled = readBool(STORAGE_MUSIC, true);
  sfxEnabled = readBool(STORAGE_SFX, true);

  const musicBtn = document.getElementById('toggle-music-btn');
  const sfxBtn = document.getElementById('toggle-sfx-btn');

  musicBtn?.addEventListener('click', async () => {
    await ensureAudioContext();
    setMusicEnabled(!musicEnabled);
    playUiClick();
    if (musicEnabled && document.getElementById('game-screen')?.classList.contains('active')) {
      startGameMusic();
    }
  });

  sfxBtn?.addEventListener('click', async () => {
    await ensureAudioContext();
    setSfxEnabled(!sfxEnabled);
    if (sfxEnabled) playUiClick();
  });

  updateToggleButtons();

  const resume = () => {
    void ensureAudioContext();
  };
  document.addEventListener('click', resume, { once: true, capture: true });
  document.addEventListener('keydown', resume, { once: true, capture: true });
}
