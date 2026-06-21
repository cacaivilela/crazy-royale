// ============================================================
//  CRAZY ROYALE - Dados de personagens e armas
//  Tudo gerado proceduralmente (sem assets externos).
// ============================================================

// 34 personagens malucos. Cada um tem cor, formato do corpo,
// uma "perk" (vantagem passiva) e emoji.
export const CHARACTERS = [
  { name: 'Bananildo',     emoji: '🍌', color: 0xffe135, perk: 'speed',    perkLabel: '+25% velocidade' },
  { name: 'Tank Tonho',    emoji: '🛡️', color: 0x4a6741, perk: 'tank',     perkLabel: '+100 vida máxima' },
  { name: 'Dona Bruxa',    emoji: '🧙', color: 0x7a3fb5, perk: 'heal',     perkLabel: 'regenera vida' },
  { name: 'Robô Zé',       emoji: '🤖', color: 0x9aa7b0, perk: 'armor',    perkLabel: 'recebe -20% dano' },
  { name: 'Gato Ninja',    emoji: '🐱', color: 0x2b2b2b, perk: 'dash',     perkLabel: 'dash mais forte' },
  { name: 'Cogu',          emoji: '🍄', color: 0xe8584d, perk: 'tank',     perkLabel: '+100 vida máxima' },
  { name: 'Capitão Pão',   emoji: '🥖', color: 0xd9a066, perk: 'damage',   perkLabel: '+15% dano' },
  { name: 'Fantasminha',   emoji: '👻', color: 0xf0f0f0, perk: 'speed',    perkLabel: '+25% velocidade' },
  { name: 'Dino Rex',      emoji: '🦖', color: 0x4caf50, perk: 'dino',     perkLabel: '+140 vida · -25% dano · +20% dano · 5x munição' },
  { name: 'Alien Glub',    emoji: '👽', color: 0x6fd66f, perk: 'jump',     perkLabel: 'pulo duplo' },
  { name: 'Pinguim Frost', emoji: '🐧', color: 0x223344, perk: 'armor',    perkLabel: 'recebe -20% dano' },
  { name: 'Pimentão',      emoji: '🌶️', color: 0xd62828, perk: 'damage',   perkLabel: '+15% dano' },
  { name: 'Tigrão Léo',    emoji: '🐯', color: 0xff9f1c, perk: 'damage',   perkLabel: '+15% dano' },
  { name: 'Caveirão',      emoji: '💀', color: 0xeeeeee, perk: 'glass',    perkLabel: '+25% dano · MUITO frágil (+40% dano recebido)' },
  { name: 'Abelha Zum',    emoji: '🐝', color: 0xffc107, perk: 'speed',    perkLabel: '+25% velocidade' },
  { name: 'Polvo Otto',    emoji: '🐙', color: 0xb5179e, perk: 'jump',     perkLabel: 'pulo duplo' },
  { name: 'Vovó Punk',     emoji: '👵', color: 0xff6ec7, perk: 'tank',     perkLabel: '+100 vida máxima' },
  { name: 'Cacto Espeto',  emoji: '🌵', color: 0x2e8b57, perk: 'armor',    perkLabel: 'recebe -20% dano' },
  { name: 'Macaco Doido',  emoji: '🐵', color: 0x8d5524, perk: 'dash',     perkLabel: 'dash mais forte' },
  { name: 'Robozão',       emoji: '🦾', color: 0x607d8b, perk: 'tank',     perkLabel: '+100 vida máxima' },
  { name: 'Florzinha',     emoji: '🌻', color: 0xffd400, perk: 'heal',     perkLabel: 'regenera vida' },
  { name: 'Tubarão Bob',   emoji: '🦈', color: 0x4f6d7a, perk: 'damage',   perkLabel: '+15% dano' },
  { name: 'Pizza Man',     emoji: '🍕', color: 0xe2a829, perk: 'speed',    perkLabel: '+25% velocidade' },
  { name: 'Coelho Salta',  emoji: '🐰', color: 0xffd6e0, perk: 'jump',     perkLabel: 'pulo duplo' },
  { name: 'Anjinho',       emoji: '😇', color: 0xfff7d6, perk: 'heal',     perkLabel: 'regenera vida' },
  { name: 'Foguetinho',    emoji: '🚀', color: 0xc44536, perk: 'jump',     perkLabel: 'pulo duplo' },
  { name: 'Sapão',         emoji: '🐸', color: 0x6ab04c, perk: 'jump',     perkLabel: 'pulo duplo' },
  { name: 'Rei Coroa',     emoji: '🤴', color: 0xffd700, perk: 'armor',    perkLabel: 'recebe -20% dano' },
  { name: 'Zumbi Zeca',    emoji: '🧟', color: 0x6a8e3c, perk: 'tank',     perkLabel: '+100 vida máxima' },
  { name: 'Unicórnia',     emoji: '🦄', color: 0xff9ff3, perk: 'speed',    perkLabel: '+25% velocidade' },
  { name: ' Varejeira',    emoji: '🪰', color: 0x303030, perk: 'dash',     perkLabel: 'dash mais forte' },
  { name: 'Dr. Cérebro',   emoji: '🧠', color: 0xff8fab, perk: 'heal',     perkLabel: 'regenera vida' },
  { name: 'Ovo Frito',     emoji: '🍳', color: 0xfff3b0, perk: 'damage',   perkLabel: '+15% dano' },
  { name: 'Lhama Drama',   emoji: '🦙', color: 0xd8c3a5, perk: 'jump',     perkLabel: 'pulo duplo' }
]

