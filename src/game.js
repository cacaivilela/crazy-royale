import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { CHARACTERS, WEAPONS, STORY_CHARACTERS, PAINTS } from './data.js'
import { sfx, stopMusic, toggleMute } from './audio.js'

// todas as cores do jogo (sem o próprio Arco-Íris) — usadas pra ele alternar
const RAINBOW_COLORS = PAINTS.filter(p => p.color !== -1).map(p => p.color)
let rainbowIdx = 0

// ============================================================
//  CRAZY ROYALE - motor do jogo (Three.js, primeira pessoa)
// ============================================================

const ARENA = 220          // raio do mapa
const BOT_COUNT = 9        // 9 personagens inimigos + o jogador = 10
const START_ALIVE = BOT_COUNT + 1

let renderer, scene, camera, clock, composer, bloomPass, thermalPass
let player, weapon, char, tank, sneaker, vest, ink

// shader de Visão de Calor (térmico): remapeia a luminância pra uma paleta quente/fria
const ThermalShader = {
  uniforms: { tDiffuse: { value: null }, enabled: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float enabled; varying vec2 vUv;
    vec3 thermal(float t){
      vec3 c = mix(vec3(0.0,0.0,0.12), vec3(0.0,0.0,0.75), smoothstep(0.0,0.25,t));
      c = mix(c, vec3(0.6,0.0,0.7), smoothstep(0.25,0.45,t));
      c = mix(c, vec3(1.0,0.0,0.0), smoothstep(0.45,0.6,t));
      c = mix(c, vec3(1.0,0.6,0.0), smoothstep(0.6,0.78,t));
      c = mix(c, vec3(1.0,1.0,0.35), smoothstep(0.78,0.92,t));
      c = mix(c, vec3(1.0,1.0,1.0), smoothstep(0.92,1.0,t));
      return c;
    }
    void main(){
      vec4 col = texture2D(tDiffuse, vUv);
      if (enabled < 0.5) { gl_FragColor = col; return; }
      float l = dot(col.rgb, vec3(0.299,0.587,0.114));
      float t = pow(clamp(l * 1.15, 0.0, 1.0), 1.8); // escurece o fundo (frio), realça os corpos quentes
      gl_FragColor = vec4(thermal(t), 1.0);
    }`
}
let bots = []
let projectiles = []
let pixelBursts = []      // nuvens de pixels azuis dos derrotados
let obstacles = []
let lavaPools = []        // poças de lava (tocar = morte)
let lavaMats = []         // materiais de lava p/ animar o brilho
let powerups = []         // itens de bônus na arena
let buffs = {}            // bônus temporários ativos (por tipo)
let bouncePads = []       // trampolins de tinta
let ammoCans = []         // latas de tinta (recarregam munição)
let grenades = []         // granadas de tinta voando
let lastLoadout = null    // último loadout usado (pra reusar no treino)
let training = null       // estado do treino (tutorial de 7 fases)
let playerAvatar = null   // boneco do jogador (visível na câmera 3ª pessoa)
let mode = 'br'           // 'br' = battle royale · 'boss' · 'infinite' · 'train' (tutorial) · 'build'
let boss = null           // chefe atual (modo boss)
let teeth = []            // projéteis do boss (dentes)
let buildState = 'edit'   // crazy build: 'edit' (construindo) ou 'test' (jogando)
let buildTool = 0         // ferramenta selecionada
let placed = []           // objetos colocados no editor
let ghost = null          // prévia de onde o objeto será colocado
let zone = { radius: ARENA, target: ARENA, next: 25, phase: 0 }
let alive = START_ALIVE
let kills = 0
let combo = 0             // sequência de tintas em pouco tempo
let comboUntil = 0        // até quando a sequência continua válida
let running = false
let spectating = false    // jogador morto, assistindo a partida
let playerRank = 0        // posição em que o jogador foi eliminado
let raf = 0
let monitorRefs = []      // telas da sala (atualizam ao vivo)
let spectator = { flying: false, t: 0, start: null, escort: null, refreshT: 0 }

const keys = {}
const mouse = { dx: 0, dy: 0, locked: false }

// estado do jogador
const P = {
  pos: new THREE.Vector3(0, 1.6, 0),
  vel: new THREE.Vector3(),
  yaw: 0, pitch: 0,
  onGround: true,
  jumps: 0,
  hp: 100, maxHp: 100,
  speed: 26,
  lastShot: 0,
  ammo: 0,
  reloading: false,
  dmgMult: 1, dmgTakenMult: 1, regen: 0,
  dashPower: 1, maxJumps: 1, fireRateMult: 1, ammoMult: 1, jumpPower: 11, reloadMult: 1,
  lastHurt: 0,
  invincible: false,
  // novas mecânicas
  crouching: false, dashTime: 0, dashCd: 0, grenadeCd: 0, adrenaline: false, aiming: false,
  caixacete: false, boxed: false   // capacete-caixa do treino + virar caixa (invisível pros coms)
}

// munição máxima do pente considerando a perk (Infinity continua infinito)
function maxAmmo() {
  return weapon.ammo === Infinity ? Infinity : weapon.ammo * P.ammoMult
}

export function startGame(selectedChar, selectedWeapon, selectedTank, selectedSneaker, selectedVest, selectedPaint, selectedMode) {
  // limpa um jogo anterior (permite iniciar o treino sem recarregar a página)
  if (raf) cancelAnimationFrame(raf)
  running = false
  if (renderer) { try { renderer.domElement.remove(); renderer.dispose() } catch { } }
  bots = []; projectiles = []; grenades = []; pixelBursts = []; powerups = []; ammoCans = []; bouncePads = []
  char = selectedChar
  weapon = selectedWeapon
  tank = selectedTank || { capacity: 1, reload: 1 }
  sneaker = selectedSneaker || { speed: 1, dash: 1 }
  vest = selectedVest || { hp: 0, regen: 0 }
  ink = selectedPaint || { color: 0x00e5ff }
  mode = selectedMode || 'br'
  lastLoadout = { char, weapon, tank, sneaker, vest, ink } // guarda pra reusar (ex: treino)
  setupPerks()
  initThree()
  setupViewmodel()
  buildArena()
  if (mode === 'boss') { spawnAllies(); spawnBoss() }
  else if (mode === 'build') { /* o editor controla o spawn */ }
  else if (mode === 'infinite') crowdStart()
  else if (mode === 'train') setupTraining()
  else spawnBots()
  if (mode !== 'build' && mode !== 'train') { spawnPowerups(); spawnBouncePads(); spawnAmmoCans() }
  bindInput()
  resetHud()
  running = true
  clock = new THREE.Clock()
  applyHeatAll()              // se a Visão de Calor estiver ligada, faz os personagens brilharem
  loop()
  if (mode === 'build') startBuild()
}

// inicia o treino (tutorial) com o caixacete já na cabeça
function startTraining() {
  if (!lastLoadout) return
  document.getElementById('menu').classList.add('hidden')
  document.getElementById('endscreen').classList.add('hidden')
  document.getElementById('hud').classList.remove('hidden')
  startGame(lastLoadout.char, lastLoadout.weapon, lastLoadout.tank, lastLoadout.sneaker, lastLoadout.vest, lastLoadout.ink, 'train')
}

function setupPerks() {
  P.maxHp = 200; P.speed = 26; P.dmgMult = 1; P.dmgTakenMult = 1
  P.regen = 0; P.dashPower = 1; P.maxJumps = 1; P.fireRateMult = 1; P.ammoMult = 1; P.jumpPower = 11; P.reloadMult = 1
  switch (char.perk) {
    case 'speed':    P.speed = 32.5; break
    case 'tank':     P.maxHp = 300; break
    case 'heal':     P.regen = 4; break
    case 'armor':    P.dmgTakenMult = 0.8; break
    case 'damage':   P.dmgMult = 1.15; break
    case 'dash':     P.dashPower = 2; break
    case 'jump':     P.maxJumps = 2; break
    case 'firerate': P.fireRateMult = 2; break
    case 'dino':     P.maxHp = 340; P.dmgTakenMult = 0.75; P.dmgMult = 1.2; P.ammoMult = 5; break
    case 'glass':    P.dmgMult = 1.25; P.dmgTakenMult = 1.4; break
  }
  // tanque de tinta: capacidade de munição + tempo de recarga
  P.ammoMult *= tank.capacity
  P.reloadMult = tank.reload
  // tênis: velocidade + potência do dash
  P.speed *= sneaker.speed
  P.dashPower *= sneaker.dash
  // colete: HP máximo extra + regeneração
  P.maxHp += vest.hp
  P.regen += vest.regen
  P.hp = P.maxHp
  P.lastHurt = 0
  P.ammo = maxAmmo()
  P.pos.set(0, 1.6, 0)
  P.vel.set(0, 0, 0)
  P.yaw = 0; P.pitch = 0; P.jumps = 0
  kills = 0; alive = START_ALIVE
  P.invincible = false; buffs = {}
  P.crouching = false; P.dashTime = 0; P.dashCd = 0; P.grenadeCd = 0; P.adrenaline = false; P.aiming = false
  P.caixacete = false; P.boxed = false; training = null; playerAvatar = null // caixacete só liga na 2ª parte do treino
  combo = 0; comboUntil = 0; paintDecals = []; pixelBursts = []
  bouncePads = []; ammoCans = []; grenades = []
  boss = null; teeth = []
  buildState = 'edit'; buildTool = 0; placed = []; ghost = null
  spectating = false; playerRank = 0; monitorRefs = []
  spectator = { flying: false, t: 0, start: null, escort: null, refreshT: 0 }
  zone = { radius: ARENA, target: ARENA, next: 22, phase: 0 }
}

// ---------------- Three.js base ----------------
function initThree() {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap        // sombras suaves
  renderer.toneMapping = THREE.ACESFilmicToneMapping      // cor cinematográfica
  renderer.toneMappingExposure = 1.12
  renderer.outputColorSpace = THREE.SRGBColorSpace
  document.getElementById('app').appendChild(renderer.domElement)

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x10122a)
  scene.fog = new THREE.Fog(0x10122a, 90, 300)

  camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.1, 1000)
  scene.add(camera) // permite anexar o modelo da arma em primeira pessoa

  const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x35204a, 0.85)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight(0xffffff, 1.5)
  sun.position.set(60, 120, 40)
  sun.castShadow = true
  sun.shadow.mapSize.set(4096, 4096)                      // sombras nítidas (mais "bytes")
  sun.shadow.camera.left = -ARENA; sun.shadow.camera.right = ARENA
  sun.shadow.camera.top = ARENA; sun.shadow.camera.bottom = -ARENA
  sun.shadow.camera.far = 400
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.02
  scene.add(sun)
  // luz de preenchimento fria do lado oposto (dá volume/realismo)
  const fill = new THREE.DirectionalLight(0x88aaff, 0.4)
  fill.position.set(-80, 60, -60)
  scene.add(fill)
  // luz de borda (rim) pra destacar as silhuetas
  const rim = new THREE.DirectionalLight(0xffd9a0, 0.35)
  rim.position.set(0, 40, -120)
  scene.add(rim)

  // reflexos realistas (image-based lighting via PMREM)
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.5

  // pós-processamento: bloom (brilho) + visão de calor (térmico)
  composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.5, 0.82)
  composer.addPass(bloomPass)
  thermalPass = new ShaderPass(ThermalShader)   // sempre o último (renderiza na tela); ligado/desligado via uniform
  composer.addPass(thermalPass)
  applySettings()

  // estado de desempenho pra resolução adaptativa
  const cap = Math.min(devicePixelRatio, 2)
  perf = { ema: 16.7, t: 0, cap, ratio: cap }
  if (!fpsEl) {
    fpsEl = document.createElement('div'); fpsEl.id = 'fps'
    fpsEl.style.display = 'none'
    document.body.appendChild(fpsEl)
  }

  window.addEventListener('resize', onResize)

  // instrução flutuante
  if (!document.getElementById('instructions')) {
    const tip = document.createElement('div')
    tip.id = 'instructions'
    tip.textContent = 'CLIQUE mirar · WASD mover · MOUSE olhar · ESPAÇO pular · SHIFT dash · CLIQUE atira · R recarrega · E sair'
    document.getElementById('app').appendChild(tip)
  }
}

function onResize() {
  if (!camera) return
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
  if (composer) composer.setSize(innerWidth, innerHeight)
}

// ---- Resolução dinâmica adaptativa + medidor de FPS ----
let perf = null, fpsEl = null, fpsOn = false
function adaptQuality(dt) {
  if (!perf) return
  perf.ema = perf.ema * 0.92 + (dt * 1000) * 0.08   // média móvel do tempo de frame (ms)
  perf.t += dt
  if (perf.t < 0.6) return                           // reavalia ~a cada 0.6s
  perf.t = 0
  const fps = 1000 / perf.ema
  let r = perf.ratio
  if (fps < 48) r = Math.max(0.6, r - 0.15)          // travando → baixa a resolução
  else if (fps > 57) r = Math.min(perf.cap, r + 0.1) // sobra folga → sobe de volta
  if (Math.abs(r - perf.ratio) > 0.001) {
    perf.ratio = r
    renderer.setPixelRatio(r)
    if (composer && composer.setPixelRatio) composer.setPixelRatio(r)
    if (composer) composer.setSize(innerWidth, innerHeight)
  }
  if (fpsOn && fpsEl) fpsEl.textContent = `${Math.round(fps)} FPS · ${r.toFixed(2)}x`
}

// Arma do jogador, em primeira pessoa, presa à câmera (canto inferior direito).
let viewModel = null
function setupViewmodel() {
  if (viewModel) { camera.remove(viewModel); viewModel = null }
  viewModel = makeWeaponModel(weapon)
  viewModel.scale.setScalar(0.6)
  viewModel.rotation.y = Math.PI       // aponta o cano pra frente (-Z da câmera)
  viewModel.position.set(0.32, -0.28, -0.55)
  viewModel.traverse(o => { if (o.isMesh) o.renderOrder = 999 })
  camera.add(viewModel)
}

// ---------------- Arena ----------------
function buildArena() {
  // chão
  const groundGeo = new THREE.CircleGeometry(ARENA, 64)
  groundGeo.rotateX(-Math.PI / 2)
  const ground = new THREE.Mesh(
    groundGeo,
    new THREE.MeshStandardMaterial({ color: 0x2a2350, roughness: 1 })
  )
  ground.receiveShadow = true
  scene.add(ground)

  // grade quadriculada
  const grid = new THREE.GridHelper(ARENA * 2, 60, 0x5a4fa0, 0x352b6a)
  grid.position.y = 0.02
  scene.add(grid)

  // cilindro da zona (borda visual)
  const zoneGeo = new THREE.CylinderGeometry(ARENA, ARENA, 60, 48, 1, true)
  zone.mesh = new THREE.Mesh(zoneGeo, new THREE.MeshBasicMaterial({
    color: 0x00e5ff, transparent: true, opacity: 0.12, side: THREE.BackSide
  }))
  zone.mesh.position.y = 30
  scene.add(zone.mesh)

  // obstáculos malucos espalhados
  const palette = [0xff2e88, 0x00e5ff, 0xffd400, 0x9b5de5, 0x00f5a0, 0xff7b00]
  for (let i = 0; i < 90; i++) {
    const a = Math.random() * Math.PI * 2
    const r = 12 + Math.random() * (ARENA - 20)
    const x = Math.cos(a) * r, z = Math.sin(a) * r
    const kind = Math.random()
    let mesh, h
    const mat = new THREE.MeshStandardMaterial({
      color: palette[(Math.random() * palette.length) | 0], roughness: .7
    })
    if (kind < 0.4) {
      h = 4 + Math.random() * 8
      mesh = new THREE.Mesh(new THREE.BoxGeometry(4 + Math.random() * 6, h, 4 + Math.random() * 6), mat)
    } else if (kind < 0.7) {
      h = 5 + Math.random() * 10
      const rad = 2 + Math.random() * 3
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, h, 12), mat)
    } else {
      h = 4 + Math.random() * 5
      mesh = new THREE.Mesh(new THREE.ConeGeometry(3 + Math.random() * 3, h, 8), mat)
    }
    mesh.position.set(x, h / 2, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    scene.add(mesh)
    const box = new THREE.Box3().setFromObject(mesh)
    obstacles.push({ mesh, box })
  }

  if (mode === 'br') buildLava() // só o battle royale tem água/lava
}

// Mar de lava em volta da arena + poças de lava no chão (tocar = morte instantânea).
function buildLava() {
  const newLavaMat = () => {
    const m = new THREE.MeshStandardMaterial({
      color: 0xff2200, emissive: 0xff5500, emissiveIntensity: 1.3, roughness: .35, metalness: .1
    })
    lavaMats.push(m)
    return m
  }

  // mar de lava ao redor (anel gigante logo abaixo do nível do chão)
  const sea = new THREE.Mesh(new THREE.RingGeometry(ARENA - 1, ARENA * 4, 80), newLavaMat())
  sea.rotation.x = -Math.PI / 2
  sea.position.y = -0.4
  scene.add(sea)
  // luz quente vinda do mar de lava
  scene.add(new THREE.HemisphereLight(0xff6600, 0x000000, 0.35))

  // poças de lava espalhadas (longe do spawn no centro)
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2
    const r = 35 + Math.random() * (ARENA - 60)
    const rad = 6 + Math.random() * 9
    const x = Math.cos(a) * r, z = Math.sin(a) * r
    const pool = new THREE.Mesh(new THREE.CircleGeometry(rad, 32), newLavaMat())
    pool.rotation.x = -Math.PI / 2
    pool.position.set(x, 0.06, z)
    scene.add(pool)
    const light = new THREE.PointLight(0xff5500, 3, rad * 4)
    light.position.set(x, 2, z)
    scene.add(light)
    lavaPools.push({ x, z, r: rad })
  }
}

function updateLava() {
  const t = clock ? clock.elapsedTime : 0
  const glow = 1.1 + Math.sin(t * 2) * 0.35
  for (const m of lavaMats) m.emissiveIntensity = glow
}

// O ponto (x,z) está sobre lava? (poça no chão ou mar fora da arena)
function inLava(x, z) {
  if (mode === 'build') { // lava colocada no editor (só vale quando jogando)
    if (buildState !== 'test') return false
    for (const it of placed) if (it.type === 'lava' && Math.hypot(x - it.x, z - it.z) < it.r) return true
    return false
  }
  if (mode !== 'br') return false // sem água/lava no boss
  if (Math.hypot(x, z) >= ARENA - 1) return true // mar de lava ao redor
  for (const lp of lavaPools) {
    if (Math.hypot(x - lp.x, z - lp.z) < lp.r) return true
  }
  return false
}

// ---------------- Power-ups ----------------
const POWERUPS = [
  { kind: 'heal',   emoji: '❤️', color: 0xff3b6b, label: 'Vida +80' },
  { kind: 'ammo',   emoji: '🔫', color: 0x9ee04d, label: 'Munição cheia' },
  { kind: 'speed',  emoji: '⚡', color: 0xffe14d, label: 'Velocidade 2x (8s)' },
  { kind: 'damage', emoji: '💪', color: 0xff5a2b, label: 'Dano 2x (8s)' },
  { kind: 'rapid',  emoji: '🔥', color: 0xff8a3d, label: 'Cadência 2x (8s)' },
  { kind: 'jump',   emoji: '🦘', color: 0x7ee081, label: 'Super Pulo (8s)' },
  { kind: 'invinc', emoji: '⭐', color: 0xfff27a, label: 'Invencível (6s)' }
]

function makePowerupMesh(p) {
  const g = new THREE.Group()
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.7),
    new THREE.MeshStandardMaterial({ color: p.color, emissive: p.color, emissiveIntensity: .8, roughness: .3 }))
  gem.castShadow = true; g.add(gem); g.userData.gem = gem
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.06, 8, 24),
    new THREE.MeshBasicMaterial({ color: p.color }))
  ring.rotation.x = Math.PI / 2; g.add(ring); g.userData.ring = ring
  const spr = makeEmojiSprite(p.emoji); spr.position.y = 1.4; g.add(spr)
  g.add(new THREE.PointLight(p.color, 2.2, 14))
  return g
}

function spawnPowerup(forceKind) {
  const p = forceKind ? POWERUPS.find(x => x.kind === forceKind)
                      : POWERUPS[(Math.random() * POWERUPS.length) | 0]
  let x = 0, z = 0, tries = 0
  do {
    const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * (ARENA - 50)
    x = Math.cos(a) * r; z = Math.sin(a) * r; tries++
  } while (inLava(x, z) && tries < 25)
  const mesh = makePowerupMesh(p)
  mesh.position.set(x, 1.6, z)
  scene.add(mesh)
  powerups.push({ mesh, p, x, z, t: Math.random() * 6 })
}

function spawnPowerups() {
  powerups = []
  for (let i = 0; i < 8; i++) spawnPowerup()
}

function updatePowerups(dt) {
  for (let i = powerups.length - 1; i >= 0; i--) {
    const u = powerups[i]
    u.t += dt
    u.mesh.position.y = 1.6 + Math.sin(u.t * 2) * 0.25
    u.mesh.userData.gem.rotation.y += dt * 1.6
    u.mesh.userData.ring.rotation.z += dt * 1.1
    if (!spectating) {
      const d = Math.hypot(P.pos.x - u.x, P.pos.z - u.z)
      if (d < 3 && Math.abs(P.pos.y - u.mesh.position.y) < 4) {
        collectPowerup(u.p)
        scene.remove(u.mesh)
        powerups.splice(i, 1)
        setTimeout(() => { if (running) spawnPowerup() }, 12000) // respawn
      }
    }
  }
}

function collectPowerup(p) {
  feed(`${p.emoji} ${p.label}`)
  sfx.powerup()
  switch (p.kind) {
    case 'heal':   P.hp = Math.min(P.maxHp, P.hp + 80); updateHealth(); break
    case 'ammo':   P.ammo = maxAmmo(); updateAmmo(); break
    case 'speed':  applyTimedBuff('speed', 8, () => P.speed *= 1.7, () => P.speed /= 1.7); break
    case 'damage': applyTimedBuff('damage', 8, () => P.dmgMult *= 2, () => P.dmgMult /= 2); break
    case 'rapid':  applyTimedBuff('rapid', 8, () => P.fireRateMult *= 2, () => P.fireRateMult /= 2); break
    case 'jump':   applyTimedBuff('jump', 8, () => { P.maxJumps += 2; P.jumpPower = 18 }, () => { P.maxJumps -= 2; P.jumpPower = 11 }); break
    case 'invinc': applyTimedBuff('invinc', 6, () => P.invincible = true, () => P.invincible = false); break
  }
}

// aplica um bônus temporário; se já existir do mesmo tipo, só renova o tempo
function applyTimedBuff(kind, dur, apply, revert) {
  const now = clock.elapsedTime
  if (buffs[kind]) { buffs[kind].until = now + dur }
  else { apply(); buffs[kind] = { until: now + dur, revert, emoji: POWERUPS.find(x => x.kind === kind).emoji } }
  updateBuffHud()
}

function updateBuffs() {
  if (!clock) return
  const now = clock.elapsedTime
  let changed = false
  for (const k in buffs) { if (now > buffs[k].until) { buffs[k].revert(); delete buffs[k]; changed = true } }
  updateBuffHud()
  if (changed) {/* já atualizado */}
}

function updateBuffHud() {
  const el = document.getElementById('buffs')
  if (!el) return
  const now = clock ? clock.elapsedTime : 0
  el.innerHTML = Object.values(buffs)
    .map(b => `<span>${b.emoji} ${Math.ceil(b.until - now)}s</span>`).join('')
}

// ---------------- Aparência dos personagens ----------------

// Sprite com o emoji do personagem, flutuando acima da cabeça.
function emojiTexture(emoji) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')
  ctx.font = '96px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(emoji, 64, 72)
  const tex = new THREE.CanvasTexture(c)
  tex.anisotropy = 4
  return tex
}

function makeEmojiSprite(emoji) {
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(emoji), transparent: true, depthTest: false }))
  spr.scale.set(1.1, 1.1, 1.1)
  spr.raycast = () => {} // emoji não bloqueia tiros (e evita o crash de raycast em Sprite)
  return spr
}

// Constrói um modelo de arma 3D conforme a categoria. Devolve um Group.
export function makeWeaponModel(w) {
  const g = new THREE.Group()
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2b33, roughness: .5, metalness: .3 })
  const accentMat = new THREE.MeshStandardMaterial({
    color: w.projColor, emissive: w.projColor, emissiveIntensity: .5, roughness: .4
  })
  const box = (x, y, z, mat, px = 0, py = 0, pz = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x, y, z), mat)
    m.position.set(px, py, pz); m.castShadow = true; g.add(m); return m
  }
  const tube = (r, len, mat, pz) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat)
    m.rotation.x = Math.PI / 2; m.position.z = pz; g.add(m); return m
  }

  switch (w.cat) {
    case 'pistol':
      box(0.16, 0.22, 0.5, dark, 0, 0, 0.1)
      box(0.14, 0.3, 0.16, dark, 0, -0.22, -0.05)
      tube(0.05, 0.5, accentMat, 0.4); break
    case 'smg':
      box(0.18, 0.24, 0.7, dark, 0, 0, 0.15)
      box(0.14, 0.34, 0.16, dark, 0, -0.24, 0)
      box(0.1, 0.32, 0.12, dark, 0, -0.2, 0.34)
      tube(0.05, 0.5, accentMat, 0.55); break
    case 'rifle':
      box(0.18, 0.22, 1.0, dark, 0, 0, 0.2)
      box(0.14, 0.3, 0.16, dark, 0, -0.22, -0.05)
      box(0.14, 0.18, 0.4, dark, 0, 0.02, -0.4)
      tube(0.045, 0.7, accentMat, 0.7); break
    case 'sniper':
      box(0.16, 0.2, 1.3, dark, 0, 0, 0.3)
      box(0.13, 0.28, 0.16, dark, 0, -0.2, 0)
      tube(0.07, 0.4, dark, -0.05).rotation.x = Math.PI / 2 // luneta (corpo)
      box(0.12, 0.12, 0.45, accentMat, 0, 0.2, -0.1) // luneta
      tube(0.04, 0.9, accentMat, 0.95); break
    case 'shotgun':
      box(0.24, 0.22, 0.9, dark, 0, 0, 0.15)
      box(0.14, 0.3, 0.18, dark, 0, -0.2, -0.1)
      tube(0.07, 0.7, accentMat, 0.05).position.x = 0.07
      tube(0.07, 0.7, accentMat, 0.05).position.x = -0.07; break
    case 'launcher':
      tube(0.18, 1.1, dark, 0.2)
      box(0.14, 0.3, 0.18, dark, 0, -0.22, -0.1)
      tube(0.2, 0.2, accentMat, 0.78); break
    case 'melee': {
      box(0.1, 0.1, 0.45, dark, 0, -0.1, 0) // cabo
      const blade = box(0.06, 0.55, 1.0, accentMat, 0, 0.35, 0.4)
      blade.rotation.x = 0.1; break
    }
    default: // special
      box(0.2, 0.26, 0.8, dark, 0, 0, 0.15)
      box(0.14, 0.3, 0.16, dark, 0, -0.22, -0.05)
      tube(0.1, 0.5, accentMat, 0.55)
      box(0.05, 0.3, 0.3, accentMat, 0.16, 0.1, 0.2)
  }
  return g
}

// ---- Helpers de modelagem 3D dos personagens ----
function pmat(color, rough = .65, metal = 0) { return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }) }
function addMesh(g, geo, m, x, y, z, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(geo, m)
  mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); mesh.castShadow = true
  g.add(mesh); return mesh
}
function figEyes(g, y, z, sep = 0.18, r = 0.1) {
  const w = new THREE.MeshStandardMaterial({ color: 0xffffff })
  const b = new THREE.MeshBasicMaterial({ color: 0x111111 })
  for (const sx of [-sep, sep]) {
    addMesh(g, new THREE.SphereGeometry(r, 10, 10), w, sx, y, z)
    addMesh(g, new THREE.SphereGeometry(r * 0.55, 8, 8), b, sx, y, z + r * 0.7)
  }
}
// ---- Pernas com Inverse Kinematics (IK de 2 ossos: coxa + canela) ----
// Cada perna é uma cadeia coxa→canela→pé; o joelho dobra resolvendo a lei dos cossenos
// pra que o pé alcance um alvo (a passada). Isso dá uma caminhada realista.
function makeIKLeg(color, hipY, withFoot = true) {
  const L1 = hipY * 0.5, L2 = hipY * 0.5            // comprimentos coxa/canela (ou braço/antebraço)
  const m = pmat(new THREE.Color(color).offsetHSL(0, 0, -.15), .7)
  const leg = new THREE.Group()                      // raiz = quadril/ombro
  addMesh(leg, new THREE.CylinderGeometry(0.14, 0.11, L1, 8), m, 0, -L1 / 2, 0) // coxa/braço
  const shin = new THREE.Group(); shin.position.y = -L1; leg.add(shin)           // joelho/cotovelo
  addMesh(shin, new THREE.CylinderGeometry(0.11, 0.09, L2, 8), m, 0, -L2 / 2, 0) // canela/antebraço
  if (withFoot) addMesh(shin, new THREE.BoxGeometry(0.24, 0.1, 0.38), m, 0, -L2, 0.1) // pé
  leg.userData = { L1, L2, shin }
  return leg
}
function addLegs(g, color, sx = 0.28, h = 0.55, y = 0.3) {
  const hipY = y + h
  if (!g.userData.ikLegs) g.userData.ikLegs = []
  for (const s of [-sx, sx]) {
    const leg = makeIKLeg(color, hipY)
    leg.position.set(s, hipY, 0)
    g.add(leg)
    g.userData.ikLegs.push({ leg, phase: s < 0 ? 0 : Math.PI, hipY })
  }
}
// resolve 1 perna: posiciona coxa/canela pra o pé chegar em (tz pra frente, ty pra baixo<0)
function solveLeg(leg, tz, ty) {
  const u = leg.userData, L1 = u.L1, L2 = u.L2
  let d = Math.hypot(tz, ty)
  d = Math.min((L1 + L2) * 0.999, Math.max(Math.abs(L1 - L2) + 0.01, d))
  const base = Math.atan2(tz, -ty)                                   // direção quadril→pé (0 = reto pra baixo)
  const a = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))))
  const k = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2))))
  leg.rotation.x = base + a                                          // coxa
  u.shin.rotation.x = -(Math.PI - k)                                 // joelho (dobra)
}
// anima a caminhada IK (move = 0..1 do quanto está andando)
function animateLegs(g, move, dt) {
  const legs = g.userData.ikLegs
  if (!legs) return
  for (const L of legs) {
    L.phase += dt * (3 + move * 9)
    const stride = 0.4 * Math.min(1, 0.25 + move)
    const tz = Math.sin(L.phase) * stride                            // passada pra frente/trás
    const lift = Math.max(0, Math.sin(L.phase)) * 0.28 * move        // levanta o pé na fase de avanço
    solveLeg(L.leg, tz, -L.hipY + lift)
  }
}

// braço IK que segura a arma e mira (cadeia de 2 ossos apontando pra frente)
function addAimArm(g, color, weapon, shoulderX, shoulderY) {
  const len = 1.0
  const chain = makeIKLeg(color, len, false)        // reaproveita a cadeia de 2 ossos (sem pé)
  const wrap = new THREE.Group()
  wrap.position.set(shoulderX, shoulderY, 0)
  wrap.rotation.x = -Math.PI / 2                     // a cadeia (aponta -Y) passa a apontar +Z (frente)
  wrap.add(chain)
  g.add(wrap)
  if (weapon) {
    const wm = makeWeaponModel(weapon); wm.scale.setScalar(0.8)
    wm.position.set(0, -chain.userData.L2, 0.1)      // na "mão" (ponta do antebraço)
    wm.rotation.x = Math.PI / 2                       // realinha o cano pra frente
    chain.userData.shin.add(wm)
  }
  g.userData.ikArm = { chain }
}
// mira o braço pra cima/baixo conforme o ângulo (pitch em radianos; +cima)
function aimArm(g, pitch) {
  const arm = g.userData.ikArm
  if (!arm) return
  const reach = 1.45
  const tz = Math.max(-0.95, Math.min(0.95, pitch * reach)) // converte pitch em alvo vertical
  solveLeg(arm.chain, tz, -reach)                            // reusa o solver IK de 2 ossos
}

// ---- Builders de formato por arquétipo (cada um ~2.2 de altura) ----
function shapeCreature(g, base) {
  const m = pmat(base)
  addMesh(g, new THREE.SphereGeometry(0.7, 16, 16), m, 0, 1.0, 0)
  addMesh(g, new THREE.SphereGeometry(0.5, 16, 16), m, 0, 1.9, 0)
  for (const s of [-0.32, 0.32]) addMesh(g, new THREE.SphereGeometry(0.16, 10, 10), m, s, 2.35, 0)
  figEyes(g, 1.95, 0.44, 0.18, 0.11)
  addLegs(g, base)
}
function shapeRobot(g, base) {
  const body = pmat(base, .5, .3)
  addMesh(g, new THREE.BoxGeometry(1.2, 1.3, 0.8), body, 0, 1.1, 0)
  addMesh(g, new THREE.BoxGeometry(0.9, 0.7, 0.7), pmat(base.clone().offsetHSL(0, 0, .08), .4, .3), 0, 2.05, 0)
  addMesh(g, new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6), pmat(0x333333), 0, 2.6, 0)
  addMesh(g, new THREE.SphereGeometry(0.1, 8, 8), pmat(0xff3344), 0, 2.85, 0)
  for (const s of [-0.78, 0.78]) addMesh(g, new THREE.BoxGeometry(0.2, 0.95, 0.2), body, s, 1.15, 0)
  figEyes(g, 2.1, 0.36, 0.2, 0.11)
  addLegs(g, base, 0.32, 0.5, 0.25)
}
function shapeGhost(g, base) {
  const m = pmat(base, .5)
  addMesh(g, new THREE.SphereGeometry(0.8, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, 1.75, 0)
  addMesh(g, new THREE.CylinderGeometry(0.8, 0.85, 1.2, 16), m, 0, 1.15, 0)
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; addMesh(g, new THREE.ConeGeometry(0.22, 0.45, 8), m, Math.cos(a) * 0.6, 0.55, Math.sin(a) * 0.6, Math.PI) }
  figEyes(g, 1.8, 0.72, 0.24, 0.14)
}
function shapeBanana(g) {
  const t = addMesh(g, new THREE.TorusGeometry(0.7, 0.27, 12, 22, Math.PI * 1.1), pmat(0xffe14d, .5), 0, 1.35, 0, 0, 0, Math.PI * 1.25)
  addMesh(g, new THREE.SphereGeometry(0.16, 8, 8), pmat(0x6b4f1d), 0.45, 0.55, 0)
  figEyes(g, 1.75, 0.4, 0.13, 0.08)
  addLegs(g, 0xe6c200, 0.2, 0.4, 0.2)
}
function shapeDino(g, base) {
  const m = pmat(base)
  const dark = pmat(base.clone().offsetHSL(0, 0, -.12))
  // corpo
  addMesh(g, new THREE.SphereGeometry(0.72, 14, 14), m, 0, 1.0, 0).scale.set(1, 1.1, 1.25)
  // cabeção de T-rex
  addMesh(g, new THREE.SphereGeometry(0.55, 14, 14), m, 0, 1.95, 0.3).scale.set(1, 1, 1.15)
  // focinho/mandíbula
  addMesh(g, new THREE.BoxGeometry(0.55, 0.4, 0.7), m, 0, 1.78, 0.75)
  // dentinhos
  for (let i = 0; i < 4; i++) addMesh(g, new THREE.ConeGeometry(0.05, 0.16, 5), pmat(0xffffff), -0.18 + i * 0.12, 1.62, 1.0, Math.PI)
  // cauda grossa
  addMesh(g, new THREE.ConeGeometry(0.34, 1.3, 8), m, 0, 0.95, -1.05, Math.PI / 2)
  // espinhos nas costas
  for (let k = 0; k < 4; k++) addMesh(g, new THREE.ConeGeometry(0.13, 0.32, 6), dark, 0, 1.5, -0.45 + k * 0.3)
  // pernas fortes
  for (const s of [-0.32, 0.32]) addMesh(g, new THREE.CylinderGeometry(0.22, 0.18, 0.75, 8), dark, s, 0.35, 0.05)
  // pézinhos com garrinhas
  for (const s of [-0.32, 0.32]) addMesh(g, new THREE.BoxGeometry(0.3, 0.14, 0.45), dark, s, 0.07, 0.2)
  // bracinhos curtos (cotocos) com garrinhas
  for (const s of [-0.45, 0.45]) {
    addMesh(g, new THREE.CapsuleGeometry(0.08, 0.22, 4, 6), m, s, 1.25, 0.5, -0.8)
    addMesh(g, new THREE.ConeGeometry(0.05, 0.12, 5), pmat(0xffffff), s, 1.1, 0.72, Math.PI / 2)
  }
  figEyes(g, 2.05, 0.7, 0.18, 0.11)
}
function shapeShark(g, base) {
  const m = pmat(base, .5)
  addMesh(g, new THREE.SphereGeometry(0.6, 16, 16), m, 0, 1.2, 0).scale.set(1, 1, 2.1)
  addMesh(g, new THREE.ConeGeometry(0.3, 0.6, 4), m, 0, 1.8, -0.1)
  addMesh(g, new THREE.ConeGeometry(0.42, 0.7, 4), m, 0, 1.2, -1.4, Math.PI / 2)
  addMesh(g, new THREE.SphereGeometry(0.4, 12, 12), pmat(0xffffff), 0, 1.0, 0.5).scale.set(1, 0.8, 1.6)
  figEyes(g, 1.35, 0.9, 0.24, 0.1)
  addLegs(g, base, 0.26, 0.4, 0.2)
}
function shapeOcto(g, base) {
  const m = pmat(base, .5)
  addMesh(g, new THREE.SphereGeometry(0.78, 16, 16), m, 0, 1.65, 0)
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; addMesh(g, new THREE.ConeGeometry(0.16, 1.0, 6), m, Math.cos(a) * 0.55, 0.7, Math.sin(a) * 0.55, Math.PI) }
  figEyes(g, 1.75, 0.62, 0.22, 0.13)
}
function shapeMushroom(g, base) {
  addMesh(g, new THREE.CylinderGeometry(0.42, 0.48, 1.1, 12), pmat(0xfff3e0), 0, 0.9, 0)
  addMesh(g, new THREE.SphereGeometry(0.9, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2), pmat(base), 0, 1.5, 0)
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; addMesh(g, new THREE.SphereGeometry(0.14, 10, 10), pmat(0xffffff), Math.cos(a) * 0.5, 1.7, Math.sin(a) * 0.5) }
  figEyes(g, 0.95, 0.42, 0.16, 0.1)
}
function shapePizza(g) {
  addMesh(g, new THREE.CylinderGeometry(1.0, 1.0, 0.25, 3), pmat(0xe2a829, .6), 0, 1.4, 0, Math.PI / 2, 0, Math.PI)
  for (let i = 0; i < 3; i++) addMesh(g, new THREE.SphereGeometry(0.12, 8, 8), pmat(0xcc2222), (i - 1) * 0.3, 1.5, 0.15)
  figEyes(g, 1.55, 0.16, 0.18, 0.09)
  addLegs(g, 0xe2a829, 0.25, 0.4, 0.2)
}
function shapeBread(g) {
  addMesh(g, new THREE.CapsuleGeometry(0.45, 1.1, 6, 12), pmat(0xd9a066, .7), 0, 1.3, 0)
  figEyes(g, 1.7, 0.42, 0.16, 0.1)
  addLegs(g, 0xd9a066, 0.22, 0.4, 0.2)
}
function shapePenguin(g) {
  addMesh(g, new THREE.CapsuleGeometry(0.55, 0.8, 6, 14), pmat(0x222831), 0, 1.1, 0)
  addMesh(g, new THREE.SphereGeometry(0.45, 14, 14), pmat(0x222831), 0, 1.95, 0)
  addMesh(g, new THREE.SphereGeometry(0.42, 14, 14), pmat(0xffffff), 0, 1.0, 0.28).scale.set(1, 1.2, 0.8)
  addMesh(g, new THREE.ConeGeometry(0.12, 0.32, 8), pmat(0xff9900), 0, 1.9, 0.46, Math.PI / 2)
  figEyes(g, 2.05, 0.4, 0.14, 0.08)
  addLegs(g, 0xff9900, 0.2, 0.3, 0.18)
}
function shapeBug(g, base) {
  addMesh(g, new THREE.SphereGeometry(0.6, 14, 14), pmat(base), 0, 1.3, 0).scale.set(1, 0.85, 1.3)
  for (const z of [-0.15, 0.18]) addMesh(g, new THREE.TorusGeometry(0.5, 0.08, 8, 16), pmat(0x222222), 0, 1.3, z, Math.PI / 2)
  const wing = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })
  for (const s of [-0.5, 0.5]) addMesh(g, new THREE.SphereGeometry(0.35, 10, 10), wing, s, 1.65, -0.1).scale.set(0.4, 1, 0.8)
  figEyes(g, 1.5, 0.5, 0.18, 0.11)
  addLegs(g, base, 0.2, 0.3, 0.18)
}
function shapeAlien(g, base) {
  addMesh(g, new THREE.SphereGeometry(0.7, 16, 16), pmat(base), 0, 1.9, 0).scale.set(1, 1.25, 1)
  addMesh(g, new THREE.CapsuleGeometry(0.3, 0.6, 6, 10), pmat(base), 0, 1.0, 0)
  const blk = new THREE.MeshStandardMaterial({ color: 0x111111 })
  for (const sx of [-0.26, 0.26]) addMesh(g, new THREE.SphereGeometry(0.18, 12, 12), blk, sx, 2.0, 0.5).scale.set(1, 1.5, 0.6)
  addLegs(g, base, 0.22, 0.4, 0.2)
}
function shapeSkull(g) {
  addMesh(g, new THREE.SphereGeometry(0.7, 16, 16), pmat(0xeeeeee, .4), 0, 1.95, 0)
  addMesh(g, new THREE.BoxGeometry(0.7, 0.4, 0.6), pmat(0xeeeeee, .4), 0, 1.5, 0.05)
  const blk = new THREE.MeshBasicMaterial({ color: 0x111111 })
  for (const sx of [-0.25, 0.25]) addMesh(g, new THREE.SphereGeometry(0.16, 10, 10), blk, sx, 2.0, 0.5)
  addMesh(g, new THREE.CapsuleGeometry(0.35, 0.5, 6, 10), pmat(0xdddddd, .5), 0, 0.95, 0)
  addLegs(g, 0xcccccc, 0.22, 0.4, 0.2)
}
function shapeCactus(g) {
  const m = pmat(0x2e8b57)
  addMesh(g, new THREE.CapsuleGeometry(0.45, 1.2, 6, 12), m, 0, 1.3, 0)
  addMesh(g, new THREE.CapsuleGeometry(0.16, 0.5, 6, 8), m, -0.6, 1.5, 0, 0, 0, 0.5)
  addMesh(g, new THREE.CapsuleGeometry(0.16, 0.5, 6, 8), m, 0.6, 1.6, 0, 0, 0, -0.5)
  figEyes(g, 1.6, 0.45, 0.16, 0.1)
}
function shapePepper(g) {
  addMesh(g, new THREE.ConeGeometry(0.5, 1.6, 12), pmat(0xd62828), 0, 1.1, 0, Math.PI)
  addMesh(g, new THREE.CylinderGeometry(0.1, 0.1, 0.35, 6), pmat(0x2e8b57), 0, 1.95, 0)
  figEyes(g, 1.5, 0.45, 0.16, 0.1)
}
function shapeSunflower(g) {
  addMesh(g, new THREE.CylinderGeometry(0.12, 0.12, 1.3, 8), pmat(0x2e8b57), 0, 0.75, 0)
  addMesh(g, new THREE.SphereGeometry(0.45, 16, 16), pmat(0x6b4f1d), 0, 1.75, 0).scale.set(1, 1, 0.4)
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; addMesh(g, new THREE.ConeGeometry(0.14, 0.4, 6), pmat(0xffd400), Math.cos(a) * 0.6, 1.75 + Math.sin(a) * 0.6, 0.0, 0, 0, -a + Math.PI / 2) }
  figEyes(g, 1.75, 0.3, 0.16, 0.1)
}
function shapeRocket(g, base) {
  addMesh(g, new THREE.CylinderGeometry(0.4, 0.4, 1.4, 14), pmat(0xeeeeee, .4, .3), 0, 1.3, 0)
  addMesh(g, new THREE.ConeGeometry(0.4, 0.6, 14), pmat(base), 0, 2.3, 0)
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; addMesh(g, new THREE.ConeGeometry(0.2, 0.5, 4), pmat(base), Math.cos(a) * 0.45, 0.7, Math.sin(a) * 0.45) }
  addMesh(g, new THREE.ConeGeometry(0.3, 0.5, 10), new THREE.MeshBasicMaterial({ color: 0xff8800 }), 0, 0.35, 0, Math.PI)
  figEyes(g, 1.5, 0.42, 0.16, 0.1)
}
function shapeQuad(g, base) {
  const m = pmat(base)
  addMesh(g, new THREE.CapsuleGeometry(0.45, 0.9, 6, 12), m, 0, 1.1, 0, 0, 0, Math.PI / 2)
  addMesh(g, new THREE.CylinderGeometry(0.2, 0.25, 0.7, 8), m, 0, 1.5, 0.5, -0.6)
  addMesh(g, new THREE.SphereGeometry(0.3, 14, 14), m, 0, 1.95, 0.8)
  const legM = pmat(base.clone().offsetHSL(0, 0, -.15))
  for (const sx of [-0.3, 0.3]) for (const sz of [-0.5, 0.5]) addMesh(g, new THREE.CylinderGeometry(0.1, 0.09, 0.85, 8), legM, sx, 0.42, sz)
  figEyes(g, 2.0, 1.05, 0.14, 0.08)
}
function shapeEgg(g) {
  addMesh(g, new THREE.CylinderGeometry(0.9, 0.9, 0.14, 22), pmat(0xffffff), 0, 1.0, 0)
  addMesh(g, new THREE.SphereGeometry(0.36, 16, 16), pmat(0xffcc00), 0, 1.12, 0).scale.set(1, 0.6, 1)
  figEyes(g, 1.18, 0.3, 0.14, 0.08)
  addLegs(g, 0xeeeeee, 0.3, 0.4, 0.2)
}

// nome do personagem → builder de forma
const SHAPE_BY_NAME = {
  'Bananildo': shapeBanana, 'Tank Tonho': shapeRobot, 'Dona Bruxa': shapeCreature,
  'Robô Zé': shapeRobot, 'Gato Ninja': shapeCreature, 'Cogu': shapeMushroom,
  'Capitão Pão': shapeBread, 'Fantasminha': shapeGhost, 'Dino Rex': shapeDino,
  'Alien Glub': shapeAlien, 'Pinguim Frost': shapePenguin, 'Pimentão': shapePepper,
  'Tigrão Léo': shapeCreature, 'Caveirão': shapeSkull, 'Abelha Zum': shapeBug,
  'Polvo Otto': shapeOcto, 'Vovó Punk': shapeCreature, 'Cacto Espeto': shapeCactus,
  'Macaco Doido': shapeCreature, 'Robozão': shapeRobot, 'Florzinha': shapeSunflower,
  'Tubarão Bob': shapeShark, 'Pizza Man': shapePizza, 'Coelho Salta': shapeCreature,
  'Anjinho': shapeCreature, 'Foguetinho': shapeRocket, 'Sapão': shapeCreature,
  'Rei Coroa': shapeCreature, 'Zumbi Zeca': shapeGhost, 'Unicórnia': shapeQuad,
  'Varejeira': shapeBug, 'Dr. Cérebro': shapeAlien, 'Ovo Frito': shapeEgg,
  'Lhama Drama': shapeQuad
}
// toppers (chapéu/coroa/auréola/chifre) pra reforçar alguns personagens
function addTopper(g, name, base) {
  if (name === 'Rei Coroa') { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; addMesh(g, new THREE.ConeGeometry(0.07, 0.25, 5), pmat(0xffd400, .3, .6), Math.cos(a) * 0.3, 2.5, Math.sin(a) * 0.3) } }
  else if (name === 'Anjinho') { addMesh(g, new THREE.TorusGeometry(0.3, 0.05, 8, 18), pmat(0xffe14d), 0, 2.7, 0, Math.PI / 2) }
  else if (name === 'Tigrão Léo') { for (const s of [-0.28, 0.28]) addMesh(g, new THREE.SphereGeometry(0.14, 8, 8), pmat(0xff9f1c), s, 2.45, 0) } // orelhinhas de tigre
  else if (name === 'Coelho Salta') { for (const s of [-0.18, 0.18]) addMesh(g, new THREE.CapsuleGeometry(0.1, 0.5, 4, 8), pmat(0xffd6e0), s, 2.7, 0) } // orelhas de coelho
  else if (name === 'Dona Bruxa') { addMesh(g, new THREE.ConeGeometry(0.4, 0.7, 12), pmat(0x4b0082), 0, 2.7, 0) }
}

// Personagem com o FORMATO 3D do que ele é, com a arma na mão.
function makeFigure(persona, idx, heldWeapon) {
  const g = new THREE.Group()
  const base = new THREE.Color(persona.color)
  const name = (persona.name || '').trim()
  const builder = SHAPE_BY_NAME[name] || shapeCreature
  builder(g, base, persona)
  addTopper(g, name, base)

  // braço IK segurando a arma (mira na direção do alvo)
  addAimArm(g, base, heldWeapon, 0.6, 1.45)
  return g
}

function addAccessory(g, idx, base) {
  const accent = new THREE.MeshStandardMaterial({ color: base.clone().offsetHSL(0.5, 0, 0), roughness: .5 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: .8 })
  const gold = new THREE.MeshStandardMaterial({ color: 0xffd400, metalness: .6, roughness: .3 })
  switch (idx % 8) {
    case 0: { // chapéu/cilindro
      const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.4, 12), dark)
      hat.position.y = 2.55; g.add(hat)
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 14), dark)
      brim.position.y = 2.36; g.add(brim); break
    }
    case 1: { // antena
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), dark)
      stick.position.y = 2.7; g.add(stick)
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), accent)
      ball.position.y = 2.98; g.add(ball); break
    }
    case 2: { // orelhas
      for (const sx of [-0.3, 0.3]) {
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), accent)
        ear.position.set(sx, 2.4, 0); g.add(ear)
      }
      break
    }
    case 3: { // espinhos (mohawk)
      for (let k = -1; k <= 1; k++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 6), accent)
        spike.position.set(0, 2.5, k * 0.18); g.add(spike)
      }
      break
    }
    case 4: { // auréola
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 8, 20), gold)
      halo.rotation.x = Math.PI / 2; halo.position.y = 2.7; g.add(halo); break
    }
    case 5: { // coroa
      const ring = new THREE.Group()
      for (let k = 0; k < 5; k++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.25, 6), gold)
        const a = (k / 5) * Math.PI * 2
        c.position.set(Math.cos(a) * 0.3, 2.55, Math.sin(a) * 0.3)
        ring.add(c)
      }
      g.add(ring); break
    }
    case 6: { // chifres
      for (const sx of [-0.22, 0.22]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35, 6), dark)
        horn.position.set(sx, 2.45, 0); horn.rotation.z = sx > 0 ? -0.3 : 0.3; g.add(horn)
      }
      break
    }
    default: { // mochila/jato
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.25), dark)
      pack.position.set(0, 1.3, -0.45); g.add(pack)
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 8), accent)
      flame.position.set(0, 0.9, -0.5); flame.rotation.x = Math.PI; g.add(flame)
    }
  }
}

function spawnBots() {
  // sorteia 9 personagens distintos, sem repetir o escolhido pelo jogador
  const pool = CHARACTERS.filter(c => c.name !== char.name)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  const chosen = pool.slice(0, BOT_COUNT)

  for (let i = 0; i < BOT_COUNT; i++) {
    const persona = chosen[i]
    const botWeapon = WEAPONS[(Math.random() * WEAPONS.length) | 0]
    const a = Math.random() * Math.PI * 2
    const r = 30 + Math.random() * (ARENA - 40)
    pushBot(persona, botWeapon, Math.cos(a) * r, Math.sin(a) * r)
  }
}

// cria um com (bot) e adiciona à lista
function pushBot(persona, botWeapon, x, z) {
  const mesh = makeFigure(persona, CHARACTERS.indexOf(persona), botWeapon)
  mesh.position.set(x, 0, z)
  scene.add(mesh)
  const hp = 100 + Math.random() * 50
  bots.push({
    mesh, persona, weapon: botWeapon, hp, maxHp: hp, pos: mesh.position,
    dir: Math.random() * Math.PI * 2, changeIn: 0, alive: true,
    speed: 11 + Math.random() * 5, paint: randomPaint(),
    state: 'roam', target: null, retargetIn: Math.random(),
    fireCd: 0.5 + Math.random() * 1.5, strafe: Math.random() < 0.5 ? 1 : -1,
    strafeIn: 0, skill: 0.37 + Math.random() * 0.39
  })
}

// ---------------- Modo Batalha Infinita (multidão via GPU instancing) ----------------
// 16384 inimigos renderizados em 1 draw call (InstancedMesh), estado em typed arrays,
// e grid espacial pra detecção de acerto sem varrer todos a cada tiro.
const CROWD = { max: 16384, count: 0, remaining: 0, mesh: null, x: null, z: null, alive: null, grid: new Map() }
const CELL = 8                                  // tamanho da célula do grid espacial
const _m4 = new THREE.Matrix4()
const _zero = new THREE.Matrix4().makeScale(0, 0, 0)

function crowdStart() {
  const n = CROWD.max
  CROWD.remaining = n; CROWD.count = n
  CROWD.x = new Float32Array(n)
  CROWD.z = new Float32Array(n)
  CROWD.alive = new Uint8Array(n)
  const geo = new THREE.CapsuleGeometry(0.45, 1.0, 4, 8)
  const mat = new THREE.MeshStandardMaterial({ color: char.color, roughness: .6 })
  CROWD.mesh = new THREE.InstancedMesh(geo, mat, n)
  CROWD.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  CROWD.mesh.frustumCulled = false // senão a multidão some quando o capsule-base sai de vista
  scene.add(CROWD.mesh)
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * (ARENA - 16)
    CROWD.x[i] = Math.cos(a) * r; CROWD.z[i] = Math.sin(a) * r; CROWD.alive[i] = 1
    _m4.makeTranslation(CROWD.x[i], 1.0, CROWD.z[i])
    CROWD.mesh.setMatrixAt(i, _m4)
  }
  CROWD.mesh.instanceMatrix.needsUpdate = true
  alive = CROWD.remaining; updateAlive()
}

// move o exército na direção do jogador e reconstrói o grid espacial (1x por frame)
function crowdUpdate(dt) {
  if (!CROWD.mesh) return
  const px = camera.position.x, pz = camera.position.z
  const n = CROWD.count, spd = 8 * dt
  CROWD.grid.clear()
  for (let i = 0; i < n; i++) {
    if (!CROWD.alive[i]) continue
    const dx = px - CROWD.x[i], dz = pz - CROWD.z[i]
    const dist = Math.hypot(dx, dz) || 1
    if (dist > 11) { CROWD.x[i] += dx / dist * spd; CROWD.z[i] += dz / dist * spd }
    else { CROWD.x[i] += -dz / dist * spd * 0.6; CROWD.z[i] += dx / dist * spd * 0.6 } // circula
    _m4.makeTranslation(CROWD.x[i], 1.0, CROWD.z[i])
    CROWD.mesh.setMatrixAt(i, _m4)
    const key = Math.floor(CROWD.x[i] / CELL) + ',' + Math.floor(CROWD.z[i] / CELL)
    let arr = CROWD.grid.get(key); if (!arr) { arr = []; CROWD.grid.set(key, arr) }
    arr.push(i)
  }
  CROWD.mesh.instanceMatrix.needsUpdate = true
}

// ray-marching pelo grid: acha o primeiro inimigo no caminho do tiro (sem varrer os 16384)
function crowdHit(origin, dir, range) {
  const step = CELL * 0.5
  for (let t = 1; t < range; t += step) {
    const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t
    if (y < 0.2 || y > 2.6) continue
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL)
    for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gz = cz - 1; gz <= cz + 1; gz++) {
      const arr = CROWD.grid.get(gx + ',' + gz); if (!arr) continue
      for (const i of arr) {
        if (!CROWD.alive[i]) continue
        const ddx = CROWD.x[i] - x, ddz = CROWD.z[i] - z
        if (ddx * ddx + ddz * ddz < 0.7) return { i, point: new THREE.Vector3(x, y, z) }
      }
    }
  }
  return null
}

function crowdKill(i, point) {
  if (!CROWD.alive[i]) return
  CROWD.alive[i] = 0
  CROWD.mesh.setMatrixAt(i, _zero); CROWD.mesh.instanceMatrix.needsUpdate = true
  dissolveToPixels(point.clone())
  CROWD.remaining--; alive = CROWD.remaining; updateAlive()
  kills++; updateKills(); recordKill(); registerCombo(); sfx.kill()
}

// dano em área (bazuca/granada) usando o grid
function crowdExplode(pos, radius) {
  if (!CROWD.mesh) return
  const r2 = radius * radius, span = Math.ceil(radius / CELL) + 1
  const cx = Math.floor(pos.x / CELL), cz = Math.floor(pos.z / CELL)
  for (let gx = cx - span; gx <= cx + span; gx++) for (let gz = cz - span; gz <= cz + span; gz++) {
    const arr = CROWD.grid.get(gx + ',' + gz); if (!arr) continue
    for (const i of arr.slice()) {
      if (!CROWD.alive[i]) continue
      const ddx = CROWD.x[i] - pos.x, ddz = CROWD.z[i] - pos.z
      if (ddx * ddx + ddz * ddz < r2) crowdKill(i, new THREE.Vector3(CROWD.x[i], 1.2, CROWD.z[i]))
    }
  }
}

// ---------------- Input ----------------
function bindInput() {
  addEventListener('keydown', e => {
    keys[e.code] = true
    if (mode === 'build') { // atalhos do editor
      if (e.code === 'KeyX') deleteObject()
      if (e.code === 'KeyP') toggleBuildPlay()
      const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5 }[e.code]
      if (n !== undefined) selectTool(n)
    }
    if (e.code === 'KeyR') reload()
    if (e.code === 'KeyE' && mode !== 'build') quitMatch() // sair da partida
    if (e.code === 'KeyM') { const m = toggleMute(); feed(m ? '🔇 Som desligado' : '🔊 Som ligado') } // mudo
    if (e.code === 'F3') { fpsOn = !fpsOn; if (fpsEl) fpsEl.style.display = fpsOn ? 'block' : 'none' } // medidor de FPS
    if (e.code === 'KeyG' && running && !spectating) throwGrenade()
    if (e.code === 'KeyP' && mode === 'train') toggleBox() // caixacete: vira caixa
  })
  addEventListener('keyup', e => { keys[e.code] = false })

  const cv = renderer.domElement
  cv.addEventListener('click', () => { if (!mouse.locked) cv.requestPointerLock() })
  document.addEventListener('pointerlockchange', () => {
    mouse.locked = document.pointerLockElement === cv
  })
  document.addEventListener('mousemove', e => {
    if (!mouse.locked) return
    P.yaw -= e.movementX * 0.0022
    P.pitch -= e.movementY * 0.0022
    P.pitch = Math.max(-1.4, Math.min(1.4, P.pitch))
    trainBump('look')
  })
  cv.addEventListener('mousedown', e => {
    if (e.button === 2) { if (mouse.locked) P.aiming = true; return } // 🎯 botão direito = mirar
    if (e.button !== 0) return
    if (!mouse.locked) { cv.requestPointerLock(); return }
    // no editor o clique coloca o objeto; em jogo, atira
    if (mode === 'build' && buildState === 'edit') { placeObject(); return }
    keys.fire = true
    if (running) tryShoot()
  })
  addEventListener('mouseup', e => {
    if (e.button === 0) keys.fire = false
    if (e.button === 2) P.aiming = false
  })
  cv.addEventListener('contextmenu', e => e.preventDefault()) // não abre menu ao mirar
}

function reload() {
  if (P.reloading || P.ammo === maxAmmo() || weapon.ammo === Infinity) return
  P.reloading = true
  sfx.reload()
  setTimeout(() => { P.ammo = maxAmmo(); P.reloading = false; updateAmmo() }, 900 * P.reloadMult)
  document.getElementById('ammo-text').textContent = '...'
}

// ---------------- Loop ----------------
function loop() {
  raf = requestAnimationFrame(loop)
  const dt = Math.min(clock.getDelta(), 0.05)
  if (!running) return
  if (document.hidden) return        // pausa quando a aba não está visível (economiza CPU)
  adaptQuality(dt)                   // resolução dinâmica adaptativa
  if (spectating) updateSpectator(dt)
  else { updatePlayer(dt); updateViewmodel(dt) }
  updateBots(dt)
  updateProjectiles(dt)
  updateGrenades(dt)
  updatePixels(dt)
  updatePowerups(dt)
  updateAmmoCans(dt)
  updatePaintDecals(dt)
  updateBuffs()
  updateBoss(dt); updateTeeth(dt) // no-op quando não há boss ativo
  if (mode === 'build' && buildState === 'edit') updateBuildGhost()
  if (mode === 'infinite') crowdUpdate(dt)
  if (mode === 'train') updateTraining()
  if (settings.thermal) updateHeat()    // vida baixa = mais frio
  if (mode === 'br') updateZone(dt)
  updateLava()
  if (spectating) renderFeeds()
  if (composer) composer.render(); else renderer.render(scene, camera)
}

// Recuo + balanço da arma em primeira pessoa.
let recoil = 0, bobT = 0
function updateViewmodel(dt) {
  if (!viewModel) return
  recoil = Math.max(0, recoil - dt * 6)
  const moving = keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD
  bobT += dt * (moving ? 10 : 3)
  const bob = Math.sin(bobT) * (moving ? 0.015 : 0.005)
  viewModel.position.set(0.32, -0.28 + bob, -0.55 + recoil * 0.12)
  viewModel.rotation.set(-recoil * 0.5, Math.PI, 0)
}

const fwd = new THREE.Vector3()
const right = new THREE.Vector3()

function updatePlayer(dt) {
  // direção a partir do yaw
  fwd.set(Math.sin(P.yaw), 0, Math.cos(P.yaw))
  right.set(Math.sin(P.yaw - Math.PI / 2), 0, Math.cos(P.yaw - Math.PI / 2))

  const move = new THREE.Vector3()
  if (keys.KeyW) move.add(fwd)
  if (keys.KeyS) move.sub(fwd)
  if (keys.KeyD) move.add(right)
  if (keys.KeyA) move.sub(right)
  if (move.lengthSq() > 0) move.normalize()

  // recargas das mecânicas
  if (P.dashCd > 0) P.dashCd -= dt
  if (P.dashTime > 0) P.dashTime -= dt
  if (P.grenadeCd > 0) P.grenadeCd -= dt

  if (move.lengthSq() > 0) trainBump('move')   // tutorial: andou
  let spd = P.speed
  // 🦆 agachar: mais lento e mais baixo
  P.crouching = !!keys.KeyC
  if (P.crouching) { spd *= 0.5; trainBump('crouch') }
  // ⚡ adrenalina: vida baixa = mais veloz
  P.adrenaline = P.hp < P.maxHp * 0.3
  if (P.adrenaline) spd *= 1.3
  // 🏃 dash/esquiva: arranque rápido por um instante
  if (P.dashTime > 0) spd *= 2.6

  P.vel.x = move.x * spd
  P.vel.z = move.z * spd

  // gravidade / pulo
  P.vel.y -= 30 * dt
  if (keys.Space && (P.onGround || P.jumps < P.maxJumps)) {
    if (P.onGround) P.jumps = 0
    if (P.jumps < P.maxJumps) {
      P.vel.y = P.jumpPower
      P.jumps++
      P.onGround = false
      keys.Space = false // exige novo toque pro pulo duplo
      sfx.jump()
      trainBump('jump')
      // 🏃 espaço + andando = dash
      if (move.lengthSq() > 0) tryDash()
    }
  }

  // integra
  const newPos = P.pos.clone()
  newPos.x += P.vel.x * dt
  newPos.z += P.vel.z * dt
  newPos.y += P.vel.y * dt

  // chão
  if (newPos.y <= 1.6) {
    newPos.y = 1.6; P.onGround = true; P.jumps = 0
    // 🤸 trampolim de tinta: arremessa pro alto ao encostar
    if (overBouncePad(newPos.x, newPos.z) && P.vel.y <= 0) {
      P.vel.y = 30; P.onGround = false; sfx.jump()
    } else { P.vel.y = 0 }
  }
  else P.onGround = false

  // borda: no modo boss prende dentro da arena; no BR deixa entrar no mar (pra ser engolido)
  const flat = Math.hypot(newPos.x, newPos.z)
  const edge = mode === 'br' ? ARENA + 6 : ARENA - 2
  if (flat > edge) {
    const k = edge / flat
    newPos.x *= k; newPos.z *= k
  }

  // colisão simples com obstáculos (empurra pra fora no plano XZ)
  for (const o of obstacles) {
    const b = o.box
    if (newPos.x > b.min.x - 1 && newPos.x < b.max.x + 1 &&
        newPos.z > b.min.z - 1 && newPos.z < b.max.z + 1 &&
        newPos.y < b.max.y + 0.5) {
      const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2
      const dx = newPos.x - cx, dz = newPos.z - cz
      if (Math.abs(dx) > Math.abs(dz)) newPos.x = P.pos.x
      else newPos.z = P.pos.z
    }
  }

  P.pos.copy(newPos)

  // 🪖 agachado COM o caixacete → câmera em 3ª pessoa (mostra seu personagem)
  const thirdPerson = mode === 'train' && P.caixacete && P.crouching
  if (playerAvatar) {
    playerAvatar.visible = thirdPerson
    playerAvatar.position.set(P.pos.x, 0, P.pos.z)
    playerAvatar.rotation.y = P.yaw
  }
  if (viewModel) viewModel.visible = !thirdPerson && !P.boxed
  if (thirdPerson) {
    const fwx = Math.sin(P.yaw), fwz = Math.cos(P.yaw)        // pra onde olha
    camera.position.set(P.pos.x - fwx * 5, P.pos.y + 2.4, P.pos.z - fwz * 5) // atrás e acima
    camera.lookAt(P.pos.x + fwx * 2, P.pos.y - 0.2, P.pos.z + fwz * 2)
  } else {
    // câmera 1ª pessoa (abaixa um pouco quando agachado)
    camera.position.copy(P.pos)
    if (P.crouching) camera.position.y -= 0.55
    // 🎯 zoom suave ao mirar
    const targetFov = P.aiming ? 50 : 78
    if (Math.abs(camera.fov - targetFov) > 0.1) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12)
      camera.updateProjectionMatrix()
    }
    const dir = new THREE.Vector3(
      Math.sin(P.yaw) * Math.cos(P.pitch),
      Math.sin(P.pitch),
      Math.cos(P.yaw) * Math.cos(P.pitch)
    )
    camera.lookAt(P.pos.clone().add(dir))
  }

  // mar = água (TOCOU, MORRE — mesmo no ar); poça = lava (precisa estar no chão)
  if (mode === 'br') {
    if (Math.hypot(P.pos.x, P.pos.z) >= ARENA - 1) { envKillPlayer('🌊 Tocou na água — afogou!'); return }
    if (P.onGround && inLava(P.pos.x, P.pos.z)) { envKillPlayer('🌋 Você caiu na LAVA!'); return }
  } else if (mode === 'build' && buildState === 'test' && P.onGround && inLava(P.pos.x, P.pos.z)) {
    P.hp = 0; updateHealth(); feed('🌋 Você caiu na lava!'); playerDown(); return
  }

  // regen de vida
  if (P.regen > 0 && P.hp < P.maxHp) { P.hp = Math.min(P.maxHp, P.hp + P.regen * dt) ; updateHealth() }

  // dano da zona
  if (flat > zone.radius) {
    damagePlayer(zone.dps() * dt, true)
  }

  // tiro
  if (keys.fire) tryShoot()
}

// ---------------- Mecânicas novas ----------------
// 🏃 Dash / esquiva: arranque curto com recarga
function tryDash() {
  if (P.dashCd > 0 || P.dashTime > 0) return
  P.dashTime = 0.2
  P.dashCd = 1.8 / P.dashPower
  sfx.jump()
  trainBump('dash')
}

// 💣 Granada de tinta: arremessa uma bola que explode pintando tudo em volta
function throwGrenade() {
  if (P.grenadeCd > 0) return
  P.grenadeCd = 5
  const color = randomPaint()
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 12, 12),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .5, roughness: .4 })
  )
  const origin = camera.position.clone()
  const dir = new THREE.Vector3(Math.sin(P.yaw) * Math.cos(P.pitch), Math.sin(P.pitch), Math.cos(P.yaw) * Math.cos(P.pitch)).normalize()
  mesh.position.copy(origin)
  scene.add(mesh)
  grenades.push({
    mesh, color,
    vel: dir.multiplyScalar(40).add(new THREE.Vector3(0, 8, 0)), // arremesso em arco
    life: 2.2
  })
  sfx.shoot({ explosive: true })
  feed('💣 Granada de tinta!')
  trainBump('grenade'); unlock('grenade')
}
function updateGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i]
    g.vel.y -= 30 * dt
    g.mesh.position.addScaledVector(g.vel, dt)
    g.mesh.rotation.x += dt * 6; g.mesh.rotation.y += dt * 5
    g.life -= dt
    // estoura ao tocar o chão ou ao acabar o tempo
    if (g.mesh.position.y <= 0.5 || g.life <= 0) {
      const p = g.mesh.position.clone(); p.y = 0.5
      for (let s = 0; s < 6; s++) paintSplat(p.clone().add(new THREE.Vector3((Math.random() - .5) * 8, Math.random() * 2, (Math.random() - .5) * 8)), g.color)
      explode(p, 55) // dano em área (reusa a explosão existente)
      scene.remove(g.mesh); grenades.splice(i, 1)
    }
  }
}

// 🤸 Trampolins de tinta
function overBouncePad(x, z) {
  for (const p of bouncePads) { if (Math.hypot(x - p.x, z - p.z) < p.r) return true }
  return false
}
function spawnBouncePads() {
  bouncePads = []
  const count = 5
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random()
    const r = 40 + Math.random() * (ARENA - 80)
    const x = Math.cos(a) * r, z = Math.sin(a) * r
    if (inLava(x, z)) continue
    const pad = new THREE.Group()
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 0.5, 20),
      new THREE.MeshStandardMaterial({ color: 0x222244, roughness: .6 }))
    base.position.y = 0.25; pad.add(base)
    const top = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 0.3, 20),
      new THREE.MeshStandardMaterial({ color: 0x44ffaa, emissive: 0x22cc88, emissiveIntensity: .6 }))
    top.position.y = 0.55; pad.add(top)
    pad.position.set(x, 0, z)
    scene.add(pad)
    bouncePads.push({ x, z, r: 3.2, mesh: pad })
  }
}

// 🪣 Latas de tinta: recarregam munição e voltam depois de um tempo
function makeAmmoCan() {
  const g = new THREE.Group()
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.4, 14),
    new THREE.MeshStandardMaterial({ color: 0x3bd1ff, metalness: .4, roughness: .4 }))
  g.add(can)
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.2, 14),
    new THREE.MeshStandardMaterial({ color: 0xffe14d }))
  lid.position.y = 0.8; g.add(lid)
  const spr = makeEmojiSprite('🪣'); spr.scale.set(1.1, 1.1, 1.1); spr.position.y = 0.2; g.add(spr)
  return g
}
function spawnAmmoCans() {
  ammoCans = []
  const count = 6
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2
    const r = 25 + Math.random() * (ARENA - 50)
    const x = Math.cos(a) * r, z = Math.sin(a) * r
    if (inLava(x, z)) continue
    const mesh = makeAmmoCan()
    mesh.position.set(x, 1.2, z)
    scene.add(mesh)
    ammoCans.push({ mesh, x, z, active: true, respawn: 0, t: Math.random() * 6 })
  }
}
function updateAmmoCans(dt) {
  for (const c of ammoCans) {
    if (c.active) {
      c.t += dt
      c.mesh.rotation.y += dt * 1.5
      c.mesh.position.y = 1.2 + Math.sin(c.t * 2) * 0.15 // flutua
      if (!spectating && camera.position.distanceTo(c.mesh.position) < 2.4 && (weapon.ammo === Infinity || P.ammo < maxAmmo())) {
        P.ammo = maxAmmo(); updateAmmo()
        feed('🪣 Tinta recarregada!'); sfx.powerup()
        c.active = false; c.mesh.visible = false; c.respawn = 12 // volta em 12s
      }
    } else {
      c.respawn -= dt
      if (c.respawn <= 0) { c.active = true; c.mesh.visible = true }
    }
  }
}

// ---------------- Tiro do jogador ----------------
function tryShoot() {
  if (P.boxed) return // virou caixa: não atira
  const now = clock.elapsedTime
  if (P.reloading) return
  if (now - P.lastShot < 1 / (weapon.fireRate * P.fireRateMult)) return
  if (weapon.ammo !== Infinity && P.ammo <= 0) { reload(); return }
  P.lastShot = now
  if (weapon.ammo !== Infinity) { P.ammo--; updateAmmo() }
  trainBump('shot')

  const origin = camera.position.clone()
  const baseDir = new THREE.Vector3(
    Math.sin(P.yaw) * Math.cos(P.pitch),
    Math.sin(P.pitch),
    Math.cos(P.yaw) * Math.cos(P.pitch)
  ).normalize()

  const spread = weapon.spread * (P.aiming ? 0.25 : 1) // 🎯 mirar deixa o tiro mais preciso
  for (let p = 0; p < weapon.pellets; p++) {
    const dir = baseDir.clone()
    dir.x += (Math.random() - 0.5) * spread
    dir.y += (Math.random() - 0.5) * spread
    dir.z += (Math.random() - 0.5) * spread
    dir.normalize()

    if (weapon.explosive || weapon.projectile) {
      spawnProjectile(origin, dir)
    } else {
      hitscan(origin, dir)
    }
  }
  muzzleFlash(origin, baseDir)
  sfx.shoot(weapon)
  recoil = Math.min(1, recoil + 0.6)
}

const ray = new THREE.Raycaster()
function hitscan(origin, dir) {
  ray.set(origin, dir)
  ray.camera = camera // necessário caso algum Sprite entre no raycast
  ray.far = weapon.range
  // modo Batalha Infinita: testa contra a multidão (grid) em vez dos bots normais
  if (mode === 'infinite') {
    let wallDist = Infinity
    for (const o of obstacles) { const h = ray.intersectObject(o.mesh); if (h.length) wallDist = Math.min(wallDist, h[0].distance) }
    const reach = Math.min(weapon.range, wallDist)
    const ch = crowdHit(origin, dir, reach)
    if (ch) { crowdKill(ch.i, ch.point); tracer(origin, ch.point); showHit() }
    else tracer(origin, origin.clone().add(dir.clone().multiplyScalar(reach)))
    return
  }
  let best = null, bestDist = Infinity, bestPoint = null
  for (const b of bots) {
    if (!b.alive || b.ally) continue // não atira em aliados
    const hit = ray.intersectObject(b.mesh, true)
    if (hit.length && hit[0].distance < bestDist) { bestDist = hit[0].distance; best = b; bestPoint = hit[0].point }
  }
  // boss como alvo (modo boss)
  let bossDist = Infinity
  if (boss && boss.alive) {
    for (const s of boss.parts) {
      const h = ray.intersectObject(s, true)
      if (h.length && h[0].distance < bossDist) bossDist = h[0].distance
    }
  }
  // checa obstáculos bloqueando
  let wallDist = Infinity
  for (const o of obstacles) {
    const h = ray.intersectObject(o.mesh)
    if (h.length) wallDist = Math.min(wallDist, h[0].distance)
  }
  if (bossDist < wallDist && bossDist <= bestDist) {
    damageBoss(weapon.damage * P.dmgMult)
    tracer(origin, origin.clone().add(dir.clone().multiplyScalar(bossDist)))
  } else if (best && bestDist < wallDist) {
    // 💥 tinta na cabeça: dano extra se o tiro acertar a região da cabeça (y ≈ 2.05)
    const head = bestPoint && bestPoint.y > best.mesh.position.y + 1.85
    damageBot(best, weapon.damage * P.dmgMult * (head ? 1.7 : 1))
    if (head) headFeed()
    tracer(origin, best.mesh.position.clone().add(new THREE.Vector3(0, 1.4, 0)))
    showHit()
  } else {
    const end = origin.clone().add(dir.clone().multiplyScalar(Math.min(weapon.range, wallDist)))
    tracer(origin, end)
  }
}

// ---------------- Projéteis (explosivos e dardos) ----------------
function spawnProjectile(origin, dir) {
  const radius = weapon.projRadius || 0.4
  const speed = weapon.projSpeed || 70
  const c = inkColor()
  const mat = weapon.explosive
    ? new THREE.MeshBasicMaterial({ color: c })
    : new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: .8, roughness: .4 })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 12), mat)
  mesh.position.copy(origin)
  mesh.castShadow = true
  scene.add(mesh)
  // alcance: vida suficiente pra percorrer o range da arma
  const life = (weapon.range / speed) + 0.2
  projectiles.push({
    mesh, dir: dir.clone(), speed, life,
    dmg: weapon.damage * P.dmgMult,
    radius, explosive: !!weapon.explosive
  })
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i]
    pr.mesh.position.addScaledVector(pr.dir, pr.speed * dt)
    pr.life -= dt
    let done = pr.life <= 0 || pr.mesh.position.y < 0.2
    let hitBot = null, hitBoss = false
    // colisão com bots inimigos (poupa aliados)
    for (const b of bots) {
      if (b.alive && !b.ally && pr.mesh.position.distanceTo(b.mesh.position) < 1.1 + pr.radius) { hitBot = b; done = true; break }
    }
    // colisão com o boss
    if (!done && boss && boss.alive) {
      for (const s of boss.parts) {
        if (pr.mesh.position.distanceTo(s.position) < (s.userData.hitR || boss.hitR) + pr.radius + 0.8) { hitBoss = true; done = true; break }
      }
    }
    if (!done) {
      for (const o of obstacles) {
        if (o.box.containsPoint(pr.mesh.position)) { done = true; break }
      }
    }
    if (done) {
      if (pr.explosive) {
        explode(pr.mesh.position, pr.dmg)
      } else if (hitBoss) {
        damageBoss(pr.dmg)
      } else if (hitBot) {
        damageBot(hitBot, pr.dmg)
        showHit()
      }
      scene.remove(pr.mesh)
      projectiles.splice(i, 1)
    }
  }
}

function explode(pos, dmg) {
  sfx.explosion()
  if (mode === 'infinite') crowdExplode(pos, 9) // dano em área na multidão
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(6, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.6 })
  )
  flash.position.copy(pos)
  scene.add(flash)
  let s = 1
  const grow = setInterval(() => {
    s += 0.4; flash.scale.setScalar(s); flash.material.opacity -= 0.12
    if (flash.material.opacity <= 0) { clearInterval(grow); scene.remove(flash) }
  }, 30)
  for (const b of bots) {
    if (!b.alive || b.ally) continue // poupa aliados
    const d = b.mesh.position.distanceTo(pos)
    if (d < 9) { damageBot(b, dmg * (1 - d / 9)); showHit() }
  }
  // dano em área no boss
  if (boss && boss.alive && boss.headPos.distanceTo(pos) < 14) damageBoss(dmg)
  // dano ao jogador se perto
  const dp = camera.position.distanceTo(pos)
  if (dp < 9) damagePlayer(dmg * 0.5 * (1 - dp / 9))
}

// ---------------- Efeitos ----------------
// cores vivas de tinta de paintball
const PAINT_COLORS = [0xff3b6b, 0x2b8fff, 0x9ee04d, 0xffe14d, 0xff8a3d, 0xcc44ff, 0x00e5ff, 0xff66cc, 0x44ff88]
function randomPaint() { return PAINT_COLORS[(Math.random() * PAINT_COLORS.length) | 0] }
// cor da tinta escolhida pelo jogador
// (Arco-Íris = -1 → alterna por TODAS as cores do jogo, uma a cada tiro)
function inkColor() {
  if (!ink) return weapon.projColor
  if (ink.color !== -1) return ink.color
  rainbowIdx = (rainbowIdx + 1) % RAINBOW_COLORS.length
  return RAINBOW_COLORS[rainbowIdx]
}

// estoura um borrão de tinta no ponto atingido (várias gotas que se espalham e somem)
function paintSplat(pos, color) {
  const n = 5 + ((Math.random() * 3) | 0)
  for (let i = 0; i < n; i++) {
    const drop = new THREE.Mesh(
      new THREE.SphereGeometry(0.12 + Math.random() * 0.18, 7, 7),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 })
    )
    drop.position.copy(pos)
    const vel = new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 5 + 1, (Math.random() - 0.5) * 6)
    scene.add(drop)
    let life = 0.45
    const tick = setInterval(() => {
      const d = 0.03
      life -= d
      vel.y -= 18 * d
      drop.position.addScaledVector(vel, d)
      drop.material.opacity = Math.max(0, life / 0.45)
      if (life <= 0) { clearInterval(tick); scene.remove(drop) }
    }, 30)
  }
  dropDecal(pos, color) // deixa uma marca no chão embaixo do impacto
}

// marcas de tinta que vão pintando o chão da arena (somem devagar)
let paintDecals = []
function dropDecal(pos, color) {
  if (!scene) return
  const r = 0.7 + Math.random() * 0.8
  const decal = new THREE.Mesh(
    new THREE.CircleGeometry(r, 12),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false })
  )
  decal.rotation.x = -Math.PI / 2
  decal.rotation.z = Math.random() * Math.PI
  decal.position.set(pos.x, 0.03, pos.z) // bem rente ao chão
  scene.add(decal)
  paintDecals.push({ mesh: decal, life: 9 })
  // limita a quantidade pra não pesar (remove a mais antiga)
  if (paintDecals.length > 70) { const old = paintDecals.shift(); scene.remove(old.mesh) }
}
function updatePaintDecals(dt) {
  for (let i = paintDecals.length - 1; i >= 0; i--) {
    const d = paintDecals[i]
    d.life -= dt
    if (d.life <= 0) { scene.remove(d.mesh); paintDecals.splice(i, 1); continue }
    if (d.life < 2) d.mesh.material.opacity = 0.85 * (d.life / 2) // some nos últimos 2s
  }
}

function tracer(a, b) {
  const c = inkColor() // cor de tinta escolhida pelo jogador
  // rastro da bola de tinta + a própria bola colorida
  const mat = new THREE.LineBasicMaterial({ color: c })
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), mat)
  scene.add(line)
  // bola de tinta viajando no rastro
  const bolt = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 8, 8),
    new THREE.MeshBasicMaterial({ color: c })
  )
  bolt.position.copy(b)
  scene.add(bolt)
  setTimeout(() => { scene.remove(line); scene.remove(bolt) }, 110)
  // espirra tinta onde a bola bateu
  paintSplat(b, c)
}

function muzzleFlash(origin, dir) {
  const c = inkColor()
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 8, 8),
    new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.95 })
  )
  flash.position.copy(origin).add(dir.clone().multiplyScalar(1.3))
  scene.add(flash)
  // luz dinâmica curtinha pra "estourar" a cena
  const light = new THREE.PointLight(c, 6, 14)
  light.position.copy(flash.position)
  scene.add(light)
  setTimeout(() => { scene.remove(flash); scene.remove(light) }, 70)
  // pisca a mira
  const ch = document.querySelector('.crosshair')
  if (ch) { ch.style.color = '#fff'; ch.style.transform = 'translate(-50%,-50%) scale(1.5)'
    setTimeout(() => { ch.style.color = ''; ch.style.transform = 'translate(-50%,-50%)' }, 70) }
}

// ---------------- Bots IA ----------------
const tmp = new THREE.Vector3()
// alvo sentinela que representa o jogador (atualizado a cada frame)
const PLAYER_TARGET = { me: true, alive: false }
const losRay = new THREE.Raycaster()

function updateBots(dt) {
  PLAYER_TARGET.alive = !spectating && P.hp > 0 && !P.boxed // virou caixa = invisível pros coms
  for (const b of bots) {
    if (!b.alive) continue
    if (b.ally) { updateAlly(b, dt); continue } // modo boss: aliados têm IA própria
    updateBotAI(b, dt)
  }
}

// posição do alvo (jogador ou rival)
function botTargetPos(t) { return t.me ? camera.position : t.mesh.position }

// escolhe o melhor alvo dentro do alcance de visão (com leve preferência pelo jogador)
function pickBotTarget(b, sight) {
  let best = null, bd = Infinity
  if (PLAYER_TARGET.alive) {
    const d = camera.position.distanceTo(b.mesh.position)
    if (d < sight * 1.15) { best = PLAYER_TARGET; bd = d * 0.8 } // 0.8 = "caça" o jogador de preferência
  }
  for (const o of bots) {
    if (o === b || !o.alive || o.ally) continue
    const d = b.mesh.position.distanceTo(o.mesh.position)
    if (d < sight && d < bd) { bd = d; best = o }
  }
  return best
}

// há linha de visão livre (sem obstáculo no meio)?
function hasLineOfSight(from, to) {
  if (!obstacles.length) return true
  tmp.set(to.x - from.x, 0, to.z - from.z)
  const dist = tmp.length()
  if (dist < 0.1) return true
  tmp.normalize()
  losRay.set(new THREE.Vector3(from.x, 1.4, from.z), tmp)
  losRay.far = dist
  for (const o of obstacles) {
    if (losRay.intersectObject(o.mesh).length) return false
  }
  return true
}

function updateBotAI(b, dt) {
  const w = b.weapon
  const flat = Math.hypot(b.pos.x, b.pos.z)
  const sight = Math.min(84, (w.range || 60) + 11)

  // 1) reavalia o alvo de tempos em tempos (ou se o atual morreu/sumiu)
  b.retargetIn -= dt
  if (b.retargetIn <= 0 || !b.target || !b.target.alive) {
    b.target = pickBotTarget(b, sight)
    b.retargetIn = 0.35 + Math.random() * 0.5
  }

  // 2) define o estado: fugir com vida baixa, engajar com alvo, senão vagar
  if (b.target && b.hp < b.maxHp * 0.28) b.state = 'flee'
  else if (b.target) b.state = 'engage'
  else b.state = 'roam'

  // 3) decide o vetor de movimento
  let mvx = 0, mvz = 0
  const outOfZone = flat > zone.radius - 6
  if (outOfZone) {
    // prioridade máxima: voltar pra dentro da zona
    mvx = -b.pos.x; mvz = -b.pos.z
  } else if (b.state === 'engage') {
    const tp = botTargetPos(b.target)
    const dx = tp.x - b.pos.x, dz = tp.z - b.pos.z
    const dist = Math.hypot(dx, dz) || 1
    const ux = dx / dist, uz = dz / dist
    const ideal = Math.min(sight * 0.55, (w.range || 50) * 0.7) // distância de combate preferida
    // troca o lado do strafe de vez em quando (movimento imprevisível)
    b.strafeIn -= dt
    if (b.strafeIn <= 0) { b.strafe *= -1; b.strafeIn = 0.8 + Math.random() * 1.6 }
    const px = -uz * b.strafe, pz = ux * b.strafe // vetor perpendicular (circula o alvo)
    if (dist > ideal + 6) { mvx = ux; mvz = uz }            // longe: aproxima
    else if (dist < ideal - 6) { mvx = -ux; mvz = -uz }     // perto demais: recua (kiting)
    else { mvx = px; mvz = pz }                              // na distância boa: circula
    mvx += px * 0.4; mvz += pz * 0.4                         // sempre um tanto de strafe
  } else if (b.state === 'flee') {
    const tp = botTargetPos(b.target)
    const ux = b.pos.x - tp.x, uz = b.pos.z - tp.z
    const d = Math.hypot(ux, uz) || 1
    // foge do alvo, mas puxando pro centro pra não cair na zona
    mvx = (ux / d) * 0.7 - (b.pos.x / (flat || 1)) * 0.3
    mvz = (uz / d) * 0.7 - (b.pos.z / (flat || 1)) * 0.3
  } else {
    // vaguear: muda de rumo de tempos em tempos
    b.changeIn -= dt
    if (b.changeIn <= 0) { b.dir = Math.random() * Math.PI * 2; b.changeIn = 1 + Math.random() * 2 }
    mvx = Math.cos(b.dir); mvz = Math.sin(b.dir)
  }
  // normaliza
  const len = Math.hypot(mvx, mvz) || 1
  mvx /= len; mvz /= len

  // 4) evita lava: se o próximo passo cai na lava, tenta desviar; senão, freia
  const slowed = clock.elapsedTime < (b.slowUntil || 0) // 🐌 lento pela tinta
  const step = b.speed * (slowed ? 0.55 : 1) * dt
  let nx = b.pos.x + mvx * step, nz = b.pos.z + mvz * step
  if (inLava(nx, nz)) {
    let dodged = false
    for (const ang of [0.7, -0.7, 1.4, -1.4, 2.5]) {
      const ca = Math.cos(ang), sa = Math.sin(ang)
      const rx = mvx * ca - mvz * sa, rz = mvx * sa + mvz * ca
      if (!inLava(b.pos.x + rx * step, b.pos.z + rz * step)) {
        mvx = rx; mvz = rz; nx = b.pos.x + rx * step; nz = b.pos.z + rz * step; dodged = true; break
      }
    }
    if (!dodged) { nx = b.pos.x; nz = b.pos.z } // melhor parar do que pular na lava
  }
  // quanto andou neste frame (0..1) → alimenta a caminhada IK
  const moved = Math.min(1, Math.hypot(nx - b.pos.x, nz - b.pos.z) / (b.speed * dt + 1e-3))
  b.pos.x = nx; b.pos.z = nz
  animateLegs(b.mesh, moved, dt)

  // ainda assim preso na lava (sem saída)
  if (inLava(b.pos.x, b.pos.z)) { killBot(b, false, 'foi pego pela lava 🌋'); return }

  // 5) orientação: encara o alvo quando engajado, senão olha pra onde anda
  if (b.state === 'engage') {
    const tp = botTargetPos(b.target)
    b.mesh.rotation.y = Math.atan2(tp.x - b.pos.x, tp.z - b.pos.z)
    // mira IK do braço na altura do alvo
    const ty = (tp.y || 0) + (b.target.me ? 0 : 1.4)   // jogador usa a câmera; rivais miram no tronco
    const horiz = Math.hypot(tp.x - b.pos.x, tp.z - b.pos.z) || 1
    aimArm(b.mesh, Math.atan2(ty - 1.45, horiz))
  } else {
    b.mesh.rotation.y = Math.atan2(mvx, mvz)
    aimArm(b.mesh, -0.05) // arma levemente abaixada
  }

  // 6) dano da zona
  if (flat > zone.radius) { b.hp -= zone.dps() * dt; if (b.hp <= 0) { killBot(b, false, 'foi pego pela zona ⛈️'); return } }

  // 7) combate: só atira se engajado, no alcance da arma e com linha de visão
  b.fireCd -= dt
  if (b.state === 'engage' && b.fireCd <= 0) {
    const tp = botTargetPos(b.target)
    const dist = Math.hypot(tp.x - b.pos.x, tp.z - b.pos.z)
    if (dist < (w.range || 60) && hasLineOfSight(b.pos, tp)) {
      // cadência da arma do bot, bem mais lenta que a do jogador (pra ser justo)
      b.fireCd = (1 / (w.fireRate || 3)) * (2.5 + Math.random() * 1.2)
      botTracer(b.mesh.position, tp, b.paint)
      // precisão: cai bastante com a distância, sobe com a perícia individual
      let hitChance = Math.max(0.05, Math.min(0.7, b.skill - (dist / (w.range || 60)) * 0.52))
      if (b.target.me && P.crouching) hitChance *= 0.45 // 🦆 agachado é mais difícil de acertar
      if (Math.random() < hitChance) {
        const dmg = (w.damage || 10) * (0.5 + Math.random() * 0.55)
        if (b.target.me) damagePlayer(dmg, false, b)
        else damageBot(b.target, dmg, false)
      }
    } else {
      b.fireCd = 0.3 // sem tiro limpo: tenta de novo logo (e continua se reposicionando)
    }
  }
}

function botTracer(a, b, color = 0xff3344) {
  const from = a.clone(); from.y += 1.6
  const geo = new THREE.BufferGeometry().setFromPoints([from, b])
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color }))
  scene.add(line)
  setTimeout(() => scene.remove(line), 60)
  paintSplat(b, color)
}

// ================= MODO BOSS =================

// 4 aliados (coms) que lutam ao seu lado contra o chefe
function spawnAllies() {
  const pool = CHARACTERS.filter(c => c.name !== char.name)
  for (let i = pool.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[pool[i], pool[j]] = [pool[j], pool[i]] }
  for (let i = 0; i < 4; i++) {
    const persona = pool[i]
    const idx = CHARACTERS.indexOf(persona)
    const w = WEAPONS[(Math.random() * WEAPONS.length) | 0]
    const a = (i / 4) * Math.PI * 2
    const mesh = makeFigure(persona, idx, w)
    mesh.position.set(Math.cos(a) * 9, 0, Math.sin(a) * 9)
    // marcador de aliado: anel verde no chão
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.12, 8, 20),
      new THREE.MeshBasicMaterial({ color: 0x3cff8e }))
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.1; mesh.add(ring)
    scene.add(mesh)
    bots.push({
      mesh, persona, weapon: w, ally: true, hp: 220, maxHp: 220, pos: mesh.position,
      dir: Math.random() * Math.PI * 2, changeIn: 0, lastShot: Math.random(), alive: true,
      speed: 13 + Math.random() * 4
    })
  }
}

function updateAlly(b, dt) {
  b.changeIn -= dt
  if (b.changeIn <= 0) { b.dir = Math.random() * Math.PI * 2; b.changeIn = 1.5 + Math.random() * 2 }
  let mvx = Math.cos(b.dir), mvz = Math.sin(b.dir)
  // mantém-se perto do jogador
  const toP = Math.hypot(P.pos.x - b.pos.x, P.pos.z - b.pos.z)
  if (toP > 45 && !spectating) { mvx = (P.pos.x - b.pos.x) / toP; mvz = (P.pos.z - b.pos.z) / toP }
  // foge da cabeça do boss se colado
  if (boss && boss.alive) {
    const toB = Math.hypot(boss.x - b.pos.x, boss.z - b.pos.z)
    if (toB < 14) { mvx = (b.pos.x - boss.x) / toB; mvz = (b.pos.z - boss.z) / toB }
  }
  b.pos.x += mvx * b.speed * dt
  b.pos.z += mvz * b.speed * dt
  b.mesh.rotation.y = Math.atan2(mvx, mvz)
  animateLegs(b.mesh, 1, dt)                 // caminhada IK
  if (boss) aimArm(b.mesh, Math.atan2((boss.headPos ? boss.headPos.y : 6) - 1.45, 30)) // mira IK no boss
  if (inLava(b.pos.x, b.pos.z)) { killAlly(b, 'caiu na lava 🌋'); return }
  // atira no boss
  b.lastShot -= dt
  if (b.lastShot <= 0 && boss && boss.alive) {
    b.lastShot = 0.6 + Math.random() * 0.7
    if (Math.random() < 0.75) damageBoss(16 + Math.random() * 20)
    botTracerColor(b.mesh.position, boss.headPos, 0x3cff8e)
  }
}

function killAlly(b, cause) {
  if (!b.alive) return
  b.alive = false
  carryAway(b.mesh)
  feed(`🤝 ${b.persona.emoji} ${b.persona.name} ${cause || 'foi derrotado'}`)
  updateAllies()
  checkBossEnd()
}

function damageAlly(b, dmg) {
  b.hp -= dmg
  b.mesh.traverse(o => { const m = o.material; if (m && m.isMeshStandardMaterial) { m.emissive.setHex(0xff0000); m.emissiveIntensity = 1 } })
  setTimeout(() => b.mesh.traverse(o => { const m = o.material; if (m && m.isMeshStandardMaterial) m.emissiveIntensity = 0 }), 80)
  if (b.hp <= 0) killAlly(b, 'foi derrotado ☠️')
}

function botTracerColor(a, b, color) {
  const from = a.clone(); from.y += 1.6
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([from, b]),
    new THREE.LineBasicMaterial({ color }))
  scene.add(line)
  setTimeout(() => scene.remove(line), 70)
}

// ---- 24 bosses (5 arquétipos de corpo, ataques variados) ----
// arch: snake | spider | golem | flyer | blob
// atk: spread (leque no alvo) | aimed (tiro único rápido) | burst (anel radial)
// proj: cone | sphere | box | tetra
const BOSSES = [
  { name: 'Cascacobra',     emoji: '🐍', arch: 'snake',  hp: 4500, color: 0x8a9a3a, color2: 0xd9c27a, size: 1.0, speed: 17, atk: 'spread', n: 5, proj: 'cone',   projColor: 0xffffff, projDmg: 13, projSpeed: 62, fire: 1.3 },
  { name: 'Vermezilla',     emoji: '🪱', arch: 'snake',  hp: 4200, color: 0xcf5b8a, color2: 0xe89ab5, size: 1.1, speed: 15, atk: 'spread', n: 3, proj: 'sphere', projColor: 0x88ff44, projDmg: 16, projSpeed: 52, fire: 1.1 },
  { name: 'Tubaterra',      emoji: '🦈', arch: 'snake',  hp: 5200, color: 0x4f6d7a, color2: 0xbfd0d8, size: 1.2, speed: 19, atk: 'spread', n: 4, proj: 'cone',   projColor: 0xeeeeff, projDmg: 18, projSpeed: 66, fire: 1.2 },
  { name: 'Dragãozinho',    emoji: '🐲', arch: 'snake',  hp: 4800, color: 0x2e8b3a, color2: 0xff7733, size: 1.1, speed: 18, atk: 'spread', n: 5, proj: 'sphere', projColor: 0xff5500, projDmg: 17, projSpeed: 60, fire: 1.0 },
  { name: 'Krakenzão',      emoji: '🐉', arch: 'snake',  hp: 6500, color: 0x6a3fb5, color2: 0xb388ff, size: 1.4, speed: 14, atk: 'spread', n: 7, proj: 'sphere', projColor: 0xcc66ff, projDmg: 20, projSpeed: 56, fire: 1.4 },

  { name: 'Aranhêmona',     emoji: '🕷️', arch: 'spider', hp: 4000, color: 0x2b2b2b, color2: 0x7a3fb5, size: 1.0, speed: 16, atk: 'spread', n: 4, proj: 'sphere', projColor: 0x9b59ff, projDmg: 15, projSpeed: 58, fire: 1.0 },
  { name: 'Caranguejão',    emoji: '🦀', arch: 'spider', hp: 4600, color: 0xff5533, color2: 0xffaa88, size: 1.2, speed: 13, atk: 'burst',  n: 12, proj: 'sphere', projColor: 0x66e0ff, projDmg: 14, projSpeed: 48, fire: 1.6 },
  { name: 'Escorpianox',    emoji: '🦂', arch: 'spider', hp: 4400, color: 0x9b1d20, color2: 0x3a0a0a, size: 1.1, speed: 17, atk: 'aimed',  n: 1, proj: 'cone',   projColor: 0xffee55, projDmg: 28, projSpeed: 80, fire: 0.9 },
  { name: 'Mantis Mortal',  emoji: '🦗', arch: 'spider', hp: 4200, color: 0x6ab04c, color2: 0x2e8b57, size: 1.0, speed: 20, atk: 'spread', n: 3, proj: 'tetra',  projColor: 0xaaffaa, projDmg: 19, projSpeed: 70, fire: 0.9 },

  { name: 'Golemzão',       emoji: '🗿', arch: 'golem',  hp: 6000, color: 0x888888, color2: 0x555555, size: 1.2, speed: 9,  atk: 'spread', n: 3, proj: 'box',    projColor: 0xaa8855, projDmg: 24, projSpeed: 46, fire: 1.5 },
  { name: 'Robozilla',      emoji: '🤖', arch: 'golem',  hp: 5500, color: 0x9aa7b0, color2: 0x607d8b, size: 1.2, speed: 11, atk: 'aimed',  n: 1, proj: 'box',    projColor: 0xff3366, projDmg: 30, projSpeed: 85, fire: 0.8 },
  { name: 'Lavolder',       emoji: '🌋', arch: 'golem',  hp: 5800, color: 0x6e2b1d, color2: 0xff4400, size: 1.3, speed: 8,  atk: 'burst',  n: 10, proj: 'sphere', projColor: 0xff5500, projDmg: 18, projSpeed: 44, fire: 1.8 },
  { name: 'Geleiroso',      emoji: '🧊', arch: 'golem',  hp: 5200, color: 0xbfe6ff, color2: 0x88c0ff, size: 1.2, speed: 10, atk: 'spread', n: 5, proj: 'tetra',  projColor: 0xaadfff, projDmg: 16, projSpeed: 58, fire: 1.1 },
  { name: 'Reizão Caveira', emoji: '💀', arch: 'golem',  hp: 6200, color: 0xeeeeee, color2: 0xffd400, size: 1.3, speed: 10, atk: 'burst',  n: 14, proj: 'cone',   projColor: 0xffffff, projDmg: 17, projSpeed: 50, fire: 1.6 },

  { name: 'Olhão Voador',   emoji: '👁️', arch: 'flyer',  hp: 3800, color: 0xff5050, color2: 0xffffff, size: 1.0, speed: 18, atk: 'aimed',  n: 1, proj: 'sphere', projColor: 0xff2222, projDmg: 26, projSpeed: 90, fire: 0.8 },
  { name: 'Abelhão Rei',    emoji: '🐝', arch: 'flyer',  hp: 4000, color: 0xffc107, color2: 0x2b2b2b, size: 1.0, speed: 22, atk: 'spread', n: 6, proj: 'cone',   projColor: 0xffe14d, projDmg: 12, projSpeed: 72, fire: 0.8 },
  { name: 'Medusão',        emoji: '🪼', arch: 'flyer',  hp: 4300, color: 0xb5179e, color2: 0xff9ff3, size: 1.1, speed: 14, atk: 'burst',  n: 10, proj: 'sphere', projColor: 0xff66ff, projDmg: 15, projSpeed: 50, fire: 1.4 },
  { name: 'Fantasmão',      emoji: '👻', arch: 'flyer',  hp: 3900, color: 0xf0f0f0, color2: 0xccccff, size: 1.1, speed: 16, atk: 'spread', n: 4, proj: 'sphere', projColor: 0xddddff, projDmg: 16, projSpeed: 54, fire: 1.0 },
  { name: 'Trovãozão',      emoji: '⚡', arch: 'flyer',  hp: 4500, color: 0x2233aa, color2: 0xffff66, size: 1.1, speed: 20, atk: 'aimed',  n: 1, proj: 'tetra',  projColor: 0xffff00, projDmg: 24, projSpeed: 95, fire: 0.7 },

  { name: 'Bolha Tóxica',   emoji: '☢️', arch: 'blob',   hp: 4400, color: 0x6fd66f, color2: 0xaaff66, size: 1.2, speed: 12, atk: 'burst',  n: 11, proj: 'sphere', projColor: 0x88ff44, projDmg: 15, projSpeed: 46, fire: 1.5 },
  { name: 'Polvossauro',    emoji: '🐙', arch: 'blob',   hp: 4800, color: 0xb5179e, color2: 0x7a0f6a, size: 1.3, speed: 13, atk: 'spread', n: 6, proj: 'sphere', projColor: 0x9b1d6a, projDmg: 16, projSpeed: 52, fire: 1.1 },
  { name: 'Cogumelão',      emoji: '🍄', arch: 'blob',   hp: 5000, color: 0xe8584d, color2: 0xfff3b0, size: 1.3, speed: 10, atk: 'burst',  n: 9, proj: 'sphere',  projColor: 0xffaacc, projDmg: 14, projSpeed: 42, fire: 1.7 },
  { name: 'Florcarnívora',  emoji: '🌺', arch: 'blob',   hp: 4600, color: 0xff2e88, color2: 0x2e8b57, size: 1.2, speed: 11, atk: 'spread', n: 5, proj: 'tetra',  projColor: 0x66ff88, projDmg: 17, projSpeed: 56, fire: 1.0 },
  { name: 'Dentucão',       emoji: '🦷', arch: 'blob',   hp: 5400, color: 0xffffff, color2: 0xffd9e0, size: 1.3, speed: 12, atk: 'spread', n: 7, proj: 'cone',   projColor: 0xffffff, projDmg: 15, projSpeed: 60, fire: 1.2 }
]

function bossMat(c) { return new THREE.MeshStandardMaterial({ color: c, roughness: .6 }) }
function addEyes(parent, sx, sy, fz, sz) {
  for (const x of [-sx, sx]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(sz, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0xaa5500, emissiveIntensity: .6 }))
    e.position.set(x, sy, fz); parent.add(e)
    const p = new THREE.Mesh(new THREE.SphereGeometry(sz * 0.45, 8, 8), new THREE.MeshBasicMaterial({ color: 0x111111 }))
    p.position.set(x, sy, fz + sz * 0.7); parent.add(p)
  }
}

function buildSnake(def, skin, belly) {
  const s = def.size, parts = []
  const head = new THREE.Mesh(new THREE.SphereGeometry(5 * s, 22, 18), skin)
  head.scale.set(1.1, 0.85, 1.5); head.castShadow = true; head.userData.hitR = 5 * s
  scene.add(head); parts.push(head)
  addEyes(head, 1.8, 1.8, 2.2, 1)
  for (const sx of [-1.4, 1.4]) {
    const fang = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3, 8), new THREE.MeshStandardMaterial({ color: 0xffffff }))
    fang.position.set(sx, -2.4, 2.6); fang.rotation.x = Math.PI; head.add(fang)
  }
  const N = 20
  for (let i = 1; i < N; i++) {
    const r = 4.4 * s * (1 - (i / N) * 0.55)
    const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), i % 2 ? skin : belly)
    seg.castShadow = true; seg.userData.hitR = r; scene.add(seg); parts.push(seg)
  }
  const rattle = new THREE.Mesh(new THREE.ConeGeometry(2.2 * s, 5, 10), new THREE.MeshStandardMaterial({ color: 0xb08030 }))
  rattle.userData.hitR = 2.2 * s; scene.add(rattle); parts.push(rattle)
  return { parts, head, segmented: true, baseY: 6 * s }
}

// body único (esfera/caixa) + enfeites, para os arquétipos não-segmentados
function buildBody(def, skin, belly) {
  const s = def.size
  const g = new THREE.Group()
  const R = 6 * s
  let body
  if (def.arch === 'golem') {
    body = new THREE.Mesh(new THREE.BoxGeometry(8 * s, 10 * s, 6 * s), skin)
    body.userData.hitR = 6 * s
    // cabeça, braços e pernas
    const head = new THREE.Mesh(new THREE.BoxGeometry(4 * s, 4 * s, 4 * s), skin); head.position.y = 7 * s; g.add(head)
    addEyes(head, 1, 0.3, 2 * s, 0.7)
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(2 * s, 7 * s, 2 * s), belly); arm.position.set(sx * 6 * s, -1 * s, 0); g.add(arm)
      const leg = new THREE.Mesh(new THREE.BoxGeometry(2.6 * s, 6 * s, 2.6 * s), belly); leg.position.set(sx * 2.5 * s, -8 * s, 0); g.add(leg)
    }
  } else if (def.arch === 'spider') {
    body = new THREE.Mesh(new THREE.SphereGeometry(R, 18, 16), skin)
    body.userData.hitR = R
    const abd = new THREE.Mesh(new THREE.SphereGeometry(R * 1.1, 16, 14), belly); abd.position.set(0, 0, -R * 1.3); g.add(abd)
    addEyes(body, 1.4, 1.5, R * 0.9, 0.9)
    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? -1 : 1, k = i % 4
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * s, 0.3 * s, 11 * s, 6), belly)
      leg.position.set(side * R, -1, (k - 1.5) * 2.4 * s)
      leg.rotation.z = side * 1.1; leg.rotation.x = (k - 1.5) * 0.2; g.add(leg)
    }
  } else if (def.arch === 'flyer') {
    body = new THREE.Mesh(new THREE.SphereGeometry(R, 20, 16), skin)
    body.userData.hitR = R
    addEyes(body, 1.5, 0.5, R * 0.92, 1.4)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 1.5, 0.5 * s, 8, 28), belly)
    ring.rotation.x = Math.PI / 2; g.add(ring)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      const orb = new THREE.Mesh(new THREE.SphereGeometry(1.2 * s, 10, 10), belly)
      orb.position.set(Math.cos(a) * R * 1.5, 0, Math.sin(a) * R * 1.5); g.add(orb)
    }
  } else { // blob
    body = new THREE.Mesh(new THREE.SphereGeometry(R, 20, 16), skin)
    body.userData.hitR = R
    addEyes(body, 1.6, 1, R * 0.9, 1.3)
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2, t = Math.random() * Math.PI
      const bump = new THREE.Mesh(new THREE.SphereGeometry((1.5 + Math.random() * 2) * s, 10, 10), belly)
      bump.position.set(Math.sin(t) * Math.cos(a) * R, Math.cos(t) * R, Math.sin(t) * Math.sin(a) * R); g.add(bump)
    }
  }
  body.castShadow = true
  g.add(body)
  scene.add(g)
  const baseY = def.arch === 'golem' ? 10 * s : (def.arch === 'flyer' ? 13 * s : R + 1)
  // posiciona o grupo; usamos a posição do grupo como "head"
  return { parts: [g], head: g, body, segmented: false, baseY, hitR: body.userData.hitR }
}

function spawnBoss(name) {
  const def = (name && BOSSES.find(b => b.name === name)) || BOSSES[(Math.random() * BOSSES.length) | 0]
  const skin = bossMat(def.color), belly = bossMat(def.color2 || def.color)
  const built = def.arch === 'snake' ? buildSnake(def, skin, belly) : buildBody(def, skin, belly)
  boss = {
    def, name: def.name, emoji: def.emoji, mats: [skin, belly],
    parts: built.parts, head: built.head, body: built.body, segmented: built.segmented,
    baseY: built.baseY, hitR: built.hitR || (built.parts[0].userData.hitR || 6),
    trail: [], hp: def.hp, maxHp: def.hp, alive: true,
    x: 0, z: -90, dir: Math.PI / 2, t: 0, lastShot: 2.5,
    headPos: new THREE.Vector3(0, built.baseY, -90)
  }
  feed(`${def.emoji} ${def.name} apareceu!`)
  updateBossBar()
}

function updateBoss(dt) {
  if (!boss || !boss.alive) return
  boss.t += dt
  const targetPos = (!spectating) ? camera.position : (bots.find(b => b.ally && b.alive) || {}).pos
  let desired = boss.dir
  if (targetPos) desired = Math.atan2(targetPos.z - boss.z, targetPos.x - boss.x)
  let diff = ((desired - boss.dir + Math.PI * 3) % (Math.PI * 2)) - Math.PI
  boss.dir += Math.max(-1.0 * dt, Math.min(1.0 * dt, diff))
  boss.dir += Math.sin(boss.t * 2) * dt * 0.5
  const speed = boss.def.speed
  boss.x += Math.cos(boss.dir) * speed * dt
  boss.z += Math.sin(boss.dir) * speed * dt
  const r = Math.hypot(boss.x, boss.z)
  if (r > ARENA - 45) { boss.x *= (ARENA - 45) / r; boss.z *= (ARENA - 45) / r; boss.dir += Math.PI }

  if (boss.segmented) {
    boss.trail.unshift({ x: boss.x, z: boss.z })
    if (boss.trail.length > 520) boss.trail.pop()
    boss.head.position.set(boss.x, boss.baseY, boss.z)
    boss.head.rotation.y = -boss.dir
    const spacing = 15
    for (let i = 1; i < boss.parts.length; i++) {
      const tp = boss.trail[Math.min(boss.trail.length - 1, i * spacing)] || { x: boss.x, z: boss.z }
      const y = (boss.baseY - 2.4) + Math.sin(boss.t * 5 - i * 0.7) * 1.5
      boss.parts[i].position.set(tp.x, y, tp.z)
    }
    boss.headPos.set(boss.x, boss.baseY, boss.z)
  } else {
    const bob = Math.sin(boss.t * 3) * 0.9
    boss.head.position.set(boss.x, boss.baseY + bob, boss.z)
    boss.head.rotation.y = -boss.dir + Math.PI / 2
    boss.headPos.set(boss.x, boss.baseY + bob, boss.z)
  }

  boss.lastShot -= dt
  if (boss.lastShot <= 0) {
    boss.lastShot = boss.def.fire + Math.random() * 0.6
    bossAttack(targetPos)
  }
}

function bossAttack(targetPos) {
  const def = boss.def, up = new THREE.Vector3(0, 1, 0)
  if (def.atk === 'burst') {
    const N = def.n || 10
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2
      spawnBossProj(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)))
    }
    return
  }
  if (!targetPos) return
  const base = new THREE.Vector3(targetPos.x - boss.headPos.x, (targetPos.y || 1.6) - boss.headPos.y, targetPos.z - boss.headPos.z).normalize()
  if (def.atk === 'aimed') { spawnBossProj(base); return }
  const N = def.n || 5, half = (N - 1) / 2
  for (let k = -half; k <= half; k++) spawnBossProj(base.clone().applyAxisAngle(up, k * 0.16))
}

function spawnBossProj(dir) {
  const def = boss.def
  let geo
  if (def.proj === 'cone') geo = new THREE.ConeGeometry(0.5, 2, 8)
  else if (def.proj === 'box') geo = new THREE.BoxGeometry(1.2, 1.2, 1.2)
  else if (def.proj === 'tetra') geo = new THREE.TetrahedronGeometry(0.9)
  else geo = new THREE.SphereGeometry(0.7, 10, 10)
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: def.projColor, emissive: def.projColor, emissiveIntensity: .4 }))
  m.position.copy(boss.headPos)
  const d = dir.clone().normalize()
  if (def.proj === 'cone') m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d)
  scene.add(m)
  teeth.push({ mesh: m, dir: d, speed: def.projSpeed, life: 5, dmg: def.projDmg })
}

function updateTeeth(dt) {
  for (let i = teeth.length - 1; i >= 0; i--) {
    const t = teeth[i]
    t.mesh.position.addScaledVector(t.dir, t.speed * dt)
    t.life -= dt
    let done = t.life <= 0 || t.mesh.position.y < 0.3
    if (!done && !spectating && t.mesh.position.distanceTo(camera.position) < 2.4) { damagePlayer(t.dmg, false, null); done = true }
    if (!done) for (const b of bots) {
      if (b.ally && b.alive && t.mesh.position.distanceTo(b.mesh.position) < 2.4) { damageAlly(b, t.dmg); done = true; break }
    }
    if (done) { scene.remove(t.mesh); teeth.splice(i, 1) }
  }
}

function damageBoss(dmg) {
  if (!boss || !boss.alive) return
  boss.hp -= dmg
  showHit()
  for (const m of boss.mats) { m.emissive = m.emissive || new THREE.Color(); m.emissive.setHex(0x661111); m.emissiveIntensity = 0.8 }
  setTimeout(() => { for (const m of boss.mats) m.emissiveIntensity = 0 }, 70)
  updateBossBar()
  if (boss.hp <= 0) { boss.hp = 0; killBoss() }
}

function killBoss() {
  boss.alive = false
  for (const s of boss.parts) scene.remove(s)
  for (let i = teeth.length - 1; i >= 0; i--) { scene.remove(teeth[i].mesh); teeth.splice(i, 1) }
  feed(`${boss.emoji} ${boss.name} DERROTADO!`)
  updateBossBar()
  bossVictory()
}

function checkBossEnd() {
  if (!running || mode !== 'boss') return
  if (boss && !boss.alive) return
  const alliesLeft = bots.some(b => b.ally && b.alive)
  if (spectating && !alliesLeft) bossDefeat()
}

function bossVictory() {
  stopRun(); showSpectateHud(false); sfx.win()
  bossEndCard('🏆 CHEFE DERROTADO!', `Vocês derrotaram a ${boss ? boss.name : 'Cascacobra'} 🐍 trabalhando em equipe!`, '🏆')
}
function bossDefeat() {
  stopRun(); showSpectateHud(false); sfx.lose()
  bossEndCard('☠️ EQUIPE DIZIMADA', `A ${boss ? boss.name : 'Cascacobra'} foi forte demais desta vez.`, '☠️')
}
function bossEndCard(title, sub, rank) {
  stopMusic()
  document.getElementById('endscreen').classList.remove('hidden')
  document.getElementById('end-title').textContent = title
  document.getElementById('end-sub').textContent = sub
  document.getElementById('end-kills').textContent = kills
  document.getElementById('end-rank').textContent = rank
}

// ================= CRAZY BUILD (editor de níveis) =================
const BUILD_TOOLS = [
  { key: 'box',      emoji: '📦', name: 'Caixa' },
  { key: 'pillar',   emoji: '🗼', name: 'Pilar' },
  { key: 'ramp',     emoji: '🛗', name: 'Rampa' },
  { key: 'platform', emoji: '⬛', name: 'Plataforma' },
  { key: 'enemy',    emoji: '👾', name: 'Inimigo' },
  { key: 'powerup',  emoji: '⚡', name: 'Power-up' },
  { key: 'lava',     emoji: '🌋', name: 'Lava' }
]

// cria o mesh de um objeto do editor
function makeBuildMesh(type) {
  if (type === 'box') {
    const m = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 8), new THREE.MeshStandardMaterial({ color: 0x00e5ff, roughness: .7 }))
    m.position.y = 4; return { mesh: m, obstacle: true }
  }
  if (type === 'pillar') {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 18, 14), new THREE.MeshStandardMaterial({ color: 0x9b5de5, roughness: .7 }))
    m.position.y = 9; return { mesh: m, obstacle: true }
  }
  if (type === 'ramp') {
    const m = new THREE.Mesh(new THREE.BoxGeometry(10, 2, 14), new THREE.MeshStandardMaterial({ color: 0xffd400, roughness: .7 }))
    m.rotation.x = -0.5; m.position.y = 3; return { mesh: m, obstacle: true }
  }
  if (type === 'platform') {
    const m = new THREE.Mesh(new THREE.BoxGeometry(16, 2, 16), new THREE.MeshStandardMaterial({ color: 0xff2e88, roughness: .8 }))
    m.position.y = 1; return { mesh: m, obstacle: true }
  }
  if (type === 'lava') {
    const m = new THREE.Mesh(new THREE.CircleGeometry(7, 28),
      new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0xff5500, emissiveIntensity: 1.2, roughness: .4 }))
    m.rotation.x = -Math.PI / 2; m.position.y = 0.06
    return { mesh: m, obstacle: false, lavaR: 7 }
  }
  if (type === 'enemy') {
    const g = new THREE.Group()
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.25, 8, 22), new THREE.MeshBasicMaterial({ color: 0xff3344 }))
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.2; g.add(ring)
    const spr = makeEmojiSprite('👾'); spr.position.y = 2.4; g.add(spr)
    return { mesh: g, obstacle: false }
  }
  // powerup
  const g = new THREE.Group()
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.25, 8, 22), new THREE.MeshBasicMaterial({ color: 0xffe14d }))
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.2; g.add(ring)
  const spr = makeEmojiSprite('⚡'); spr.position.y = 2.4; g.add(spr)
  return { mesh: g, obstacle: false }
}

function startBuild() {
  buildState = 'edit'; buildTool = 0; placed = []
  const built = makeBuildMesh('box')
  ghost = built.mesh
  ghost.traverse(o => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.45 } })
  scene.add(ghost)
  renderBuildPalette()
  document.getElementById('build-hud').classList.remove('hidden')
  feed('🛠️ Crazy Build: clique para colocar, X apaga, P joga')
}

function renderBuildPalette() {
  const pal = document.getElementById('build-palette')
  pal.innerHTML = ''
  BUILD_TOOLS.forEach((t, i) => {
    const b = document.createElement('div')
    b.className = 'tool-btn' + (i === buildTool ? ' active' : '')
    b.innerHTML = `<span class="ico">${t.emoji}</span><span class="nm">${t.name}</span><span class="hk">[${i + 1}]</span>`
    b.onclick = () => selectTool(i)
    pal.appendChild(b)
  })
}

function selectTool(i) {
  if (i < 0 || i >= BUILD_TOOLS.length) return
  buildTool = i
  if (ghost) scene.remove(ghost)
  const built = makeBuildMesh(BUILD_TOOLS[i].key)
  ghost = built.mesh
  ghost.traverse(o => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.45 } })
  scene.add(ghost)
  renderBuildPalette()
}

// ponto no chão para onde a câmera aponta (limitado)
const groundPt = new THREE.Vector3()
function aimGround() {
  const dir = new THREE.Vector3(Math.sin(P.yaw) * Math.cos(P.pitch), Math.sin(P.pitch), Math.cos(P.yaw) * Math.cos(P.pitch))
  let t = dir.y < -0.05 ? -camera.position.y / dir.y : 30
  t = Math.min(Math.max(t, 4), 70)
  groundPt.copy(camera.position).addScaledVector(dir, t)
  groundPt.y = 0
  const r = Math.hypot(groundPt.x, groundPt.z)
  if (r > ARENA - 6) { groundPt.x *= (ARENA - 6) / r; groundPt.z *= (ARENA - 6) / r }
  return groundPt
}

function updateBuildGhost() {
  if (!ghost) return
  const p = aimGround()
  ghost.position.x = p.x; ghost.position.z = p.z
}

function placeObject() {
  if (buildState !== 'edit') return
  const p = aimGround()
  const type = BUILD_TOOLS[buildTool].key
  const built = makeBuildMesh(type)
  built.mesh.position.x = p.x; built.mesh.position.z = p.z
  built.mesh.traverse(o => { if (o.isMesh) o.castShadow = true })
  scene.add(built.mesh)
  const item = { type, mesh: built.mesh, x: p.x, z: p.z, obstacle: built.obstacle }
  if (built.obstacle) { item.box = new THREE.Box3().setFromObject(built.mesh); obstacles.push(item) }
  if (built.lavaR) { item.r = built.lavaR; lavaMats.push(built.mesh.material) } // brilho pulsante
  placed.push(item)
}

function deleteObject() {
  if (buildState !== 'edit' || !placed.length) return
  const p = aimGround()
  let best = -1, bd = 8
  placed.forEach((it, i) => { const d = Math.hypot(it.x - p.x, it.z - p.z); if (d < bd) { bd = d; best = i } })
  if (best < 0) return
  const it = placed[best]
  scene.remove(it.mesh)
  placed.splice(best, 1)
  const oi = obstacles.indexOf(it); if (oi >= 0) obstacles.splice(oi, 1)
}

function toggleBuildPlay() {
  if (buildState === 'edit') enterTest()
  else exitTest()
}

function enterTest() {
  buildState = 'test'
  if (ghost) ghost.visible = false
  document.getElementById('build-palette').style.display = 'none'
  document.getElementById('build-tip').textContent = 'Jogando seu nível! P: voltar a editar'
  // spawna inimigos e power-ups nos marcadores
  for (const it of placed) {
    if (it.type === 'enemy') spawnEnemyAt(it.x, it.z)
    if (it.type === 'powerup') { spawnPowerupAt(it.x, it.z); it.mesh.visible = false }
  }
  feed('▶ Testando o nível!')
}

function exitTest() {
  buildState = 'edit'
  // remove inimigos e power-ups gerados
  for (const b of bots) scene.remove(b.mesh)
  bots = []
  for (const u of powerups) scene.remove(u.mesh)
  powerups = []
  for (const it of placed) if (it.mesh) it.mesh.visible = true
  if (ghost) ghost.visible = true
  document.getElementById('build-palette').style.display = ''
  document.getElementById('build-tip').textContent = 'Clique: colocar · X: apagar · P: jogar/editar · WASD+mouse: mover'
  P.hp = P.maxHp; updateHealth()
}

function spawnEnemyAt(x, z) {
  const persona = STORY_CHARACTERS[(Math.random() * STORY_CHARACTERS.length) | 0]
  const w = WEAPONS[(Math.random() * WEAPONS.length) | 0]
  const mesh = makeFigure(persona, (Math.random() * 8) | 0, w)
  mesh.position.set(x, 0, z)
  scene.add(mesh)
  bots.push({
    mesh, persona, weapon: w, hp: 120 + Math.random() * 50, pos: mesh.position,
    dir: Math.random() * Math.PI * 2, changeIn: 0, lastShot: Math.random() * 2, alive: true,
    speed: 9 + Math.random() * 6
  })
}

function spawnPowerupAt(x, z) {
  const p = POWERUPS[(Math.random() * POWERUPS.length) | 0]
  const mesh = makePowerupMesh(p)
  mesh.position.set(x, 1.6, z)
  scene.add(mesh)
  powerups.push({ mesh, p, x, z, t: Math.random() * 6 })
}

// ---------------- Dano / mortes ----------------
function damageBot(b, dmg, byPlayer = true) {
  b.hp -= dmg
  // 🐌 tinta gruda: o adversário acertado fica mais lento por um tempinho
  if (b.alive && !b.ally) b.slowUntil = clock.elapsedTime + 2.5
  // tinta acertou: pisca com uma cor de tinta e espirra um borrão no corpo
  const splat = randomPaint()
  b.mesh.traverse(o => {
    const m = o.material
    if (m && m.isMeshStandardMaterial) { m.emissive.setHex(splat); m.emissiveIntensity = 1 }
  })
  setTimeout(() => b.mesh.traverse(o => {
    const m = o.material
    if (m && m.isMeshStandardMaterial) m.emissiveIntensity = 0
  }), 80)
  paintSplat(b.mesh.position.clone().add(new THREE.Vector3(0, 1.4, 0)), splat)
  if (b.hp <= 0) killBot(b, byPlayer, byPlayer ? null : 'foi todo pintado por um rival 🎨')
}

// byPlayer=true credita abate ao jogador; senão é morte de ambiente/rival (cause = frase).
function killBot(b, byPlayer, cause) {
  if (!b.alive) return
  b.alive = false
  // Batalha Infinita: vira pixels (sem feed) e conta regressiva de 9999
  if (mode === 'infinite') {
    carryAway(b.mesh) // desfaz em pixels azuis e remove
    const i = bots.indexOf(b); if (i >= 0) bots.splice(i, 1)
    alive = Math.max(0, alive - 1)
    if (byPlayer) { kills++; updateKills(); registerCombo(); sfx.kill() }
    updateAlive()
    return
  }
  carryAway(b.mesh) // robô voador leva o corpo embora (em vez de sumir)
  alive--
  const who = b.persona ? `${b.persona.emoji} ${b.persona.name}` : 'um adversário'
  if (byPlayer) {
    kills++; updateKills(); feed(`Você encheu de tinta ${who} 🎨`); sfx.kill()
    recordKill()                             // conquistas (total de tintas)
    registerCombo()                          // conta a sequência de tintas
    captureHighlight(`🎨 Você pintou ${who}!`) // salva o melhor momento
  }
  else feed(`${who} ${cause || 'saiu pintado'}`)
  updateAlive()
  checkWin()
}

function damagePlayer(dmg, byZone, attacker) {
  if (mode === 'infinite' || mode === 'train') return // vida infinita (Batalha Infinita / treino)
  if (P.invincible) return // power-up estrela
  const amount = dmg * P.dmgTakenMult
  P.lastHurt = clock.elapsedTime
  P.hp -= amount
  flashDamage()
  if (amount > 0) sfx.hurt()
  if (P.hp <= 0) { P.hp = 0; updateHealth(); playerDown(); return }
  updateHealth()
}

// morte do jogador: no build volta a editar (renasce); BR/boss vira espectador
function playerDown() {
  sfx.death()
  if (mode === 'build') { feed('🎨 Você ficou todo pintado — voltando ao editor'); exitTest() }
  else enterSpectator()
}

// morte instantânea por ambiente (água/lava) — ignora vida
function envKillPlayer(msg) {
  if (!running || spectating || P.invincible || mode === 'infinite' || mode === 'train') return
  P.hp = 0
  updateHealth()
  feed(msg)
  sfx.death()
  enterSpectator()
}

// ---------------- Zona ----------------
function updateZone(dt) {
  zone.next -= dt
  if (zone.next <= 0 && zone.target > 16) {
    zone.target = Math.max(16, zone.target * 0.6)
    zone.next = 22
    zone.phase++
    feed(`⛈️ A zona está encolhendo! (fase ${zone.phase})`)
  }
  if (zone.radius > zone.target) {
    zone.radius = Math.max(zone.target, zone.radius - 6 * dt)
    zone.mesh.scale.set(zone.radius / ARENA, 1, zone.radius / ARENA)
  }
  document.getElementById('zone-timer').textContent = Math.ceil(zone.next) + 's'
}
zone.dps = () => 4 + zone.phase * 3

// ---------------- Robô voador coletor ----------------
// Ao ser derrotado, o personagem se desfaz em pixels azuis que sobem voando até a sala.
function carryAway(payload) {
  dissolveToPixels(payload.position.clone().add(new THREE.Vector3(0, 1.2, 0)))
  scene.remove(payload)
}

// estoura uma nuvem de pixels (cubinhos) azuis que voam pra cima
function dissolveToPixels(pos, big = false) {
  if (!scene) return
  if (pixelBursts.length > 24) return // orçamento de partículas (evita travar com muitas mortes)
  const n = big ? 230 : 80 // 5x mais pixels
  const parts = []
  for (let i = 0; i < n; i++) {
    const px = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.2, 0.2),
      new THREE.MeshBasicMaterial({ color: i % 2 ? 0x00e5ff : 0x2b8fff, transparent: true })
    )
    px.position.copy(pos).add(new THREE.Vector3((Math.random() - .5) * 1.6, Math.random() * 2, (Math.random() - .5) * 1.6))
    scene.add(px)
    parts.push({
      mesh: px,
      vel: new THREE.Vector3((Math.random() - .5) * 4, 7 + Math.random() * 7, (Math.random() - .5) * 4),
      spin: (Math.random() - .5) * 10
    })
  }
  pixelBursts.push({ parts, t: 0, life: big ? 3.2 : 1.8 })
}

function updatePixels(dt) {
  for (let i = pixelBursts.length - 1; i >= 0; i--) {
    const b = pixelBursts[i]
    b.t += dt
    const k = Math.max(0, 1 - b.t / b.life)
    for (const p of b.parts) {
      p.vel.y += 16 * dt // acelera pra cima, voando até a sala
      p.mesh.position.addScaledVector(p.vel, dt)
      p.mesh.rotation.x += p.spin * dt; p.mesh.rotation.y += p.spin * dt
      p.mesh.material.opacity = k
    }
    if (b.t >= b.life) { for (const p of b.parts) scene.remove(p.mesh); pixelBursts.splice(i, 1) }
  }
}

// ---------------- Sala dos monitores (espectador) ----------------
const ROOM_POS = new THREE.Vector3(0, 600, 0)
const ROOM_CAM = ROOM_POS.clone().add(new THREE.Vector3(0, 1, 8))
const ROOM_LOOK = ROOM_POS.clone().add(new THREE.Vector3(0, 1, -6))

function participantsList() {
  const list = [{ emoji: char.emoji, name: char.name, me: true, bot: null }]
  for (const b of bots) list.push({ emoji: b.persona.emoji, name: b.persona.name, me: false, bot: b })
  return list
}
function infoAlive(info) { return info.me ? false : info.bot.alive }

function drawScreen(ctx, info, alive) {
  ctx.fillStyle = alive ? '#0a1a14' : '#1a0a0a'
  ctx.fillRect(0, 0, 256, 200)
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'
  for (let y = 0; y < 200; y += 4) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke() }
  ctx.font = '90px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(info.emoji, 128, 86)
  ctx.font = 'bold 22px sans-serif'; ctx.fillStyle = '#fff'
  ctx.fillText(info.name.slice(0, 14), 128, 150)
  ctx.font = 'bold 20px sans-serif'
  ctx.fillStyle = info.me ? '#ffd400' : (alive ? '#3cff8e' : '#ff5050')
  ctx.fillText(info.me ? 'VOCÊ ☠️' : (alive ? 'EM JOGO' : 'ELIMINADO'), 128, 178)
}

const FEED_LAYER = 1  // sala fica na layer 1; câmeras de feed só veem a layer 0 (arena)

function makeMonitor(info) {
  // canvas estático: usado pra "VOCÊ" e "ELIMINADO"
  const c = document.createElement('canvas'); c.width = 256; c.height = 200
  const ctx = c.getContext('2d')
  drawScreen(ctx, info, infoAlive(info))
  const staticTex = new THREE.CanvasTexture(c)

  // câmera + alvo de render do feed ao vivo (segue o jogador)
  const rt = new THREE.WebGLRenderTarget(320, 256)
  const feedCam = new THREE.PerspectiveCamera(72, 320 / 256, 0.1, 600)
  feedCam.layers.set(0) // só a arena (sem a sala) -> evita espelho infinito

  const useFeed = !info.me && infoAlive(info)
  const border = info.me ? 0xffd400 : (infoAlive(info) ? 0x3cff8e : 0xff5050)
  const frameMat = new THREE.MeshStandardMaterial({ color: border, emissive: border, emissiveIntensity: .4 })
  const frame = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.7, 0.2), frameMat)
  const screenMat = new THREE.MeshBasicMaterial({ map: useFeed ? rt.texture : staticTex })
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 2.3), screenMat)
  screen.position.z = 0.12
  // etiqueta com nome+emoji sobreposta no canto (sempre visível)
  const tag = makeEmojiSprite(info.emoji)
  tag.scale.set(0.55, 0.55, 0.55); tag.position.set(-1.1, 0.85, 0.2)
  const g = new THREE.Group(); g.add(frame); g.add(screen); g.add(tag)
  return { group: g, ctx, staticTex, screenMat, frameMat, info, feedCam, rt, showingFeed: useFeed }
}

// troca feed<->estático quando alguém morre e atualiza a cor da moldura
function refreshMonitors() {
  for (const ref of monitorRefs) {
    const alive = infoAlive(ref.info)
    const border = ref.info.me ? 0xffd400 : (alive ? 0x3cff8e : 0xff5050)
    ref.frameMat.color.setHex(border); ref.frameMat.emissive.setHex(border)
    const useFeed = !ref.info.me && alive
    if (useFeed !== ref.showingFeed) {
      ref.showingFeed = useFeed
      if (useFeed) ref.screenMat.map = ref.rt.texture
      else { drawScreen(ref.ctx, ref.info, alive); ref.staticTex.needsUpdate = true; ref.screenMat.map = ref.staticTex }
      ref.screenMat.needsUpdate = true
    }
  }
}

// renderiza os feeds ao vivo nos alvos (a ~30fps pra não pesar)
let feedTick = 0
function renderFeeds() {
  if (feedTick++ % 2) return
  const prevAuto = renderer.shadowMap.autoUpdate
  renderer.shadowMap.autoUpdate = false
  for (const ref of monitorRefs) {
    if (!ref.showingFeed) continue
    const b = ref.info.bot
    const rot = b.mesh.rotation.y, fx = Math.sin(rot), fz = Math.cos(rot)
    ref.feedCam.position.set(b.pos.x - fx * 7, 5, b.pos.z - fz * 7)
    ref.feedCam.lookAt(b.pos.x + fx * 4, 1.8, b.pos.z + fz * 4)
    renderer.setRenderTarget(ref.rt)
    renderer.render(scene, ref.feedCam)
  }
  renderer.setRenderTarget(null)
  renderer.shadowMap.autoUpdate = prevAuto
}

function buildSpectatorRoom() {
  monitorRefs = []
  const room = new THREE.Group()
  room.position.copy(ROOM_POS)
  const dim = new THREE.MeshStandardMaterial({ color: 0x14161f, roughness: 1 })
  const W = 30, H = 14, D = 22
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.4, D), dim); floor.position.y = -H / 2; room.add(floor)
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(W, 0.4, D), dim); ceil.position.y = H / 2; room.add(ceil)
  const back = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x0c0e15, roughness: 1 }))
  back.position.z = -D / 2; room.add(back)
  for (const sx of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.4, H, D), dim)
    wall.position.x = sx * W / 2; room.add(wall)
  }
  // grade de monitores na parede do fundo
  const list = participantsList()
  const cols = 5, gapX = 4.2, gapY = 3.4
  list.forEach((info, k) => {
    const col = k % cols, row = (k / cols) | 0
    const ref = makeMonitor(info)
    ref.group.position.set((col - (cols - 1) / 2) * gapX, 2.2 - row * gapY, -D / 2 + 0.5)
    room.add(ref.group)
    monitorRefs.push(ref)
  })
  const desk = new THREE.Mesh(new THREE.BoxGeometry(W - 6, 1.2, 2),
    new THREE.MeshStandardMaterial({ color: 0x222633 }))
  desk.position.set(0, -3.4, -3.5); room.add(desk)
  const lamp = new THREE.PointLight(0x88ccff, 60, 60); lamp.position.set(0, 4, 2); room.add(lamp)
  room.add(new THREE.AmbientLight(0x445566, 1.2))
  scene.add(room)
  // sala vai pra layer 1; câmera principal passa a enxergar layer 0 + 1
  room.traverse(o => o.layers.set(FEED_LAYER))
  camera.layers.enable(FEED_LAYER)
}

// Entra no modo espectador: robô leva a câmera à sala; a partida CONTINUA.
function enterSpectator() {
  if (spectating || !running) return
  spectating = true
  if (mode !== 'boss') { playerRank = alive; alive = Math.max(1, alive - 1); updateAlive() }
  if (mouse.locked) document.exitPointerLock()
  if (viewModel) { camera.remove(viewModel); viewModel = null }
  buildSpectatorRoom()
  dissolveToPixels(camera.position.clone(), true) // você vira pixels azuis e sobe pra sala
  spectator.start = camera.position.clone()
  spectator.t = 0; spectator.flying = true; spectator.refreshT = 0
  showSpectateHud(true)
  feed('🎨 Você foi todo pintado — assistindo. Tecle [E] para sair')
  if (mode === 'boss') checkBossEnd() // perde só se todos os aliados também caírem
  else checkWin()
}

function updateSpectator(dt) {
  // atualiza as telas ~2x por segundo
  spectator.refreshT += dt
  if (spectator.refreshT > 0.5) { refreshMonitors(); spectator.refreshT = 0 }

  if (spectator.flying) {
    spectator.t = Math.min(1, spectator.t + dt / 3.2)
    const e = spectator.t < .5 ? 2 * spectator.t * spectator.t : 1 - Math.pow(-2 * spectator.t + 2, 2) / 2
    camera.position.lerpVectors(spectator.start, ROOM_CAM, e)
    camera.position.y += Math.sin(e * Math.PI) * 40
    camera.lookAt(ROOM_LOOK)
    if (spectator.t >= 1) spectator.flying = false
  } else {
    // parado na sala, com leve vai-e-vem pra dar vida
    const t = clock.elapsedTime
    camera.position.set(ROOM_CAM.x + Math.sin(t * 0.4) * 1.6, ROOM_CAM.y, ROOM_CAM.z)
    camera.lookAt(ROOM_LOOK)
  }
}

function showSpectateHud(on) {
  const hud = document.getElementById('hud')
  let hint = document.getElementById('spectate-hint')
  if (on) {
    hud.classList.add('spectating')
    if (!hint) { hint = document.createElement('div'); hint.id = 'spectate-hint'; hud.appendChild(hint) }
    hint.innerHTML = '☠️ <b>ELIMINADO</b> — assistindo a partida &nbsp;·&nbsp; <b>[E]</b> sair'
    hint.style.display = 'block'
  } else {
    hud.classList.remove('spectating')
    if (hint) hint.style.display = 'none'
  }
}

// ---------------- Fim de partida ----------------
function stopRun() {
  running = false
  cancelAnimationFrame(raf)
  if (mouse.locked) document.exitPointerLock()
  // limpa estado visual do treino/caixa
  P.boxed = false
  const ov = document.getElementById('box-overlay'); if (ov) ov.style.display = 'none'
  const tm = document.getElementById('train-msg'); if (tm) tm.style.display = 'none'
}

function checkWin() {
  if (mode === 'build') { if (buildState === 'test' && !bots.some(b => b.alive)) feed('🏁 Nível limpo! [P] para editar'); return }
  if (mode === 'boss' || mode === 'train' || mode === 'infinite') return
  if (alive > 1) return
  if (spectating) { stopRun(); showSpectateHud(false); showEndCard('spectate') }
  else { stopRun(); showEndCard('win') }
}

// tecla E: sair da partida a qualquer momento
function quitMatch() {
  if (!running) return
  stopRun(); showSpectateHud(false)
  showEndCard(spectating ? 'spectate' : 'quit')
}

function showEndCard(mode) {
  stopMusic()
  if (mode === 'win' || mode === 'train') sfx.win()
  else if (mode === 'spectate') sfx.lose()
  else sfx.ui()
  document.getElementById('endscreen').classList.remove('hidden')
  const champ = bots.find(b => b.alive)
  const titles = { win: 'VITÓRIA NO PAINTBALL! 🏆', spectate: 'PARTIDA ENCERRADA 📺', quit: 'VOCÊ SAIU DA PARTIDA 🚪', train: '🎓 TREINO COMPLETO!' }
  let sub
  if (mode === 'win') sub = `${char.name} ficou sem nenhuma mancha de tinta no Crazy Royale!`
  else if (mode === 'train') sub = 'Mandou bem no treino com o caixacete! Agora é só arrasar. 🪖'
  else if (mode === 'spectate') sub = champ
    ? `${champ.persona.emoji} ${champ.persona.name} venceu. Você terminou em #${playerRank}.`
    : `Você assistiu até o fim. Posição: #${playerRank}.`
  else sub = `${char.name} saiu da arena de paintball.`
  document.getElementById('end-title').textContent = titles[mode]
  document.getElementById('end-sub').textContent = sub
  document.getElementById('end-kills').textContent = kills
  const rank = mode === 'win' ? 1 : (spectating ? playerRank : alive)
  document.getElementById('end-rank').textContent = '#' + rank
  // registra derrota/vitória e oferece o treino após 20 derrotas seguidas
  if (mode === 'win') recordWin()
  else if (mode === 'spectate') { recordLoss(); if (lossStreak >= 5) setTimeout(showTrainPrompt, 500) }
}

// ---------------- HUD ----------------
function resetHud() {
  document.getElementById('hud-weapon-name').textContent = `${weapon.emoji} ${weapon.name}`
  updateHealth(); updateAmmo(); updateAlive(); updateKills()
  const bossBar = document.getElementById('boss-bar')
  const zoneT = document.querySelector('.zone-timer')
  const label = document.querySelector('.alive-counter').firstChild
  if (mode === 'br') {
    bossBar.classList.add('hidden')
    if (zoneT) zoneT.style.display = ''
    label.textContent = '🧍 AINDA EM JOGO: '
  } else {
    if (zoneT) zoneT.style.display = 'none'
    label.textContent = mode === 'boss' ? '🤝 ALIADOS: ' : '👾 INIMIGOS: '
    updateBossBar() // controla a visibilidade da barra conforme houver boss
  }
  document.getElementById('endscreen').classList.add('hidden')
}
function updateBossBar() {
  const bar = document.getElementById('boss-bar')
  if (!bar || mode === 'br') return
  if (!boss) { bar.classList.add('hidden'); return } // sem boss ativo (ex.: capítulo de luta)
  bar.classList.remove('hidden')
  const pct = Math.max(0, boss.hp / boss.maxHp * 100)
  document.getElementById('boss-fill').style.width = pct + '%'
  document.getElementById('boss-name').textContent = `${boss.emoji} ${boss.name}` + (boss.alive ? '' : ' — DERROTADO!')
}
function updateAllies() {
  const n = bots.filter(b => b.ally && b.alive).length + (spectating ? 0 : 1)
  document.getElementById('alive-count').textContent = n
}
function updateHealth() {
  const pct = Math.max(0, P.hp / P.maxHp * 100)
  document.getElementById('health-fill').style.width = pct + '%'
  document.getElementById('health-text').textContent = Math.ceil(P.hp)
}
function updateAmmo() {
  document.getElementById('ammo-text').textContent = weapon.ammo === Infinity ? '∞' : P.ammo
}
function updateAlive() {
  if (mode === 'boss') return updateAllies()
  if (mode === 'build') { document.getElementById('alive-count').textContent = bots.filter(b => b.alive).length; return }
  document.getElementById('alive-count').textContent = Math.max(1, alive)
}
function updateKills() { document.getElementById('kill-count').textContent = kills }

let hitTimer
function showHit() {
  const h = document.getElementById('hitmarker')
  h.textContent = '🎨'; h.classList.remove('show'); void h.offsetWidth; h.classList.add('show')
  sfx.hit()
}
let lastHeadFeed = 0
function headFeed() {
  const now = clock.elapsedTime
  if (now - lastHeadFeed < 0.8) return // não floodar com armas rápidas
  lastHeadFeed = now
  feed('💥 Tinta na cabeça!')
}
const SPLASH_RGB = ['255,59,107', '43,143,255', '158,224,77', '255,225,77', '204,68,255', '0,229,255']
function flashDamage() {
  const hud = document.getElementById('hud')
  const c = SPLASH_RGB[(Math.random() * SPLASH_RGB.length) | 0] // respingo de tinta colorido
  hud.style.boxShadow = `inset 0 0 130px 50px rgba(${c},.5)`
  clearTimeout(hitTimer)
  hitTimer = setTimeout(() => { hud.style.boxShadow = 'none' }, 130)
}
function feed(text) {
  const fd = document.getElementById('kill-feed')
  const line = document.createElement('div')
  line.className = 'feed-line'; line.textContent = text
  fd.appendChild(line)
  setTimeout(() => line.remove(), 3500)
  while (fd.children.length > 5) fd.firstChild.remove()
}

// ---------------- Combos de tinta ----------------
const COMBO_MSGS = { 2: 'DUPLA PINTADA! 🎨🎨', 3: 'TRIPLA! 🔥', 4: 'MASSACRE DE TINTA! 💥', 5: 'INCRÍVEL! 🌈' }
function registerCombo() {
  const now = clock.elapsedTime
  if (now > comboUntil) combo = 0   // a sequência expirou: recomeça
  combo++
  comboUntil = now + 3.5            // 3,5s pra emendar a próxima tinta
  if (combo >= 3) unlock('combo3')  // conquista
  if (combo >= 2) {
    const el = document.getElementById('combo-banner')
    if (el) {
      el.textContent = COMBO_MSGS[combo] || `LENDÁRIO x${combo}! 👑`
      el.classList.remove('show'); void el.offsetWidth; el.classList.add('show')
    }
    sfx.combo(combo)
  }
  // 🏆 recompensas de combo (killstreak)
  if (combo === 3) {
    P.hp = Math.min(P.maxHp, P.hp + 40); updateHealth()
    P.ammo = maxAmmo(); updateAmmo()
    feed('🏆 Combo 3! +vida e munição cheia')
  } else if (combo === 5) {
    applyTimedBuff('rapid', 6, () => P.fireRateMult *= 2, () => P.fireRateMult /= 2)
    feed('🏆 Combo 5! Cadência turbinada!')
  } else if (combo >= 7) {
    applyTimedBuff('invinc', 4, () => P.invincible = true, () => P.invincible = false)
    feed('🏆 Combo lendário! Invencível por 4s!')
  }
}

// ---------------- Melhores Momentos (vídeo) + CRTV ----------------
// Grava clipes de vídeo das suas jogadas (canvas → webm) e os mostra numa TV de tubo retrô.
// Os clipes ficam salvos no IndexedDB (aguenta vídeos, ao contrário do localStorage).
const HL_DB = 'crazyRoyaleHL'
const HL_STORE = 'clips'
const HL_MAX = 8          // quantidade de clipes guardados
const HL_SECONDS = 4      // duração de cada clipe
let hlRecording = false   // evita gravar dois clipes ao mesmo tempo
let hlClips = []          // [{ url, caption }] em exibição na CRTV
let hlIndex = 0

// ---- IndexedDB (promessas) ----
function hlOpenDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(HL_DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(HL_STORE, { keyPath: 'id', autoIncrement: true })
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
}
async function hlAll() {
  const db = await hlOpenDB()
  return new Promise((res, rej) => {
    const req = db.transaction(HL_STORE, 'readonly').objectStore(HL_STORE).getAll()
    req.onsuccess = () => res(req.result.sort((a, b) => a.t - b.t))
    req.onerror = () => rej(req.error)
  })
}
async function hlAdd(blob, caption) {
  const db = await hlOpenDB()
  await new Promise((res, rej) => {
    const tx = db.transaction(HL_STORE, 'readwrite')
    tx.objectStore(HL_STORE).add({ blob, caption, t: Date.now() })
    tx.oncomplete = res; tx.onerror = () => rej(tx.error)
  })
  // mantém só os HL_MAX mais recentes
  const all = await hlAll()
  if (all.length > HL_MAX) {
    const db2 = await hlOpenDB()
    const store = db2.transaction(HL_STORE, 'readwrite').objectStore(HL_STORE)
    all.slice(0, all.length - HL_MAX).forEach(c => store.delete(c.id))
  }
}

// ---- Gravação do clipe a partir do momento marcante ----
function captureHighlight(caption) {
  if (hlRecording || !renderer || !renderer.domElement.captureStream || !window.MediaRecorder) return
  const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
  const mime = types.find(t => MediaRecorder.isTypeSupported(t))
  if (!mime) return
  let rec
  try {
    const stream = renderer.domElement.captureStream(30)
    rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 })
  } catch { return }
  const chunks = []
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data) }
  rec.onstop = () => hlAdd(new Blob(chunks, { type: 'video/webm' }), caption).catch(() => {})
  hlRecording = true
  rec.start()
  setTimeout(() => { try { rec.stop() } catch {} hlRecording = false }, HL_SECONDS * 1000)
}

