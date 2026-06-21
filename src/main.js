import { CHARACTERS, WEAPONS, TANKS, SNEAKERS, VESTS, PAINTS } from './data.js'
import { startGame } from './game.js'
import { initAudio, resumeAudio, startMusic, sfx } from './audio.js'

const state = { char: null, weapon: null, tank: null, sneaker: null, vest: null, paint: null, mode: 'br' }

// ---- Seletor de modo ----
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.onclick = () => {
    initAudio(); sfx.ui()
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    state.mode = btn.dataset.mode
  }
})

const charGrid = document.getElementById('char-grid')
const weaponGrid = document.getElementById('weapon-grid')
const tankGrid = document.getElementById('tank-grid')
const sneakerGrid = document.getElementById('sneaker-grid')
const vestGrid = document.getElementById('vest-grid')
const paintGrid = document.getElementById('paint-grid')
const startBtn = document.getElementById('start-btn')

document.getElementById('char-count').textContent = `(${CHARACTERS.length})`
document.getElementById('weapon-count').textContent = `(${WEAPONS.length})`
document.getElementById('tank-count').textContent = `(${TANKS.length})`
document.getElementById('sneaker-count').textContent = `(${SNEAKERS.length})`
document.getElementById('vest-count').textContent = `(${VESTS.length})`
document.getElementById('paint-count').textContent = `(${PAINTS.length})`

function hex(c) { return '#' + c.toString(16).padStart(6, '0') }

// ---- Monta grade de personagens ----
CHARACTERS.forEach((c, i) => {
  const cell = document.createElement('div')
  cell.className = 'cell'
  cell.style.boxShadow = `inset 0 -3px 0 ${hex(c.color)}`
  cell.innerHTML = `<span class="ico">${c.emoji}</span><span class="nm">${c.name}</span>`
  cell.onclick = () => {
    initAudio(); sfx.ui()
    state.char = i
    charGrid.querySelectorAll('.cell').forEach(x => x.classList.remove('selected'))
    cell.classList.add('selected')
    document.getElementById('sel-char-name').textContent = c.name
    document.getElementById('sel-char-perk').textContent = c.perkLabel
    refresh()
  }
  charGrid.appendChild(cell)
})

// ---- Monta grade de armas ----
WEAPONS.forEach((w, i) => {
  const cell = document.createElement('div')
  cell.className = 'cell'
  cell.innerHTML = `<span class="ico">${w.emoji}</span><span class="nm">${w.name}</span>`
  cell.onclick = () => {
    initAudio(); sfx.ui()
    state.weapon = i
    weaponGrid.querySelectorAll('.cell').forEach(x => x.classList.remove('selected'))
    cell.classList.add('selected')
    document.getElementById('sel-weapon-name').textContent = w.name
    const dps = Math.round(w.damage * w.fireRate * w.pellets)
    document.getElementById('sel-weapon-stats').textContent =
      `${w.cat} · dano ${w.damage} · DPS ~${dps}`
    refresh()
  }
  weaponGrid.appendChild(cell)
})

// ---- Monta grade de tanques de tinta ----
TANKS.forEach((t, i) => {
  const cell = document.createElement('div')
  cell.className = 'cell'
  cell.style.boxShadow = `inset 0 -3px 0 ${hex(t.color)}`
  cell.innerHTML = `<span class="ico">${t.emoji}</span><span class="nm">${t.name}</span>`
  cell.onclick = () => {
    initAudio(); sfx.ui()
    state.tank = i
    tankGrid.querySelectorAll('.cell').forEach(x => x.classList.remove('selected'))
    cell.classList.add('selected')
    document.getElementById('sel-tank-name').textContent = t.name
    const cap = `${Math.round(t.capacity * 100)}% de tinta`
    const rel = t.reload < 1 ? 'recarga rápida' : t.reload > 1 ? 'recarga lenta' : 'recarga normal'
    document.getElementById('sel-tank-stats').textContent = `${cap} · ${rel}`
    refresh()
  }
  tankGrid.appendChild(cell)
})

// ---- Monta grade de tênis ----
SNEAKERS.forEach((s, i) => {
  const cell = document.createElement('div')
  cell.className = 'cell'
  cell.style.boxShadow = `inset 0 -3px 0 ${hex(s.color)}`
  cell.innerHTML = `<span class="ico">${s.emoji}</span><span class="nm">${s.name}</span>`
  cell.onclick = () => {
    initAudio(); sfx.ui()
    state.sneaker = i
    sneakerGrid.querySelectorAll('.cell').forEach(x => x.classList.remove('selected'))
    cell.classList.add('selected')
    document.getElementById('sel-sneaker-name').textContent = s.name
    const parts = [`velocidade ${Math.round(s.speed * 100)}%`]
    if (s.dash > 1) parts.push(`dash +${Math.round((s.dash - 1) * 100)}%`)
    document.getElementById('sel-sneaker-stats').textContent = parts.join(' · ')
    refresh()
  }
  sneakerGrid.appendChild(cell)
})