// Personagens EXCLUSIVOS do Crazy History — vilões/minions que só aparecem
// na campanha (não dá pra escolher; surgem como inimigos dos capítulos).
export const STORY_CHARACTERS = [
  { name: 'Capanga Sombrio',     emoji: '🥷', color: 0x222233 },
  { name: 'Bruxo do Caos',       emoji: '🧙', color: 0x6a0dad },
  { name: 'General Parafuso',    emoji: '⚙️', color: 0x8a99a8 },
  { name: 'Rainha Aranha',       emoji: '🕸️', color: 0x4b0082 },
  { name: 'Clone Maligno',       emoji: '👿', color: 0x8b0000 },
  { name: 'Sentinela X',         emoji: '🛸', color: 0x00aa88 },
  { name: 'Gosma Viva',          emoji: '🟢', color: 0x33cc33 },
  { name: 'Bonecão Assombrado',  emoji: '🪆', color: 0xcc5500 },
  { name: 'Cavaleiro Caveira',   emoji: '🩻', color: 0xd0d0d0 },
  { name: 'Lorde Pesadelo',      emoji: '😱', color: 0x1a1a40 }
]

// 43 armas. Categorias afetam estilo de tiro:
//  - pistol / smg / rifle / sniper / shotgun / launcher / melee / special
// Stats: damage, fireRate (tiros/seg), range, spread (radianos), pellets, ammo, projColor
export const WEAPONS = [
  { name: 'Pistola Pum',      cat: 'pistol',   emoji: '🔫', damage: 18, fireRate: 4,  range: 60,  spread: 0.02, pellets: 1, ammo: 12,  projColor: 0xffee00 },
  { name: 'Revólver Sortudo', cat: 'pistol',   emoji: '🎯', damage: 34, fireRate: 2,  range: 70,  spread: 0.01, pellets: 1, ammo: 6,   projColor: 0xffaa00 },
  { name: 'SMG Tagarela',     cat: 'smg',      emoji: '💨', damage: 11, fireRate: 12, range: 45,  spread: 0.05, pellets: 1, ammo: 30,  projColor: 0x00e5ff },
  { name: 'SMG Furacão',      cat: 'smg',      emoji: '🌀', damage: 9,  fireRate: 16, range: 40,  spread: 0.06, pellets: 1, ammo: 40,  projColor: 0x66ffcc },
  { name: 'Rifle Trovão',     cat: 'rifle',    emoji: '⚡', damage: 24, fireRate: 7,  range: 90,  spread: 0.02, pellets: 1, ammo: 25,  projColor: 0xffffff },
  { name: 'AK Bagunça',       cat: 'rifle',    emoji: '🔥', damage: 27, fireRate: 6,  range: 85,  spread: 0.03, pellets: 1, ammo: 30,  projColor: 0xff5500 },
  { name: 'Sniper Olho',      cat: 'sniper',   emoji: '🦅', damage: 95, fireRate: 1,  range: 200, spread: 0.0,  pellets: 1, ammo: 5,   projColor: 0xff0066 },
  { name: 'Sniper Lunar',     cat: 'sniper',   emoji: '🌙', damage: 120,fireRate: 0.7,range: 240, spread: 0.0,  pellets: 1, ammo: 4,   projColor: 0xaaccff },
  { name: 'Escopeta Boom',    cat: 'shotgun',  emoji: '💥', damage: 12, fireRate: 1.4,range: 28,  spread: 0.12, pellets: 8, ammo: 6,   projColor: 0xff8800 },
  { name: 'Escopeta Dupla',   cat: 'shotgun',  emoji: '🧨', damage: 14, fireRate: 1.1,range: 30,  spread: 0.14, pellets: 10,ammo: 2,   projColor: 0xffcc00 },
  { name: 'Bazuca Maluca',    cat: 'launcher', emoji: '🚀', damage: 150,fireRate: 1.4,range: 130, spread: 0.0,  pellets: 1, ammo: 5,   projColor: 0xff2200, explosive: true },
  { name: 'Lança-Bolo',       cat: 'launcher', emoji: '🎂', damage: 55, fireRate: 1.2,range: 80,  spread: 0.01, pellets: 1, ammo: 5,   projColor: 0xff77aa, explosive: true },
  { name: 'Lança-Chamas',     cat: 'special',  emoji: '🔥', damage: 6,  fireRate: 20, range: 22,  spread: 0.10, pellets: 1, ammo: Infinity, projColor: 0xff4400 },
  { name: 'Raio Laser',       cat: 'special',  emoji: '🔆', damage: 14, fireRate: 14, range: 110, spread: 0.0,  pellets: 1, ammo: 50,  projColor: 0x00ff88 },
  { name: 'Canhão de Plasma', cat: 'special',  emoji: '🟣', damage: 45, fireRate: 3,  range: 100, spread: 0.01, pellets: 1, ammo: 12,  projColor: 0xcc44ff },
  { name: 'Metralha Pesada',  cat: 'rifle',    emoji: '🛠️', damage: 16, fireRate: 11, range: 80,  spread: 0.04, pellets: 1, ammo: 60,  projColor: 0xffdd55 },
  { name: 'Pistola Dardo',    cat: 'pistol',   emoji: '🎲', damage: 22, fireRate: 5,  range: 65,  spread: 0.02, pellets: 1, ammo: 15,  projColor: 0x55ff55 },
  { name: 'Arco Veloz',       cat: 'sniper',   emoji: '🏹', damage: 70, fireRate: 1.5,range: 150, spread: 0.0,  pellets: 1, ammo: 10,  projColor: 0x88ff00 },
  { name: 'Besta Tripla',     cat: 'shotgun',  emoji: '🎏', damage: 28, fireRate: 1.6,range: 60,  spread: 0.06, pellets: 3, ammo: 9,   projColor: 0x00ffaa },
  { name: 'Uzi Confete',      cat: 'smg',      emoji: '🎊', damage: 8,  fireRate: 18, range: 38,  spread: 0.07, pellets: 1, ammo: 50,  projColor: 0xff66ff },
  { name: 'Rifle Espacial',   cat: 'rifle',    emoji: '🛸', damage: 30, fireRate: 6,  range: 100, spread: 0.02, pellets: 1, ammo: 24,  projColor: 0x44ddff },
  { name: 'Pistola Gelo',     cat: 'pistol',   emoji: '❄️', damage: 20, fireRate: 4,  range: 60,  spread: 0.02, pellets: 1, ammo: 14,  projColor: 0xaadfff },
  { name: 'Granada-Mão',      cat: 'launcher', emoji: '💣', damage: 65, fireRate: 1,  range: 50,  spread: 0.02, pellets: 1, ammo: 4,   projColor: 0x444444, explosive: true },
  { name: 'Mira Fantasma',    cat: 'sniper',   emoji: '👁️', damage: 88, fireRate: 1.1,range: 210, spread: 0.0,  pellets: 1, ammo: 6,   projColor: 0xddddff },
  { name: 'Escopeta Serra',   cat: 'shotgun',  emoji: '🪚', damage: 16, fireRate: 1.8,range: 26,  spread: 0.11, pellets: 7, ammo: 8,   projColor: 0xffaa33 },
  { name: 'Pistola Tripla',   cat: 'pistol',   emoji: '🔱', damage: 14, fireRate: 4,  range: 55,  spread: 0.05, pellets: 3, ammo: 18,  projColor: 0xffee88 },
  { name: 'Metranca Turbo',   cat: 'rifle',    emoji: '🏎️', damage: 14, fireRate: 14, range: 75,  spread: 0.05, pellets: 1, ammo: 70,  projColor: 0xff3366 },
  { name: 'Canhão de Sopro',  cat: 'special',  emoji: '🌬️', damage: 10, fireRate: 8,  range: 35,  spread: 0.08, pellets: 2, ammo: 40,  projColor: 0xccffff },
  { name: 'Lança-Estrela',    cat: 'special',  emoji: '⭐', damage: 40, fireRate: 4,  range: 90,  spread: 0.0,  pellets: 1, ammo: 16,  projColor: 0xffff00 },
  { name: 'Rifle Caçador',    cat: 'rifle',    emoji: '🎖️', damage: 33, fireRate: 5,  range: 95,  spread: 0.02, pellets: 1, ammo: 20,  projColor: 0xffcc99 },
  { name: 'Pé de Cabra',      cat: 'melee',    emoji: '🦯', damage: 55, fireRate: 2.5,range: 6,   spread: 0.2,  pellets: 1, ammo: Infinity, projColor: 0xaaaaaa },
  { name: 'Katana Neon',      cat: 'melee',    emoji: '⚔️', damage: 70, fireRate: 2,  range: 7,   spread: 0.2,  pellets: 1, ammo: Infinity, projColor: 0x00ffff },
  { name: 'Frigideira',       cat: 'melee',    emoji: '🍳', damage: 48, fireRate: 2.2,range: 5,   spread: 0.2,  pellets: 1, ammo: Infinity, projColor: 0xdddddd },
  { name: 'Martelo Gigante',  cat: 'melee',    emoji: '🔨', damage: 90, fireRate: 1.2,range: 8,   spread: 0.25, pellets: 1, ammo: Infinity, projColor: 0xff8844 },
  { name: 'Pistola Bolha',    cat: 'pistol',   emoji: '🫧', damage: 16, fireRate: 6,  range: 50,  spread: 0.03, pellets: 1, ammo: 20,  projColor: 0x88ddff },
  { name: 'SMG Trovãozinho',  cat: 'smg',      emoji: '🔋', damage: 12, fireRate: 13, range: 50,  spread: 0.04, pellets: 1, ammo: 35,  projColor: 0xffff66 },
  { name: 'Rifle Dragão',     cat: 'rifle',    emoji: '🐉', damage: 36, fireRate: 5,  range: 105, spread: 0.02, pellets: 1, ammo: 22,  projColor: 0xff4400 },
  { name: 'Sniper Arco-Íris', cat: 'rifle',    emoji: '🌈', damage: 28, fireRate: 15, range: 120, spread: 0.04, pellets: 1, ammo: 120, projColor: 0xff00ff, projectile: true, projRadius: 0.1, projSpeed: 200 },
  { name: 'Escopeta Fênix',   cat: 'shotgun',  emoji: '🔆', damage: 18, fireRate: 1.3,range: 32,  spread: 0.10, pellets: 9, ammo: 5,   projColor: 0xff6600 },
  { name: 'Lança-Foguete X',  cat: 'launcher', emoji: '☄️', damage: 100,fireRate: 0.6,range: 140, spread: 0.0,  pellets: 1, ammo: 2,   projColor: 0xff0000, explosive: true },
  { name: 'Canhão Arco',      cat: 'special',  emoji: '🎇', damage: 50, fireRate: 2.5,range: 95,  spread: 0.0,  pellets: 1, ammo: 14,  projColor: 0x66ffff },
  { name: 'Metralha Mini',    cat: 'smg',      emoji: '🎈', damage: 10, fireRate: 15, range: 42,  spread: 0.05, pellets: 1, ammo: 45,  projColor: 0xffaaff },
  { name: 'Rifle do Caos',    cat: 'rifle',    emoji: '🌪️', damage: 22, fireRate: 9,  range: 85,  spread: 0.06, pellets: 4, ammo: 40,  projColor: 0xaa00ff }
]