// ---- CRTV (visualizador) ----
async function openHighlights() {
  document.getElementById('crt-tv').classList.remove('hidden')
  hlClips.forEach(c => URL.revokeObjectURL(c.url)) // libera URLs antigas
  const all = await hlAll().catch(() => [])
  hlClips = all.map(c => ({ url: URL.createObjectURL(c.blob), caption: c.caption }))
  hlIndex = hlClips.length - 1 // começa no mais recente
  renderHighlight()
}
function closeHighlights() {
  document.getElementById('crt-tv').classList.add('hidden')
  const v = document.getElementById('crt-video'); if (v) v.pause()
}
function renderHighlight() {
  const v = document.getElementById('crt-video')
  const cap = document.getElementById('crt-caption')
  const counter = document.getElementById('crt-counter')
  const empty = document.getElementById('crt-empty')
  if (!hlClips.length) {
    v.style.display = 'none'; v.removeAttribute('src'); cap.textContent = ''; counter.textContent = '0 / 0'
    empty.style.display = 'flex'
    return
  }
  empty.style.display = 'none'; v.style.display = 'block'
  hlIndex = (hlIndex + hlClips.length) % hlClips.length
  const c = hlClips[hlIndex]
  v.src = c.url; v.play().catch(() => {})
  cap.textContent = c.caption
  counter.textContent = `${hlIndex + 1} / ${hlClips.length}`
}

