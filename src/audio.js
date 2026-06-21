// ---------------- Áudio do Crazy Royale ----------------
// Tudo é sintetizado via Web Audio API: nenhum arquivo externo, funciona offline.
// Efeitos sonoros (tiro, dano, explosão, pulo, etc.) + música de fundo procedural.

let ctx = null
let master = null         // ganho geral
let sfxBus = null         // barramento dos efeitos
let musicBus = null       // barramento da música
let noiseBuffer = null
let muted = false
let musicOn = false
let musicTimer = null
let musicStep = 0

// Cria o contexto na primeira interação (exigência dos navegadores).
export function initAudio() {
  if (ctx) { resumeAudio(); return }
  const AC = window.AudioContext || window.webkitAudioContext
  ctx = new AC()
  master = ctx.createGain();  master.gain.value = 0.9;  master.connect(ctx.destination)
  sfxBus = ctx.createGain();  sfxBus.gain.value = 0.55;  sfxBus.connect(master)
  musicBus = ctx.createGain(); musicBus.gain.value = 0.0; musicBus.connect(master)

  // ruído branco reutilizável (passos de tiro, explosões, etc.)
  const len = ctx.sampleRate * 1
  noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = noiseBuffer.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
}

export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume()
}

export function toggleMute() {
  muted = !muted
  if (master) master.gain.value = muted ? 0 : 0.9
  return muted
}

export function isMuted() { return muted }

// ---------------- Blocos básicos ----------------
function now() { return ctx.currentTime }

// Toca um oscilador com envelope ADSR simplificado, opcionalmente com glissando.
function tone({ freq, type = 'square', dur = 0.15, vol = 0.3, attack = 0.005, slideTo = null, dest = sfxBus }) {
  if (!ctx) return
  const t = now()
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g); g.connect(dest)
  osc.start(t); osc.stop(t + dur + 0.02)
}

// Estouro de ruído filtrado (impactos, tiros, explosões).
function noise({ dur = 0.2, vol = 0.4, filter = 'lowpass', freq = 1200, q = 1, sweepTo = null, dest = sfxBus }) {
  if (!ctx) return
  const t = now()
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer
  const f = ctx.createBiquadFilter()
  f.type = filter; f.frequency.setValueAtTime(freq, t); f.Q.value = q
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + dur)
  const g = ctx.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f); f.connect(g); g.connect(dest)
  src.start(t); src.stop(t + dur + 0.02)
}

