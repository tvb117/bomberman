import { Game } from './core/game'
import { BotController } from './core/bot'
import { Renderer } from './render/renderer'
import { Sound } from './render/sound'
import {
  ACTIONS,
  ACTION_LABELS,
  DEFAULT_KEYMAPS,
  Keyboard,
  keyLabel,
  loadKeymaps,
  saveKeymaps,
  type Action,
} from './input'
import { BOT_NAMES, PLAYER_COLORS, PLAYER_NAMES } from './core/constants'
import type { Arena, PlayerInput, PlayerSpec } from './core/types'

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

const canvas = $('game') as unknown as HTMLCanvasElement
const menuEl = $('menu')
const roundEl = $('round')
const roundMsg = $('roundMsg')
const roundSub = $('roundSub')
const matchButtons = $('matchButtons')

const keyboard = new Keyboard()
const sound = new Sound()
const renderer = new Renderer(canvas)

// ---------- rebindable controls ----------

let keymaps = loadKeymaps()
let listening: { player: number; action: Action } | null = null

function renderControlsTable(): void {
  const host = $('controls')
  const head =
    '<tr><th></th>' + ACTIONS.map((a) => `<th>${ACTION_LABELS[a]}</th>`).join('') + '</tr>'
  const rows = keymaps
    .map((map, p) => {
      const cells = ACTIONS.map(
        (a) =>
          `<td><button class="keybtn" data-p="${p}" data-a="${a}">${keyLabel(map[a])}</button></td>`,
      ).join('')
      return `<tr><td><span class="pdot" style="background:${PLAYER_COLORS[p]}"></span>P${p + 1}</td>${cells}</tr>`
    })
    .join('')
  host.innerHTML = `<table>${head}${rows}</table>`
  host.querySelectorAll<HTMLButtonElement>('.keybtn').forEach((btn) => {
    btn.addEventListener('click', () => {
      host.querySelectorAll('.keybtn').forEach((b) => b.classList.remove('listening'))
      listening = { player: Number(btn.dataset.p), action: btn.dataset.a as Action }
      btn.classList.add('listening')
      btn.textContent = '···'
    })
  })
}

window.addEventListener(
  'keydown',
  (e) => {
    if (!listening) return
    e.preventDefault()
    e.stopPropagation()
    if (e.code !== 'Escape') {
      // Steal the key from any other binding so each code maps to one action.
      for (const map of keymaps) {
        for (const a of ACTIONS) if (map[a] === e.code) map[a] = ''
      }
      keymaps[listening.player][listening.action] = e.code
      saveKeymaps(keymaps)
    }
    listening = null
    renderControlsTable()
  },
  true, // capture: runs before the gameplay Keyboard listener
)

$('btnResetKeys').addEventListener('click', () => {
  keymaps = DEFAULT_KEYMAPS.map((m) => ({ ...m }))
  saveKeymaps(keymaps)
  listening = null
  renderControlsTable()
})

renderControlsTable()

interface Settings {
  humans: number
  bots: number
  arena: Arena | 'random'
  winsTarget: number
  roundTime: number
}

type AppState = 'menu' | 'playing' | 'roundEnd' | 'matchEnd'

let state: AppState = 'menu'
let settings: Settings | null = null
let game: Game | null = null
let bots: BotController[] = []
let wins: number[] = []
let paused = false
let roundEndAt = 0
let roundSeq = 0
let lastT = performance.now()

function pickArena(choice: Arena | 'random'): Arena {
  if (choice !== 'random') return choice
  const all: Arena[] = ['classic', 'gadgets', 'conveyor']
  return all[Math.floor(Math.random() * all.length)]
}

function buildPlayers(s: Settings): PlayerSpec[] {
  const specs: PlayerSpec[] = []
  for (let i = 0; i < s.humans; i++) specs.push({ name: PLAYER_NAMES[i], isBot: false })
  for (let i = 0; i < s.bots; i++) specs.push({ name: BOT_NAMES[i], isBot: true })
  return specs
}

function startRound(): void {
  if (!settings) return
  roundSeq++
  const specs = buildPlayers(settings)
  game = new Game({
    players: specs,
    seed: (Date.now() ^ (roundSeq * 7919)) >>> 0,
    arena: pickArena(settings.arena),
    roundTime: settings.roundTime,
  })
  bots = specs
    .map((spec, idx) => (spec.isBot ? new BotController(idx, roundSeq * 1000 + idx) : null))
    .filter((b): b is BotController => b !== null)
  renderer.resizeFor(game)
  renderer.wins = wins
  roundEl.classList.add('hidden')
  menuEl.classList.add('hidden')
  paused = false
  state = 'playing'
}