function bindHighlightUI() {
  const wire = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn }
  wire('crt-prev', () => { hlIndex--; renderHighlight() })
  wire('crt-next', () => { hlIndex++; renderHighlight() })
  wire('crt-close', closeHighlights)
  wire('open-highlights', openHighlights)
  wire('end-highlights', openHighlights)
}
bindHighlightUI()

// ================= CONQUISTAS =================
const ACHIEVEMENTS = [
  { id: 'first_paint', emoji: '🎨', name: 'Primeira Tinta', desc: 'Pinte seu primeiro adversário' },
  { id: 'combo3', emoji: '🔥', name: 'Combo!', desc: 'Faça um combo de 3 tintas' },
  { id: 'win', emoji: '🏆', name: 'Campeão de Tinta', desc: 'Vença uma partida' },
  { id: 'paint50', emoji: '🖌️', name: 'Pintor Profissional', desc: 'Pinte 50 adversários no total' },
  { id: 'grenade', emoji: '💣', name: 'Bombardeiro', desc: 'Use uma granada de tinta' },
  { id: 'box', emoji: '📦', name: 'Modo Caixa', desc: 'Vire uma caixa com o caixacete' },
  { id: 'lose20', emoji: '🪖', name: 'Não desista!', desc: 'Perca 5 vezes seguidas (libera o treino)' },
  { id: 'train_done', emoji: '🎓', name: 'Treinado!', desc: 'Complete o treino' }
]
let totalKills = +(localStorage.getItem('crKills') || 0)
let lossStreak = +(localStorage.getItem('crLoss') || 0)
let caixaceteUnlocked = localStorage.getItem('crCaixacete') === '1'
let unlocked = new Set((() => { try { return JSON.parse(localStorage.getItem('crAch') || '[]') } catch { return [] } })())