// ---------------- Efeitos sonoros ----------------
// Tom de desenho animado: nada de armas realistas — é "pew pew", "boing" e "poof".
// Sons curtos, agudos e divertidos, pensados pra um público infantil (9 anos).
export const sfx = {
  // o tiro varia conforme a categoria da arma, mas sempre num estilo cartunesco "pew"
  shoot(weapon = {}) {
    if (!ctx) return
    const cat = weapon.cat || ''
    if (weapon.explosive) {
      // bolha que infla: "bwoop" engraçado, sem estrondo
      tone({ freq: 240, type: 'sine', dur: 0.22, vol: 0.28, slideTo: 520 })
    } else if (/sniper|fuzil|rifle/i.test(cat) || (weapon.damage || 0) >= 45) {
      // "piuu" longo e brincalhão
      tone({ freq: 1300, type: 'triangle', dur: 0.16, vol: 0.26, slideTo: 380 })
    } else if (/shotgun|escopeta/i.test(cat) || (weapon.pellets || 1) > 1) {
      // ploft macio de confete
      tone({ freq: 700, type: 'sine', dur: 0.1, vol: 0.24, slideTo: 220 })
      noise({ dur: 0.08, vol: 0.12, filter: 'lowpass', freq: 900 })
    } else {
      // "pew" clássico, curtinho e fofo
      tone({ freq: 900, type: 'triangle', dur: 0.09, vol: 0.22, slideTo: 320 })
    }
  },
  hit() { // acertou um inimigo — "bip" alegre
    tone({ freq: 1100, type: 'sine', dur: 0.06, vol: 0.22, slideTo: 1600 })
  },
  kill() { // derrubou um inimigo — fanfarrinha boba ascendente
    tone({ freq: 700, type: 'triangle', dur: 0.1, vol: 0.26, slideTo: 1000 })
    setTimeout(() => tone({ freq: 1200, type: 'sine', dur: 0.16, vol: 0.24, slideTo: 1500 }), 70)
  },
  explosion() { // "poof" fofinho de fumaça, nada assustador
    tone({ freq: 320, type: 'sine', dur: 0.3, vol: 0.3, slideTo: 90 })
    noise({ dur: 0.25, vol: 0.2, filter: 'lowpass', freq: 700, sweepTo: 200 })
  },
  jump() { // "boing" de mola
    tone({ freq: 280, type: 'sine', dur: 0.2, vol: 0.24, slideTo: 760 })
  },
  reload() { // cliquezinhos simpáticos + "pronto!"
    tone({ freq: 500, type: 'triangle', dur: 0.05, vol: 0.18 })
    setTimeout(() => tone({ freq: 620, type: 'triangle', dur: 0.05, vol: 0.18 }), 120)
    setTimeout(() => tone({ freq: 880, type: 'sine', dur: 0.1, vol: 0.22, slideTo: 1100 }), 700)
  },
  powerup() { // brilho mágico ascendente
    const notes = [523, 659, 784, 1047]
    notes.forEach((f, i) => setTimeout(() =>
      tone({ freq: f, type: 'triangle', dur: 0.12, vol: 0.28 }), i * 70))
  },
  hurt() { // tomou dano — "ow" cômico, curtinho
    tone({ freq: 440, type: 'sine', dur: 0.16, vol: 0.26, slideTo: 220 })
  },
  death() { // caiu — descida boba estilo desenho ("waaah")
    tone({ freq: 600, type: 'triangle', dur: 0.6, vol: 0.3, slideTo: 160 })
  },
  win() { // fanfarra de vitória alegre
    const notes = [523, 659, 784, 1047, 1319]
    notes.forEach((f, i) => setTimeout(() =>
      tone({ freq: f, type: 'triangle', dur: 0.28, vol: 0.32, attack: 0.02 }), i * 130))
  },
  lose() { // "trombone triste" amigável, sem drama
    const notes = [494, 440, 392, 330]
    notes.forEach((f, i) => setTimeout(() =>
      tone({ freq: f, type: 'sine', dur: 0.32, vol: 0.26, slideTo: notes[i] * 0.9 }), i * 170))
  },
  ui() { // clique de menu fofo
    tone({ freq: 880, type: 'sine', dur: 0.05, vol: 0.16, slideTo: 1100 })
  },
  combo(n) { // fanfarra que sobe conforme a sequência de tintas
    const base = [523, 659, 784, 988, 1175]
    const k = Math.min(n - 2, base.length - 1) // combo 2 = primeiro nível
    for (let i = 0; i <= k + 1 && i < base.length; i++) {
      setTimeout(() => tone({ freq: base[i] * (1 + k * 0.05), type: 'triangle', dur: 0.14, vol: 0.3 }), i * 60)
    }
  },
}

// ---------------- Música de fundo procedural ----------------
// Trilha IRADA mas alegre: progressão cativante I–V–vi–IV em Dó maior (C–G–Am–F),
// com baixo grooveado, arpejo, melodia-gancho e bateria completa. 4 compassos = 32 colcheias.
const TEMPO = 140
const STEP = 60 / TEMPO / 2 // colcheias
const BAR = 8               // colcheias por compasso

// cada acorde traz o baixo (root grave) e as notas pro pad/arpejo
const CHORDS = [
  { bass: 65.41, notes: [261.6, 329.6, 392.0, 523.3] }, // C  (Dó maior)
  { bass: 98.00, notes: [293.7, 392.0, 493.9, 587.3] }, // G  (Sol maior)
  { bass: 110.0, notes: [329.6, 440.0, 523.3, 659.3] }, // Am (Lá menor)
  { bass: 87.31, notes: [349.2, 440.0, 523.3, 698.5] }, // F  (Fá maior)
]