// Tanques de tinta: definem quanta munição você carrega (capacity = multiplicador)
// e a velocidade de recarga (reload = multiplicador do tempo; menor = mais rápido).
export const TANKS = [
  { name: 'Copinho',         emoji: '🥤', color: 0x9fd8ff, capacity: 0.8, reload: 0.65 },
  { name: 'Mochila Padrão',  emoji: '🎒', color: 0x6ab04c, capacity: 1.0, reload: 1.0 },
  { name: 'Cantil',          emoji: '🧴', color: 0xffd166, capacity: 1.2, reload: 0.9 },
  { name: 'Balde de Tinta',  emoji: '🪣', color: 0x3bd1ff, capacity: 1.5, reload: 1.1 },
  { name: 'Barril',          emoji: '🛢️', color: 0xff7b3d, capacity: 1.8, reload: 1.25 },
  { name: 'Tanque Pro',      emoji: '🛟', color: 0xff4fa3, capacity: 2.2, reload: 1.15 },
  { name: 'Mega Tanque',     emoji: '🚰', color: 0x9b5de5, capacity: 3.0, reload: 1.4 },
  { name: 'Tanque Infinito', emoji: '♾️', color: 0x00e5ff, capacity: 5.0, reload: 1.0 }
]

// Tênis: definem velocidade (speed = multiplicador) e potência do dash
// (dash = multiplicador; maior = recarrega mais rápido / arranque mais forte).
export const SNEAKERS = [
  { name: 'Tênis Comum',   emoji: '👟', color: 0xcccccc, speed: 1.0,  dash: 1.0 },
  { name: 'Chinelo',       emoji: '🩴', color: 0xffd166, speed: 0.9,  dash: 1.0 },
  { name: 'Bota Mola',     emoji: '🥾', color: 0x8d5524, speed: 1.05, dash: 1.3 },
  { name: 'Patins',        emoji: '🛼', color: 0xff6ec7, speed: 1.25, dash: 1.2 },
  { name: 'Tênis a Jato',  emoji: '🚀', color: 0xff4400, speed: 1.4,  dash: 1.6 },
  { name: 'Botas Aladas',  emoji: '🪽', color: 0xfff7d6, speed: 1.3,  dash: 2.0 }
]