function unlock(id) {
  if (unlocked.has(id)) return
  unlocked.add(id)
  try { localStorage.setItem('crAch', JSON.stringify([...unlocked])) } catch { }
  const a = ACHIEVEMENTS.find(x => x.id === id); if (!a) return
  const el = document.getElementById('ach-toast')
  if (el) {
    el.innerHTML = `<span class="ach-emoji">${a.emoji}</span><div><b>Conquista desbloqueada!</b><br>${a.name}</div>`
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show')
  }
  sfx.powerup()
}
function recordKill() {
  totalKills++
  if (totalKills % 10 === 0 || totalKills < 5) try { localStorage.setItem('crKills', totalKills) } catch { } // não grava a cada tinta
  unlock('first_paint')
  if (totalKills >= 50) unlock('paint50')
}
function recordLoss() {
  lossStreak++; localStorage.setItem('crLoss', lossStreak)
  if (lossStreak >= 5) { caixaceteUnlocked = true; localStorage.setItem('crCaixacete', '1'); unlock('lose20') }
}
function recordWin() { lossStreak = 0; localStorage.setItem('crLoss', '0'); unlock('win') }

// painel de conquistas (lista) — aberto pelo menu
function renderAchievements() {
  const list = document.getElementById('ach-list'); if (!list) return
  list.innerHTML = ''
  for (const a of ACHIEVEMENTS) {
    const got = unlocked.has(a.id)
    const row = document.createElement('div')
    row.className = 'ach-row' + (got ? ' got' : '')
    row.innerHTML = `<span class="ach-emoji">${got ? a.emoji : '🔒'}</span><div><b>${a.name}</b><br><small>${a.desc}</small></div>`
    list.appendChild(row)
  }
}
{
  const wire = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn }
  wire('open-achievements', () => { renderAchievements(); document.getElementById('ach-panel').style.display = 'flex' })
  wire('ach-close', () => { document.getElementById('ach-panel').style.display = 'none' })
}