// melodia-gancho (32 colcheias, uma por step) — pensada pra grudar na cabeça
const HOOK = [
  523.3, 0,     659.3, 784.0, 0,     784.0, 659.3, 0,     // compasso C
  587.3, 0,     587.3, 493.9, 0,     587.3, 784.0, 0,     // compasso G
  659.3, 880.0, 0,     659.3, 523.3, 0,     659.3, 880.0, // compasso Am
  698.5, 0,     523.3, 440.0, 0,     349.2, 392.0, 440.0, // compasso F
]

// padrão de groove do baixo dentro de cada compasso (true = toca a root)
const BASS_HITS = [true, false, true, true, false, true, false, true]

export function startMusic() {
  if (!ctx || musicOn) return
  musicOn = true
  musicStep = 0
  // fade-in animado
  musicBus.gain.cancelScheduledValues(now())
  musicBus.gain.setValueAtTime(musicBus.gain.value, now())
  musicBus.gain.linearRampToValueAtTime(0.42, now() + 1.2)
  musicTimer = setInterval(musicTick, STEP * 1000)
}

export function stopMusic() {
  if (!musicOn) return
  musicOn = false
  clearInterval(musicTimer); musicTimer = null
  if (musicBus) {
    musicBus.gain.cancelScheduledValues(now())
    musicBus.gain.linearRampToValueAtTime(0.0, now() + 0.6)
  }
}

// camada grossa pro lead: dois osciladores levemente desafinados = som "fat"
function fatTone(freq, dur, vol) {
  tone({ freq, type: 'sawtooth', dur, vol, dest: musicBus })
  tone({ freq: freq * 1.006, type: 'sawtooth', dur, vol: vol * 0.7, dest: musicBus })
}

function musicTick() {
  const step = musicStep % 32
  const bar = Math.floor(step / BAR)
  const beat = step % BAR
  const chord = CHORDS[bar]
  // a cada 2 voltas do loop entra a "parte forte" (octava extra no baixo + arpejo mais alto)
  const hype = Math.floor(musicStep / 32) % 2 === 1

  // --- BAIXO grooveado (root + sub uma oitava abaixo) ---
  if (BASS_HITS[beat]) {
    tone({ freq: chord.bass, type: 'square', dur: STEP * 1.3, vol: 0.16, dest: musicBus })
    tone({ freq: chord.bass / 2, type: 'sine', dur: STEP * 1.5, vol: 0.14, dest: musicBus })
    if (hype) tone({ freq: chord.bass * 2, type: 'sawtooth', dur: STEP * 0.8, vol: 0.05, dest: musicBus })
  }

  // --- PAD: acorde suave sustentado no início de cada compasso ---
  if (beat === 0) {
    chord.notes.slice(0, 3).forEach(f =>
      tone({ freq: f / 2, type: 'triangle', dur: STEP * BAR * 0.95, vol: 0.035, attack: 0.08, dest: musicBus }))
  }

  // --- ARPEJO: notas do acorde subindo nas colcheias ímpares ---
  if (beat % 2 === 1) {
    const n = chord.notes[(beat >> 1) % chord.notes.length]
    tone({ freq: hype ? n * 2 : n, type: 'triangle', dur: STEP * 0.7, vol: 0.06, dest: musicBus })
  }

  // --- MELODIA-GANCHO bem na frente, som "fat" ---
  const m = HOOK[step]
  if (m) fatTone(m, STEP * 0.85, 0.085)

  // --- BATERIA ---
  // bumbo nos tempos 1 e 3 (+ síncope no fim do compasso quando está no hype)
  if (beat === 0 || beat === 4 || (hype && beat === 7)) {
    tone({ freq: 160, type: 'sine', dur: 0.12, vol: 0.32, slideTo: 55, dest: musicBus })
  }
  // caixa (snare) nos tempos 2 e 4
  if (beat === 2 || beat === 6) {
    noise({ dur: 0.18, vol: 0.16, filter: 'highpass', freq: 1800, dest: musicBus })
    tone({ freq: 220, type: 'triangle', dur: 0.08, vol: 0.08, slideTo: 140, dest: musicBus })
  }
  // chimbal em toda colcheia (mais forte no contratempo)
  noise({ dur: 0.03, vol: beat % 2 ? 0.06 : 0.035, filter: 'highpass', freq: 9000, dest: musicBus })

  musicStep++
}