// Cores de tinta do jogador (color = hex; -1 = Arco-Íris, muda a cada tiro).
// HSL → hex (h em graus, s/l em 0..1)
function hslHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x } else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x } else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c } else { r = c; b = x }
  return (Math.round((r + m) * 255) << 16) | (Math.round((g + m) * 255) << 8) | Math.round((b + m) * 255)
}
function paintFamily(h) {
  if (h < 15 || h >= 345) return 'Vermelho'
  if (h < 45) return 'Laranja'
  if (h < 70) return 'Amarelo'
  if (h < 160) return 'Verde'
  if (h < 200) return 'Ciano'
  if (h < 260) return 'Azul'
  if (h < 300) return 'Roxo'
  return 'Rosa'
}
const NAMED_PAINTS = [
  { name: 'Vermelho', color: 0xff3b6b }, { name: 'Azul', color: 0x2b8fff },
  { name: 'Verde', color: 0x9ee04d }, { name: 'Amarelo', color: 0xffe14d },
  { name: 'Roxo', color: 0xcc44ff }, { name: 'Laranja', color: 0xff8a3d },
  { name: 'Rosa', color: 0xff66cc }, { name: 'Ciano', color: 0x00e5ff },
  { name: 'Branco', color: 0xffffff }, { name: 'Preto', color: 0x333344 },
  { name: 'Marrom', color: 0x8d5524 }
]
function buildPaints() {
  const list = NAMED_PAINTS.slice()
  const target = list.length + 76 // adiciona 76 cores extras
  let n = 0
  for (const l of [0.5, 0.65, 0.78]) {       // 3 níveis de claridade
    for (let h = 0; h < 360 && list.length < target; h += 12) {
      list.push({ name: `${paintFamily(h)} ${++n}`, color: hslHex(h, 0.85, l) })
    }
  }
  list.push({ name: 'Arco-Íris', emoji: '🌈', color: -1 })
  return list
}
export const PAINTS = buildPaints()

// Coletes: aumentam o HP máximo (hp = bônus de vida); alguns também regeneram (regen = vida/s).
export const VESTS = [
  { name: 'Camiseta',        emoji: '👕', color: 0xcccccc, hp: 0,   regen: 0 },
  { name: 'Regata',          emoji: '🎽', color: 0xffd166, hp: 30,  regen: 0 },
  { name: 'Moletom',         emoji: '🧥', color: 0x6ab04c, hp: 60,  regen: 0 },
  { name: 'Colete',          emoji: '🦺', color: 0xff7b3d, hp: 100, regen: 0 },
  { name: 'Armadura Leve',   emoji: '🛡️', color: 0x9aa7b0, hp: 150, regen: 0 },
  { name: 'Armadura Pesada', emoji: '⚙️', color: 0x8899aa, hp: 220, regen: 0 },
  { name: 'Colete Curativo', emoji: '🩹', color: 0xff3b6b, hp: 70,  regen: 7 },
  { name: 'Colete Mágico',   emoji: '✨', color: 0x9b5de5, hp: 120, regen: 4 }
]