// ================= CONFIGURAÇÕES =================
let settings = (() => { try { return JSON.parse(localStorage.getItem('crSettings')) || {} } catch { return {} } })()
if (settings.bloom === undefined) settings.bloom = true
if (settings.thermal === undefined) settings.thermal = false
if (settings.fps === undefined) settings.fps = false
function saveSettings() { try { localStorage.setItem('crSettings', JSON.stringify(settings)) } catch { } }
function applySettings() {
  if (bloomPass) bloomPass.enabled = settings.bloom
  if (thermalPass) thermalPass.uniforms.enabled.value = settings.thermal ? 1 : 0
  fpsOn = settings.fps; if (fpsEl) fpsEl.style.display = fpsOn ? 'block' : 'none'
  applyHeatAll()
}
// faz personagens/jogador "emitirem calor" (brilho quente) quando a Visão de Calor está ligada
function setHeat(root, on) {
  root.traverse(o => {
    const m = o.material
    if (m && m.isMeshStandardMaterial) {
      if (on) { m.emissive.setHex(0xff5a00); m.emissiveIntensity = 1.3 }
      else { m.emissiveIntensity = 0 }
    }
  })
}
function applyHeatAll() {
  const on = !!settings.thermal
  for (const b of bots) if (b.mesh) setHeat(b.mesh, on)
  if (playerAvatar) setHeat(playerAvatar, on)
  if (CROWD.mesh) { CROWD.mesh.material.emissive.setHex(on ? 0xff5a00 : 0x000000); CROWD.mesh.material.emissiveIntensity = on ? 1.3 : 0 }
}
// calor por frame: quanto MENOS vida, mais FRIO (brilho menor) o personagem fica
function heatFor(hp, maxHp) { return 0.12 + Math.max(0, Math.min(1, hp / (maxHp || 100))) * 1.3 }
function updateHeat() {
  if (!settings.thermal) return
  for (const b of bots) {
    if (!b.mesh) continue
    const inten = heatFor(b.hp, b.maxHp)
    b.mesh.traverse(o => { const m = o.material; if (m && m.isMeshStandardMaterial) { m.emissive.setHex(0xff5a00); m.emissiveIntensity = inten } })
  }
  if (playerAvatar) {
    const inten = heatFor(P.hp, P.maxHp)
    playerAvatar.traverse(o => { const m = o.material; if (m && m.isMeshStandardMaterial) { m.emissive.setHex(0xff5a00); m.emissiveIntensity = inten } })
  }
}
function refreshSettingsUI() {
  const set = (id, on) => { const b = document.getElementById(id); if (b) { b.textContent = on ? 'ON' : 'OFF'; b.classList.toggle('on', on) } }
  set('set-thermal', settings.thermal); set('set-bloom', settings.bloom); set('set-fps', settings.fps)
}
{
  const wire = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn }
  wire('open-settings', () => { refreshSettingsUI(); document.getElementById('settings-panel').style.display = 'flex' })
  wire('settings-close', () => { document.getElementById('settings-panel').style.display = 'none'; sfx.ui() })
  wire('set-thermal', () => { settings.thermal = !settings.thermal; saveSettings(); applySettings(); refreshSettingsUI(); sfx.ui() })
  wire('set-bloom', () => { settings.bloom = !settings.bloom; saveSettings(); applySettings(); refreshSettingsUI(); sfx.ui() })
  wire('set-fps', () => { settings.fps = !settings.fps; saveSettings(); applySettings(); refreshSettingsUI(); sfx.ui() })
}