function startMatch(): void {
  const s: Settings = {
    humans: parseInt(($('optHumans') as HTMLSelectElement).value, 10),
    bots: parseInt(($('optBots') as HTMLSelectElement).value, 10),
    arena: ($('optArena') as HTMLSelectElement).value as Settings['arena'],
    winsTarget: parseInt(($('optWins') as HTMLSelectElement).value, 10),
    roundTime: parseInt(($('optTime') as HTMLSelectElement).value, 10),
  }
  if (s.humans + s.bots < 2) {
    s.bots = Math.max(s.bots, 2 - s.humans)
    ;($('optBots') as HTMLSelectElement).value = String(s.bots)
  }
  if (s.humans + s.bots > 6) s.bots = 6 - s.humans
  settings = s
  wins = new Array(s.humans + s.bots).fill(0)
  startRound()
}

function onRoundOver(winner: number | null): void {
  if (!game || !settings) return
  state = 'roundEnd'
  roundEndAt = performance.now()
  if (winner !== null) {
    wins[winner]++
    const p = game.players[winner]
    roundMsg.textContent = `${p.name} wins the round!`
    roundMsg.style.color = PLAYER_COLORS[winner]
  } else {
    roundMsg.textContent = 'Draw!'
    roundMsg.style.color = '#e0e0e0'
  }

  const champ = wins.findIndex((w) => w >= settings!.winsTarget)
  if (champ >= 0) {
    state = 'matchEnd'
    const p = game.players[champ]
    roundMsg.textContent = `🏆 ${p.name} wins the match! 🏆`
    roundMsg.style.color = PLAYER_COLORS[champ]
    roundSub.textContent = wins.map((w, i) => `${game!.players[i].name}: ${w}`).join('  ·  ')
    matchButtons.classList.remove('hidden')
  } else {
    roundSub.textContent = ''
    matchButtons.classList.add('hidden')
  }
  setTimeout(() => roundEl.classList.remove('hidden'), 700)
}

function toMenu(): void {
  state = 'menu'
  game = null
  roundEl.classList.add('hidden')
  menuEl.classList.remove('hidden')
}

$('btnStart').addEventListener('click', () => {
  sound.unlock()
  startMatch()
})
$('btnAgain').addEventListener('click', () => {
  wins = wins.map(() => 0)
  startRound()
})
$('btnMenu').addEventListener('click', toMenu)

window.addEventListener('keydown', (e) => {
  if (listening) return // a rebind is in progress; the capture handler owns this key
  if (e.code === 'KeyM') sound.toggleMute()
  if (state === 'playing' && e.code === 'KeyP') paused = !paused
  if (e.code === 'Escape' && state !== 'menu') toMenu()
  if (state === 'roundEnd' && performance.now() - roundEndAt > 1200 && e.code === 'Space') {
    startRound()
  }
})

function gatherInputs(): (PlayerInput | undefined)[] {
  if (!game || !settings) return []
  const inputs: (PlayerInput | undefined)[] = []
  for (let i = 0; i < settings.humans; i++) inputs[i] = keyboard.inputFor(keymaps[i])
  return inputs
}

function simStep(dt: number): void {
  if (!game) return
  const inputs = gatherInputs()
  for (const bot of bots) inputs[bot.idx] = bot.update(game, dt)
  const wasOver = game.phase === 'over'
  game.update(dt, inputs)
  const events = game.drainEvents()
  renderer.consumeEvents(events)
  sound.consumeEvents(events)
  if (!wasOver && game.phase === 'over' && state === 'playing') {
    onRoundOver(game.winner)
  }
}

function frame(t: number): void {
  const dt = Math.min((t - lastT) / 1000, 0.05)
  lastT = t

  if (game && (state === 'playing' || state === 'roundEnd' || state === 'matchEnd')) {
    if (!paused) {
      simStep(dt)
      // Auto-advance to the next round after a short break.
      if (state === 'roundEnd' && performance.now() - roundEndAt > 3200) {
        startRound()
      }
    }
    if (game) renderer.draw(game, paused ? 0 : dt, paused)
  }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

// Test hook for browser automation.
;(window as any).__game = () => {
  if (!game) return { state }
  return {
    state,
    phase: game.phase,
    players: game.players.map((p) => ({ name: p.name, alive: p.alive, x: p.x, y: p.y })),
    bombs: game.bombs.length,
    flames: game.flames.size,
    time: game.time,
    wins: [...wins],
  }
}
;(window as any).__tick = (seconds: number) => {
  // Deterministic fast-forward for automated browser checks.
  const dt = 1 / 60
  const n = Math.round(seconds * 60)
  for (let i = 0; i < n && game; i++) simStep(dt)
}
;(window as any).__start = (humans: number, botCount: number) => {
  ;($('optHumans') as HTMLSelectElement).value = String(humans)
  ;($('optBots') as HTMLSelectElement).value = String(botCount)
  startMatch()
}
