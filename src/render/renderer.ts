import { Cell, Powerup, type GameEvent } from '../core/types'
import { BOMB_TIMER, HUD_H, PLAYER_COLORS, TILE } from '../core/constants'
import type { Game } from '../core/game'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: string
  gravity: number
}

const POWERUP_ICONS: Record<Powerup, string> = {
  [Powerup.ExtraBomb]: '💣',
  [Powerup.Flame]: '🔥',
  [Powerup.Speed]: '⚡',
  [Powerup.Kick]: '🥾',
  [Powerup.Punch]: '🥊',
  [Powerup.Skull]: '💀',
}

const OUTLINE = '#2e3440'

export class Renderer {
  private ctx: CanvasRenderingContext2D
  private particles: Particle[] = []
  private shake = 0
  private time = 0
  /** Per-player walk-cycle state, advanced by distance travelled. */
  private gait = new Map<number, { x: number; y: number; phase: number; moving: number }>()
  wins: number[] = []

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
  }

  resizeFor(game: Game): void {
    this.canvas.width = game.w * TILE
    this.canvas.height = game.h * TILE + HUD_H
    this.gait.clear()
  }

  consumeEvents(events: GameEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'explosion':
          // Kept subtle on purpose: a nudge, not an earthquake.
          this.shake = Math.min(this.shake + 2.2, 5)
          this.burst((e.x + 0.5) * TILE, (e.y + 0.5) * TILE, 18, ['#ffd54f', '#ff7043', '#ffee58'], 4)
          break
        case 'crate':
          this.burst((e.x + 0.5) * TILE, (e.y + 0.5) * TILE, 10, ['#a1887f', '#8d6e63', '#6d4c41'], 3)
          break
        case 'death':
          this.burst(e.x * TILE, e.y * TILE, 26, [PLAYER_COLORS[e.player], '#ffffff'], 5)
          this.shake = Math.min(this.shake + 1.5, 5)
          break
        case 'pickup':
        case 'reveal':
          this.burst((e.x + 0.5) * TILE, (e.y + 0.5) * TILE, 8, ['#ffffff', '#ffe082'], 2)
          break
        case 'tramp':
          this.burst((e.x + 0.5) * TILE, (e.y + 0.5) * TILE, 12, ['#80d8ff', '#ffffff'], 3)
          break
        case 'sdBlock':
          this.shake = Math.min(this.shake + 0.7, 3)
          this.burst((e.x + 0.5) * TILE, (e.y + 0.5) * TILE, 6, ['#90a4ae', '#cfd8dc'], 3)
          break
        default:
          break
      }
    }
  }

  private burst(px: number, py: number, n: number, colors: string[], speed: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const v = (0.3 + Math.random()) * speed
      this.particles.push({
        x: px,
        y: py,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 1.5,
        life: 0.5 + Math.random() * 0.4,
        maxLife: 0.9,
        size: 2 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        gravity: 9,
      })
    }
  }

  draw(game: Game, dt: number, paused: boolean): void {
    this.time += dt
    const ctx = this.ctx
    ctx.save()
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

    this.drawHud(game)

    ctx.translate(0, HUD_H)
    if (this.shake > 0.1) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake)
      this.shake *= Math.pow(0.001, dt)
    }

    this.drawBoard(game)
    this.drawPowerups(game)
    this.drawBombs(game)
    this.drawFlames(game)
    this.drawPlayers(game, dt)
    this.drawParticles(dt)

    if (game.suddenDeath && game.phase === 'playing' && Math.sin(this.time * 8) > 0) {
      this.centerText('☠ SUDDEN DEATH ☠', game, '#ff5252', 36)
    }
    if (paused) this.centerText('PAUSED', game, '#ffffff', 42)
    ctx.restore()
  }

  private centerText(text: string, game: Game, color: string, size: number): void {
    const ctx = this.ctx
    ctx.save()
    ctx.font = `bold ${size}px "Arial Black", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 6
    ctx.strokeStyle = 'rgba(0,0,0,0.7)'
    ctx.strokeText(text, (game.w * TILE) / 2, (game.h * TILE) / 2)
    ctx.fillStyle = color
    ctx.fillText(text, (game.w * TILE) / 2, (game.h * TILE) / 2)
    ctx.restore()
  }

  // ---------- HUD ----------

  private drawHud(game: Game): void {
    const ctx = this.ctx
    ctx.save()
    const grad = ctx.createLinearGradient(0, 0, 0, HUD_H)
    grad.addColorStop(0, '#1b2447')
    grad.addColorStop(1, '#131a36')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, this.canvas.width, HUD_H)
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    ctx.fillRect(0, HUD_H - 2, this.canvas.width, 2)

    const n = game.players.length
    const timerW = 96
    const chipW = Math.min(140, (this.canvas.width - timerW - 16) / n - 6)
    game.players.forEach((p, i) => {
      const x = 8 + i * (chipW + 6)
      const y = 8
      ctx.globalAlpha = p.alive ? 1 : 0.4
      ctx.fillStyle = 'rgba(255,255,255,0.07)'
      ctx.beginPath()
      ctx.roundRect(x, y, chipW, HUD_H - 16, 9)
      ctx.fill()
      this.drawMiniBomber(x + 17, y + (HUD_H - 16) / 2, PLAYER_COLORS[p.idx], p.alive)
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(p.name, x + 32, y + 12, chipW - 38)
      ctx.fillStyle = '#ffd24d'
      ctx.font = '11px sans-serif'
      ctx.fillText('★'.repeat(this.wins[p.idx] ?? 0) || '·', x + 32, y + 27, chipW - 38)
      ctx.globalAlpha = 1
    })

    const t = Math.max(0, Math.ceil(game.roundTime))
    const mm = Math.floor(t / 60)
    const ss = (t % 60).toString().padStart(2, '0')
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.font = 'bold 22px monospace'
    ctx.fillStyle = game.suddenDeath ? '#ff5252' : t <= 15 ? '#ffb74d' : '#e0e0e0'
    ctx.fillText(game.suddenDeath ? '!!' : `${mm}:${ss}`, this.canvas.width - 12, HUD_H / 2)
    ctx.restore()
  }

  /** Tiny bomberman head used as the HUD avatar. */
  private drawMiniBomber(x: number, y: number, color: string, alive: boolean): void {
    const ctx = this.ctx
    ctx.save()
    // ear flaps
    ctx.fillStyle = color
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.arc(x + s * 8, y + 1, 3.5, 0, Math.PI * 2)
      ctx.fill()
    }
    // antenna
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(x, y - 8)
    ctx.lineTo(x, y - 11)
    ctx.stroke()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y - 12.5, 2.5, 0, Math.PI * 2)
    ctx.fill()
    // head
    ctx.fillStyle = alive ? '#f5f6f8' : '#9aa0a8'
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(x, y, 9, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    // eyes
    ctx.fillStyle = OUTLINE
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(x + s * 3.2, y + 0.5, 1.5, 2.6, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  // ---------- board ----------

  private drawBoard(game: Game): void {
    const ctx = this.ctx
    for (let y = 0; y < game.h; y++) {
      for (let x = 0; x < game.w; x++) {
        const px = x * TILE
        const py = y * TILE
        ctx.fillStyle = (x + y) % 2 === 0 ? '#74b256' : '#6ca950'
        ctx.fillRect(px, py, TILE, TILE)

        const g = game.gimmicks[game.idx(x, y)]
        if (g?.kind === 'tramp') this.drawTrampoline(px, py)
        else if (g?.kind === 'conv') this.drawConveyor(px, py, g.dir)

        const c = game.cell(x, y)
        if (c === Cell.Solid) this.drawSolid(px, py)
        else if (c === Cell.Soft) this.drawCrate(px, py, 0)
        else if (c === Cell.Burning) {
          const t = game.burning.get(game.idx(x, y)) ?? 0
          this.drawCrate(px, py, 1 - t / 0.45)
        }
      }
    }
  }

  private drawSolid(px: number, py: number): void {
    const ctx = this.ctx
    ctx.fillStyle = '#aebdc8'
    ctx.fillRect(px, py, TILE, TILE)
    // bevel: light top/left, dark bottom/right
    ctx.fillStyle = '#cfd9e1'
    ctx.fillRect(px, py, TILE, 5)
    ctx.fillRect(px, py, 5, TILE)
    ctx.fillStyle = '#76828e'
    ctx.fillRect(px, py + TILE - 6, TILE, 6)
    ctx.fillRect(px + TILE - 6, py, 6, TILE)
    ctx.strokeStyle = '#5c6770'
    ctx.lineWidth = 2
    ctx.strokeRect(px + 1, py + 1, TILE - 2, TILE - 2)
    // a few studs for texture
    ctx.fillStyle = 'rgba(92,103,112,0.35)'
    ctx.beginPath()
    ctx.arc(px + TILE / 2, py + TILE / 2, 4, 0, Math.PI * 2)
    ctx.fill()
  }

  private drawCrate(px: number, py: number, burn: number): void {
    const ctx = this.ctx
    ctx.fillStyle = '#b5793f'
    ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2)
    ctx.fillStyle = '#c98e52'
    ctx.fillRect(px + 5, py + 5, TILE - 10, TILE - 10)
    ctx.strokeStyle = '#96622f'
    ctx.lineWidth = 2
    for (let i = 1; i < 3; i++) {
      ctx.beginPath()
      ctx.moveTo(px + 5, py + (TILE / 3) * i)
      ctx.lineTo(px + TILE - 5, py + (TILE / 3) * i)
      ctx.stroke()
    }
    ctx.strokeRect(px + 2, py + 2, TILE - 4, TILE - 4)
    // corner nails
    ctx.fillStyle = '#7a4d22'
    for (const [nx, ny] of [
      [8, 8],
      [TILE - 8, 8],
      [8, TILE - 8],
      [TILE - 8, TILE - 8],
    ]) {
      ctx.beginPath()
      ctx.arc(px + nx, py + ny, 2, 0, Math.PI * 2)
      ctx.fill()
    }
    if (burn > 0) {
      ctx.fillStyle = `rgba(255, ${140 - burn * 100}, 0, ${0.35 + burn * 0.6})`
      ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2)
    }
  }

  private drawTrampoline(px: number, py: number): void {
    const ctx = this.ctx
    const cx = px + TILE / 2
    const cy = py + TILE / 2
    const pulse = 1 + Math.sin(this.time * 5) * 0.06
    ctx.fillStyle = '#1565c0'
    ctx.beginPath()
    ctx.arc(cx, cy, 18 * pulse, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#90caf9'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(cx, cy, 12 * pulse, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, 5, 0, Math.PI * 2)
    ctx.stroke()
  }

  private drawConveyor(px: number, py: number, dir: number): void {
    const ctx = this.ctx
    ctx.fillStyle = '#455a64'
    ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2)
    ctx.save()
    ctx.translate(px + TILE / 2, py + TILE / 2)
    ctx.rotate((dir * Math.PI) / 2) // chevron apex points up at 0 = belt dir 'up'
    const scroll = ((this.time * 24) % 12) - 6
    ctx.strokeStyle = '#b0bec5'
    ctx.lineWidth = 3
    for (let i = -1; i <= 1; i++) {
      const off = i * 12 + scroll
      ctx.beginPath()
      ctx.moveTo(-8, off + 6)
      ctx.lineTo(0, off - 2)
      ctx.lineTo(8, off + 6)
      ctx.stroke()
    }
    ctx.restore()
  }

  private drawPowerups(game: Game): void {
    const ctx = this.ctx
    for (const [i, pu] of game.powerups) {
      const x = (i % game.w) * TILE
      const y = Math.floor(i / game.w) * TILE
      const bob = Math.sin(this.time * 4 + i) * 2
      ctx.fillStyle = pu === Powerup.Skull ? 'rgba(40,20,60,0.85)' : 'rgba(255,255,255,0.88)'
      ctx.strokeStyle = pu === Powerup.Skull ? '#7e57c2' : '#d7ccc8'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.roundRect(x + 7, y + 7 + bob, TILE - 14, TILE - 14, 8)
      ctx.fill()
      ctx.stroke()
      ctx.font = '24px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(POWERUP_ICONS[pu], x + TILE / 2, y + TILE / 2 + 2 + bob)
    }
  }

  private drawBombs(game: Game): void {
    const ctx = this.ctx
    for (const b of game.bombs) {
      const px = b.x * TILE
      const py = b.y * TILE
      let scale = 1
      if (b.mode === 'fly' && b.flight) {
        const k = b.flight.t / b.flight.dur
        scale = 1 + Math.sin(Math.PI * Math.min(k, 1)) * 0.7
      } else {
        const urgency = 1 - b.timer / BOMB_TIMER
        scale = 1 + Math.sin(this.time * (6 + urgency * 14)) * 0.08
      }
      const r = TILE * 0.36 * scale

      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      ctx.beginPath()
      ctx.ellipse(px, py + r * 0.7, r * 0.9, r * 0.4, 0, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = b.timer < 0.5 && Math.sin(this.time * 30) > 0 ? '#b71c1c' : '#263238'
      ctx.beginPath()
      ctx.arc(px, py, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      ctx.beginPath()
      ctx.arc(px - r * 0.3, py - r * 0.3, r * 0.35, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#8d6e63'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(px, py - r)
      ctx.quadraticCurveTo(px + 6, py - r - 8, px + 10, py - r - 4)
      ctx.stroke()
      ctx.fillStyle = Math.sin(this.time * 25) > 0 ? '#ffeb3b' : '#ff9800'
      ctx.beginPath()
      ctx.arc(px + 10, py - r - 4, 3.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  private drawFlames(game: Game): void {
    const ctx = this.ctx
    for (const [i, t] of game.flames) {
      const x = (i % game.w) * TILE + TILE / 2
      const y = Math.floor(i / game.w) * TILE + TILE / 2
      const k = t / 0.55
      const r = TILE * (0.55 + Math.sin(this.time * 22 + i) * 0.06) * (0.55 + 0.45 * k)
      const grad = ctx.createRadialGradient(x, y, 2, x, y, r)
      grad.addColorStop(0, 'rgba(255,255,220,0.98)')
      grad.addColorStop(0.4, 'rgba(255,200,60,0.95)')
      grad.addColorStop(0.8, 'rgba(255,90,30,0.8)')
      grad.addColorStop(1, 'rgba(255,60,0,0)')
      ctx.fillStyle = grad
      ctx.fillRect(x - r, y - r, r * 2, r * 2)
    }
  }

  // ---------- players ----------

  private drawPlayers(game: Game, dt: number): void {
    for (const p of game.players) {
      if (!p.alive) continue
      // Advance the walk cycle by distance moved (so speed affects stride rate).
      let g = this.gait.get(p.idx)
      if (!g) {
        g = { x: p.x, y: p.y, phase: 0, moving: 0 }
        this.gait.set(p.idx, g)
      }
      const dist = Math.abs(p.x - g.x) + Math.abs(p.y - g.y)
      g.phase += dist * 14
      g.moving = dist > 0.001 ? 1 : Math.max(0, g.moving - dt * 8)
      g.x = p.x
      g.y = p.y

      const flying = !!p.flight
      const lift = flying ? Math.sin(Math.PI * Math.min(p.flight!.t / p.flight!.dur, 1)) : 0
      const px = p.x * TILE
      const py = p.y * TILE - lift * 28

      // ground shadow
      const ctx = this.ctx
      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      ctx.beginPath()
      ctx.ellipse(
        p.x * TILE,
        p.y * TILE + TILE * 0.3,
        TILE * 0.3 * (1 - lift * 0.5),
        TILE * 0.12 * (1 - lift * 0.5),
        0,
        0,
        Math.PI * 2,
      )
      ctx.fill()

      const sick = p.disease !== null && Math.sin(this.time * 10) > 0
      this.drawBomber(px, py, p, g, lift, sick)

      // name tag
      ctx.font = 'bold 10px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'
      ctx.strokeText(p.name, px, py - 27)
      ctx.fillStyle = '#fff'
      ctx.fillText(p.name, px, py - 27)
    }
  }

  /** Classic bomberman look: white suit, colored helmet flaps/antenna/belt/feet. */
  private drawBomber(
    px: number,
    py: number,
    p: { idx: number; dir: number },
    g: { phase: number; moving: number },
    lift: number,
    sick: boolean,
  ): void {
    const ctx = this.ctx
    const color = PLAYER_COLORS[p.idx]
    const suit = sick ? '#cdeab4' : '#f5f6f8'
    const s = 1 + lift * 0.3
    ctx.save()
    ctx.translate(px, py)
    ctx.scale(s, s)
    const bob = Math.sin(g.phase * 2) * 1.2 * g.moving
    ctx.translate(0, bob)
    ctx.lineWidth = 2
    ctx.strokeStyle = OUTLINE

    // feet (alternate while walking)
    const step = Math.sin(g.phase * 2) * 3.5 * g.moving
    ctx.fillStyle = color
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.roundRect(side * 6 - 3.5, 13 + side * step * 0.5 - bob * 0.5, 7, 5.5, 2.5)
      ctx.fill()
      ctx.stroke()
    }

    // body
    ctx.fillStyle = suit
    ctx.beginPath()
    ctx.ellipse(0, 7, 9.5, 8.5, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    // belt
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.roundRect(-8.5, 7.5, 17, 4, 2)
    ctx.fill()

    // hands
    ctx.fillStyle = suit
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.arc(side * 11, 5 + side * step * 0.4, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }

    // antenna
    ctx.beginPath()
    ctx.moveTo(0, -19)
    ctx.lineTo(0, -23)
    ctx.stroke()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(0, -25, 3.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()

    // head
    ctx.fillStyle = suit
    ctx.beginPath()
    ctx.arc(0, -7, 12.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    // helmet ear flaps
    ctx.fillStyle = color
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.arc(side * 11.5, -5, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    // helmet seam
    ctx.beginPath()
    ctx.arc(0, -7, 12.5, Math.PI + 0.45, -0.45)
    ctx.stroke()

    // face: eyes follow facing dir
    const ex = p.dir === 1 ? 2.5 : p.dir === 3 ? -2.5 : 0
    const ey = p.dir === 2 ? 1.5 : p.dir === 0 ? -1.5 : 0
    ctx.fillStyle = OUTLINE
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(side * 4.2 + ex, -5.5 + ey, 1.9, 3.4, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    // rosy cheeks
    ctx.fillStyle = 'rgba(255,138,128,0.55)'
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.arc(side * 7.5 + ex * 0.5, -2 + ey * 0.5, 1.8, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  private drawParticles(dt: number): void {
    const ctx = this.ctx
    this.particles = this.particles.filter((pt) => (pt.life -= dt) > 0)
    for (const pt of this.particles) {
      pt.vy += pt.gravity * dt
      pt.x += pt.vx * dt * 60
      pt.y += pt.vy * dt * 60
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife)
      ctx.fillStyle = pt.color
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size)
    }
    ctx.globalAlpha = 1
  }
}