// ================= TREINO (tutorial: básico + 7 fases com caixacete) =================
const TRAIN_PHASES = [
  // --- treino básico (SEM caixacete) ---
  { key: 'move', msg: '🎓 TREINO — Ande com W A S D' },
  { key: 'look', msg: 'Mexa o MOUSE pra olhar em volta' },
  { key: 'jump', msg: 'Pule com ESPAÇO' },
  { key: 'shot', msg: 'Atire num alvo com CLIQUE 🎯' },
  // --- agora o CAIXACETE: 7 fases ---
  { key: 'move', msg: '🪖 Você ganhou o CAIXACETE! Fase 1/7: ande com ele', caixacete: true },
  { key: 'jump', msg: '🪖 Caixacete 2/7: PULE' },
  { key: 'crouch', msg: '🪖 Caixacete 3/7: AGACHE com C' },
  { key: 'dash', msg: '🪖 Caixacete 4/7: faça um DASH (ESPAÇO andando)' },
  { key: 'grenade', msg: '🪖 Caixacete 5/7: jogue uma GRANADA com G' },
  { key: 'shot', msg: '🪖 Caixacete 6/7: atire de novo 🎯' },
  { key: 'box', msg: '🪖 Caixacete 7/7: aperte P pra virar CAIXA 📦 (fica invisível!)' }
]
function setupTraining() {
  // alvos pra praticar
  for (let i = 0; i < 3; i++) {
    const a = Math.random() * Math.PI * 2, r = 14 + Math.random() * 18
    pushBot(char, weapon, Math.cos(a) * r, Math.sin(a) * r)
  }
  alive = 3
  // boneco do jogador (pra ver em 3ª pessoa ao agachar com o caixacete)
  playerAvatar = makeFigure(char, CHARACTERS.indexOf(char), weapon)
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.75, 0.95),
    new THREE.MeshStandardMaterial({ color: 0xb07b3a, roughness: .9 }))
  helmet.position.y = 2.55; playerAvatar.add(helmet)   // o CAIXACETE na cabeça
  playerAvatar.visible = false
  scene.add(playerAvatar)
  training = { i: 0, base: 0, counts: { move: 0, look: 0, jump: 0, shot: 0, crouch: 0, dash: 0, grenade: 0, box: 0 } }
  showTrainMsg(TRAIN_PHASES[0].msg)
}
function trainBump(k) { if (training) training.counts[k]++ }
function updateTraining() {
  if (!training) return
  const ph = TRAIN_PHASES[training.i]
  if (training.counts[ph.key] > training.base) {
    training.i++
    if (training.i >= TRAIN_PHASES.length) { finishTraining(); return }
    const nx = TRAIN_PHASES[training.i]
    if (nx.caixacete && !P.caixacete) { P.caixacete = true; sfx.powerup(); feed('🪖 CAIXACETE na cabeça!') }
    training.base = training.counts[nx.key]
    showTrainMsg(nx.msg); sfx.ui()
  }
}
function finishTraining() {
  training = null
  unlock('train_done'); recordWin() // você melhorou: zera a sequência de derrotas
  showTrainMsg('')
  stopRun(); showSpectateHud(false)
  showEndCard('train')
}
function showTrainMsg(t) {
  const el = document.getElementById('train-msg'); if (el) { el.textContent = t; el.style.display = t ? 'block' : 'none' }
}
// vira caixa (só no treino, com o caixacete): invisível pros coms
function toggleBox() {
  if (mode !== 'train' || !P.caixacete) return
  P.boxed = !P.boxed
  const ov = document.getElementById('box-overlay'); if (ov) ov.style.display = P.boxed ? 'block' : 'none'
  if (viewModel) viewModel.visible = !P.boxed
  if (P.boxed) { trainBump('box'); unlock('box'); feed('📦 Virou uma caixa — invisível pros coms!') }
}
// pergunta do treino (após 20 derrotas seguidas)
function showTrainPrompt() {
  const el = document.getElementById('train-prompt'); if (el) el.style.display = 'flex'
}
{
  const yes = document.getElementById('train-yes'), no = document.getElementById('train-no')
  if (yes) yes.onclick = () => { document.getElementById('train-prompt').style.display = 'none'; sfx.ui(); startTraining() }
  if (no) no.onclick = () => { document.getElementById('train-prompt').style.display = 'none'; sfx.ui() }
}

// ---------------- Reinício ----------------
document.getElementById('restart-btn').addEventListener('click', () => location.reload())