// ---- Monta grade de coletes ----
VESTS.forEach((v, i) => {
  const cell = document.createElement('div')
  cell.className = 'cell'
  cell.style.boxShadow = `inset 0 -3px 0 ${hex(v.color)}`
  cell.innerHTML = `<span class="ico">${v.emoji}</span><span class="nm">${v.name}</span>`
  cell.onclick = () => {
    initAudio(); sfx.ui()
    state.vest = i
    vestGrid.querySelectorAll('.cell').forEach(x => x.classList.remove('selected'))
    cell.classList.add('selected')
    document.getElementById('sel-vest-name').textContent = v.name
    const parts = [v.hp > 0 ? `+${v.hp} de vida` : 'sem vida extra']
    if (v.regen) parts.push(`+${v.regen}/s`)
    document.getElementById('sel-vest-stats').textContent = parts.join(' · ')
    refresh()
  }
  vestGrid.appendChild(cell)
})

// ---- Monta grade de cores de tinta ----
PAINTS.forEach((p, i) => {
  const cell = document.createElement('div')
  cell.className = 'cell'
  // bolinha colorida (Arco-Íris ganha um degradê)
  const sw = p.color === -1
    ? 'background:linear-gradient(90deg,#ff3b6b,#ffe14d,#9ee04d,#00e5ff,#cc44ff)'
    : `background:${hex(p.color)}`
  cell.innerHTML = `<span class="swatch" style="${sw}"></span><span class="nm">${p.name}</span>`
  cell.onclick = () => {
    initAudio(); sfx.ui()
    state.paint = i
    paintGrid.querySelectorAll('.cell').forEach(x => x.classList.remove('selected'))
    cell.classList.add('selected')
    document.getElementById('sel-paint-name').textContent = p.name
    document.getElementById('sel-paint-stats').textContent =
      p.color === -1 ? 'muda de cor a cada tiro!' : 'cor dos seus tiros e respingos'
    refresh()
  }
  paintGrid.appendChild(cell)
})

function refresh() {
  startBtn.disabled = state.char === null || state.weapon === null || state.tank === null || state.sneaker === null || state.vest === null || state.paint === null
}

startBtn.onclick = () => {
  if (state.char === null || state.weapon === null || state.tank === null || state.sneaker === null || state.vest === null || state.paint === null) return
  initAudio(); resumeAudio(); sfx.ui()
  document.getElementById('menu').classList.add('hidden')
  document.getElementById('hud').classList.remove('hidden')
  startGame(CHARACTERS[state.char], WEAPONS[state.weapon], TANKS[state.tank], SNEAKERS[state.sneaker], VESTS[state.vest], PAINTS[state.paint], state.mode)
  startMusic()
}

// ---- Combinações salvas (loadouts) ----
const PRESET_KEY = 'crazyRoyaleLoadouts'
const PRESET_MAX = 8
let presets = loadPresets()

function loadPresets() {
  try { return JSON.parse(localStorage.getItem(PRESET_KEY)) || [] } catch { return [] }
}
function savePresets() {
  try { localStorage.setItem(PRESET_KEY, JSON.stringify(presets)) } catch { /* cota cheia */ }
}

// aplica uma combinação salva (re-seleciona cada grade)
function applyPreset(p) {
  if (charGrid.children[p.char]) charGrid.children[p.char].click()
  if (weaponGrid.children[p.weapon]) weaponGrid.children[p.weapon].click()
  if (tankGrid.children[p.tank]) tankGrid.children[p.tank].click()
  if (sneakerGrid.children[p.sneaker]) sneakerGrid.children[p.sneaker].click()
  if (vestGrid.children[p.vest]) vestGrid.children[p.vest].click()
  if (paintGrid.children[p.paint]) paintGrid.children[p.paint].click()
}

function renderPresets() {
  const list = document.getElementById('preset-list')
  list.innerHTML = ''
  presets.forEach((p, i) => {
    const chip = document.createElement('div')
    chip.className = 'preset-chip'
    chip.innerHTML = `<span class="preset-load">${p.name}</span><span class="preset-del" title="apagar">✕</span>`
    chip.querySelector('.preset-load').onclick = () => { sfx.ui(); applyPreset(p) }
    chip.querySelector('.preset-del').onclick = () => { sfx.ui(); presets.splice(i, 1); savePresets(); renderPresets() }
    list.appendChild(chip)
  })
}

document.getElementById('save-loadout').onclick = () => {
  initAudio(); sfx.ui()
  if (state.char === null || state.weapon === null || state.tank === null || state.sneaker === null || state.vest === null || state.paint === null) return
  const p = {
    char: state.char, weapon: state.weapon, tank: state.tank,
    sneaker: state.sneaker, vest: state.vest, paint: state.paint,
    name: `${CHARACTERS[state.char].emoji} ${CHARACTERS[state.char].name} · ${WEAPONS[state.weapon].emoji}`
  }
  presets.unshift(p)                 // mais recente primeiro
  if (presets.length > PRESET_MAX) presets.pop()
  savePresets(); renderPresets()
}

renderPresets()

// Pré-seleciona aleatório pra ficar convidativo
charGrid.children[Math.floor(Math.random() * CHARACTERS.length)].click()
weaponGrid.children[Math.floor(Math.random() * WEAPONS.length)].click()
tankGrid.children[Math.floor(Math.random() * TANKS.length)].click()
sneakerGrid.children[Math.floor(Math.random() * SNEAKERS.length)].click()
vestGrid.children[Math.floor(Math.random() * VESTS.length)].click()
paintGrid.children[Math.floor(Math.random() * PAINTS.length)].click()
