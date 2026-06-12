import {
  Cell,
  Disease,
  DISEASE_COUNT,
  DX,
  DY,
  NO_INPUT,
  Powerup,
  type Bomb,
  type Dir,
  type GameEvent,
  type GameOptions,
  type Gimmick,
  type Player,
  type PlayerInput,
} from './types'
import {
  AIR_COOLDOWN,
  BASE_SPEED,
  BOMB_TIMER,
  BURN_TIME,
  CONVEYOR_SPEED,
  DEFAULT_ROUND_TIME,
  DISEASE_TIME,
  FLAME_TIME,
  FLY_SPEED,
  KICK_SPEED,
  MAX_BOMBS_CAP,
  MAX_POWER_CAP,
  MAX_SPEED_UPS,
  PLAYER_R,
  PUNCH_TILES,
  SD_INTERVAL,
  SLOW_SPEED,
  SPEED_INC,
  SPEEDY_SPEED,
  TOUCH_DIST,
} from './constants'
import { generateMap, parseLayout, type MapData } from './mapgen'
import { mulberry32, randInt, type Rng } from './rng'

const EPS = 1e-4

export class Game {
  readonly w: number
  readonly h: number
  readonly grid: Uint8Array
  readonly gimmicks: (Gimmick | null)[]
  readonly hidden: Map<number, Powerup>
  readonly players: Player[]
  bombs: Bomb[] = []
  /** Flame timers by tile index. */
  flames = new Map<number, number>()
  /** Burning-crate timers by tile index. */
  burning = new Map<number, number>()
  /** Revealed powerups on the floor by tile index. */
  powerups = new Map<number, Powerup>()

  roundTime: number
  suddenDeath = false
  phase: 'playing' | 'over' = 'playing'
  winner: number | null = null
  overTime = 0
  time = 0

  private rng: Rng
  private bombSeq = 1
  private events: GameEvent[] = []
  private sdOrder: number[] = []
  private sdPos = 0
  private sdTimer = 0

  constructor(opts: GameOptions) {
    this.rng = mulberry32(opts.seed ?? 1)
    const map: MapData = opts.layout
      ? parseLayout(opts.layout)
      : generateMap(this.rng, opts.arena ?? 'classic', opts.players.length)
    this.w = map.w
    this.h = map.h
    this.grid = map.grid
    this.gimmicks = map.gimmicks
    this.hidden = map.hidden
    this.roundTime = opts.roundTime ?? DEFAULT_ROUND_TIME

    this.players = opts.players.map((spec, idx) => {
      const [sx, sy] = map.spawns[idx] ?? [0, 0]
      return {
        idx,
        name: spec.name,
        isBot: spec.isBot,
        alive: true,
        x: sx + 0.5,
        y: sy + 0.5,
        dir: 2 as Dir,
        speedUps: 0,
        maxBombs: 1,
        power: 2,
        kick: false,
        punch: false,
        disease: null,
        diseaseT: 0,
        flight: null,
        airCool: 0,
        prevBomb: false,
        prevPunch: false,
      }
    })

    this.buildSpiral()
  }

  // ---------- public helpers ----------

  idx(tx: number, ty: number): number {
    return ty * this.w + tx
  }

  cell(tx: number, ty: number): Cell {
    return this.grid[this.idx(tx, ty)] as Cell
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h
  }

  tileOf(p: { x: number; y: number }): [number, number] {
    return [Math.floor(p.x), Math.floor(p.y)]
  }

  bombAt(tx: number, ty: number): Bomb | undefined {
    return this.bombs.find(
      (b) => b.mode !== 'fly' && Math.floor(b.x) === tx && Math.floor(b.y) === ty,
    )
  }

  playerAt(tx: number, ty: number, except = -1): Player | undefined {
    return this.players.find(
      (p) =>
        p.alive &&
        !p.flight &&
        p.idx !== except &&
        Math.floor(p.x) === tx &&
        Math.floor(p.y) === ty,
    )
  }

  aliveCount(): number {
    return this.players.filter((p) => p.alive).length
  }

  activeBombsOf(owner: number): number {
    return this.bombs.filter((b) => b.owner === owner).length
  }

  drainEvents(): GameEvent[] {
    const e = this.events
    this.events = []
    return e
  }

  effSpeed(p: Player): number {
    if (p.disease === Disease.Slow) return SLOW_SPEED
    if (p.disease === Disease.Speedy) return SPEEDY_SPEED
    return BASE_SPEED + SPEED_INC * p.speedUps
  }

  effPower(p: Player): number {
    return p.disease === Disease.ShortFlame ? 1 : p.power
  }

  // ---------- main loop ----------

  update(dt: number, inputs: (PlayerInput | undefined)[] = []): void {
    dt = Math.min(dt, 0.05)
    this.time += dt
    if (this.phase === 'over') this.overTime += dt

    this.updateTimerAndSuddenDeath(dt)

    for (const p of this.players) {
      if (!p.alive) continue
      this.updatePlayer(p, inputs[p.idx] ?? NO_INPUT, dt)
    }
    this.spreadDiseases()
    this.updateBombs(dt)
    this.updateFlames(dt)
    this.killPlayersInFlames()
    this.checkRoundEnd()
  }

  // ---------- timers / sudden death ----------

  private buildSpiral(): void {
    // Outside-in clockwise spiral covering every tile.
    let x1 = 0,
      y1 = 0,
      x2 = this.w - 1,
      y2 = this.h - 1
    while (x1 <= x2 && y1 <= y2) {
      for (let x = x1; x <= x2; x++) this.sdOrder.push(this.idx(x, y1))
      for (let y = y1 + 1; y <= y2; y++) this.sdOrder.push(this.idx(x2, y))
      if (y2 > y1) for (let x = x2 - 1; x >= x1; x--) this.sdOrder.push(this.idx(x, y2))
      if (x2 > x1) for (let y = y2 - 1; y > y1; y--) this.sdOrder.push(this.idx(x1, y))
      x1++
      y1++
      x2--
      y2--
    }
  }

  private updateTimerAndSuddenDeath(dt: number): void {
    if (this.phase === 'over') return
    this.roundTime -= dt
    if (this.roundTime <= 0 && !this.suddenDeath) {
      this.suddenDeath = true
      this.sdTimer = 0
      this.events.push({ type: 'sdStart' })
    }
    if (!this.suddenDeath) return
    this.sdTimer -= dt
    while (this.sdTimer <= 0 && this.sdPos < this.sdOrder.length) {
      this.sdTimer += SD_INTERVAL
      const i = this.sdOrder[this.sdPos++]
      if (this.grid[i] === Cell.Solid) continue
      const tx = i % this.w
      const ty = Math.floor(i / this.w)
      this.grid[i] = Cell.Solid
      this.gimmicks[i] = null
      this.flames.delete(i)
      this.burning.delete(i)
      this.powerups.delete(i)
      this.hidden.delete(i)
      this.bombs = this.bombs.filter(
        (b) => b.mode === 'fly' || Math.floor(b.x) !== tx || Math.floor(b.y) !== ty,
      )
      for (const p of this.players) {
        if (p.alive && !p.flight && Math.floor(p.x) === tx && Math.floor(p.y) === ty)
          this.killPlayer(p)
      }
      this.events.push({ type: 'sdBlock', x: tx, y: ty })
    }
  }

  // ---------- players ----------

  private updatePlayer(p: Player, input: PlayerInput, dt: number): void {
    if (p.airCool > 0) p.airCool -= dt
    if (p.disease !== null) {
      p.diseaseT -= dt
      if (p.diseaseT <= 0) p.disease = null
    }

    if (p.flight) {
      this.updatePlayerFlight(p, dt)
      p.prevBomb = input.bomb
      p.prevPunch = input.punch
      return
    }

    // Conveyor drag.
    const [ctx, cty] = this.tileOf(p)
    const g = this.gimmicks[this.idx(ctx, cty)]
    if (g?.kind === 'conv') this.slide(p, g.dir, CONVEYOR_SPEED * dt)

    // Voluntary movement.
    let dx = input.dx
    let dy = input.dy
    if (p.disease === Disease.Reverse) {
      dx = -dx as -1 | 0 | 1
      dy = -dy as -1 | 0 | 1
    }
    if (dx !== 0 || dy !== 0) {
      // Prefer the axis perpendicular to the current heading so taps turn corners.
      const horizFirst = dx !== 0 && !(dy !== 0 && (p.dir === 1 || p.dir === 3))
      const first: Dir = horizFirst ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0
      const second: Dir | null =
        dx !== 0 && dy !== 0 ? (horizFirst ? (dy > 0 ? 2 : 0) : dx > 0 ? 1 : 3) : null
      const dist = this.effSpeed(p) * dt
      const ox = p.x
      const oy = p.y
      p.dir = first
      this.slide(p, first, dist)
      if (second !== null && Math.abs(p.x - ox) + Math.abs(p.y - oy) < dist * 0.25) {
        p.dir = second
        this.slide(p, second, dist)
      }
    }

    this.checkTrampoline(p)
    this.checkPickup(p)
    this.updateBombPasses(p)

    // Bomb drop: edge-triggered, or continuous with diarrhea.
    const wantsBomb = (input.bomb && !p.prevBomb) || p.disease === Disease.Diarrhea
    if (wantsBomb) this.tryPlaceBomb(p)
    if (input.punch && !p.prevPunch) this.tryPunch(p)
    p.prevBomb = input.bomb
    p.prevPunch = input.punch
  }

  /** Move player in dir by dist with lane centering + wall clamping. */
  private slide(p: Player, dir: Dir, dist: number): void {
    let guard = 16
    while (dist > EPS && guard-- > 0) {
      const horiz = dir === 1 || dir === 3
      const tx = Math.floor(p.x)
      const ty = Math.floor(p.y)
      if (horiz) {
        // Center onto the row first.
        const lane = ty + 0.5
        const off = lane - p.y
        if (Math.abs(off) > EPS) {
          const step = Math.min(dist, Math.abs(off))
          p.y += Math.sign(off) * step
          dist -= step
          continue
        }
        const sign = dir === 1 ? 1 : -1
        const nx = tx + sign
        if (this.passableFor(p, nx, ty)) {
          const boundary = sign > 0 ? tx + 1.5 : tx - 0.5
          const step = Math.min(dist, Math.abs(boundary - p.x) + EPS)
          p.x += sign * step
          dist -= step
        } else {
          const limit = sign > 0 ? tx + 1 - PLAYER_R : tx + PLAYER_R
          const newX = p.x + sign * dist
          p.x = sign > 0 ? Math.min(newX, limit) : Math.max(newX, limit)
          this.maybeKick(p, nx, ty, dir)
          return
        }
      } else {
        const lane = tx + 0.5
        const off = lane - p.x
        if (Math.abs(off) > EPS) {
          const step = Math.min(dist, Math.abs(off))
          p.x += Math.sign(off) * step
          dist -= step
          continue
        }
        const sign = dir === 2 ? 1 : -1
        const ny = ty + sign
        if (this.passableFor(p, tx, ny)) {
          const boundary = sign > 0 ? ty + 1.5 : ty - 0.5
          const step = Math.min(dist, Math.abs(boundary - p.y) + EPS)
          p.y += sign * step
          dist -= step
        } else {
          const limit = sign > 0 ? ty + 1 - PLAYER_R : ty + PLAYER_R
          const newY = p.y + sign * dist
          p.y = sign > 0 ? Math.min(newY, limit) : Math.max(newY, limit)
          this.maybeKick(p, tx, ny, dir)
          return
        }
      }
    }
  }

  private passableFor(p: Player, tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return false
    const c = this.cell(tx, ty)
    if (c !== Cell.Empty) return false
    const b = this.bombAt(tx, ty)
    if (b && !b.pass.has(p.idx)) return false
    return true
  }

  private maybeKick(p: Player, tx: number, ty: number, dir: Dir): void {
    if (!p.kick || !this.inBounds(tx, ty)) return
    const b = this.bombAt(tx, ty)
    if (!b || b.mode !== 'idle') return
    const nx = tx + DX[dir]
    const ny = ty + DY[dir]
    if (!this.bombSlideFree(nx, ny)) return
    b.mode = 'slide'
    b.dir = dir
    b.speed = KICK_SPEED
    b.onBelt = false
    this.events.push({ type: 'kick', x: tx, y: ty })
  }

  private bombSlideFree(tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return false
    if (this.cell(tx, ty) !== Cell.Empty) return false
    if (this.bombAt(tx, ty)) return false
    if (this.powerups.has(this.idx(tx, ty))) return false
    if (this.playerAt(tx, ty)) return false
    return true
  }

  private checkTrampoline(p: Player): void {
    if (p.airCool > 0) return
    const [tx, ty] = this.tileOf(p)
    const g = this.gimmicks[this.idx(tx, ty)]
    if (g?.kind !== 'tramp') return
    if (Math.abs(p.x - (tx + 0.5)) > 0.25 || Math.abs(p.y - (ty + 0.5)) > 0.25) return
    const dir = p.dir
    p.flight = {
      fromX: p.x,
      fromY: p.y,
      toTx: tx + DX[dir] * PUNCH_TILES,
      toTy: ty + DY[dir] * PUNCH_TILES,
      t: 0,
      dur: PUNCH_TILES / FLY_SPEED + 0.18,
      dir,
    }
    this.events.push({ type: 'tramp', x: tx, y: ty, player: p.idx })
  }

  private wrapTx(tx: number): number {
    return ((tx % this.w) + this.w) % this.w
  }

  private wrapTy(ty: number): number {
    return ((ty % this.h) + this.h) % this.h
  }

  private updatePlayerFlight(p: Player, dt: number): void {
    const f = p.flight!
    f.t += dt
    if (f.t < f.dur) {
      const k = f.t / f.dur
      p.x = f.fromX + (f.toTx + 0.5 - f.fromX) * k
      p.y = f.fromY + (f.toTy + 0.5 - f.fromY) * k
      return
    }
    const ltx = this.wrapTx(f.toTx)
    const lty = this.wrapTy(f.toTy)
    const free =
      this.cell(ltx, lty) === Cell.Empty && !this.bombAt(ltx, lty) && !this.playerAt(ltx, lty, p.idx)
    if (free) {
      p.x = ltx + 0.5
      p.y = lty + 0.5
      p.flight = null
      p.airCool = AIR_COOLDOWN
    } else {
      // Bounce one more tile forward (wrapped) until a free tile shows up.
      p.flight = {
        fromX: ltx + 0.5,
        fromY: lty + 0.5,
        toTx: ltx + DX[f.dir],
        toTy: lty + DY[f.dir],
        t: 0,
        dur: 1 / FLY_SPEED + 0.08,
        dir: f.dir,
      }
      p.x = ltx + 0.5
      p.y = lty + 0.5
    }
  }

  private checkPickup(p: Player): void {
    const [tx, ty] = this.tileOf(p)
    const i = this.idx(tx, ty)
    const pu = this.powerups.get(i)
    if (pu === undefined) return
    this.powerups.delete(i)
    switch (pu) {
      case Powerup.ExtraBomb:
        p.maxBombs = Math.min(p.maxBombs + 1, MAX_BOMBS_CAP)
        break
      case Powerup.Flame:
        p.power = Math.min(p.power + 1, MAX_POWER_CAP)
        break
      case Powerup.Speed:
        p.speedUps = Math.min(p.speedUps + 1, MAX_SPEED_UPS)
        break
      case Powerup.Kick:
        p.kick = true
        break
      case Powerup.Punch:
        p.punch = true
        break
      case Powerup.Skull:
        this.infect(p, randInt(this.rng, DISEASE_COUNT) as Disease)
        this.events.push({ type: 'skull', x: tx, y: ty, player: p.idx })
        return
    }
    this.events.push({ type: 'pickup', x: tx, y: ty, player: p.idx, powerup: pu })
  }

  infect(p: Player, d: Disease): void {
    p.disease = d
    p.diseaseT = DISEASE_TIME
  }

  private spreadDiseases(): void {
    for (const a of this.players) {
      if (!a.alive || a.flight || a.disease === null) continue
      for (const b of this.players) {
        if (b === a || !b.alive || b.flight) continue
        const dx = a.x - b.x
        const dy = a.y - b.y
        if (dx * dx + dy * dy < TOUCH_DIST * TOUCH_DIST && b.disease !== a.disease) {
          this.infect(b, a.disease)
        }
      }
    }
  }

  private updateBombPasses(p: Player): void {
    const [tx, ty] = this.tileOf(p)
    for (const b of this.bombs) {
      if (b.pass.has(p.idx) && (Math.floor(b.x) !== tx || Math.floor(b.y) !== ty)) {
        b.pass.delete(p.idx)
      }
    }
  }

  tryPlaceBomb(p: Player): boolean {
    if (p.disease === Disease.Constipation) return false
    if (this.activeBombsOf(p.idx) >= p.maxBombs) return false
    const [tx, ty] = this.tileOf(p)
    if (this.cell(tx, ty) !== Cell.Empty || this.bombAt(tx, ty)) return false
    const pass = new Set<number>()
    for (const q of this.players) {
      if (q.alive && Math.floor(q.x) === tx && Math.floor(q.y) === ty) pass.add(q.idx)
    }
    this.bombs.push({
      id: this.bombSeq++,
      owner: p.idx,
      x: tx + 0.5,
      y: ty + 0.5,
      power: this.effPower(p),
      timer: BOMB_TIMER,
      mode: 'idle',
      dir: 0,
      speed: 0,
      pass,
      flight: null,
      onBelt: false,
    })
    this.events.push({ type: 'place', x: tx, y: ty })
    return true
  }

  private tryPunch(p: Player): void {
    const [tx, ty] = this.tileOf(p)
    if (!p.punch) return
    const bx = tx + DX[p.dir]
    const by = ty + DY[p.dir]
    if (!this.inBounds(bx, by)) return
    const b = this.bombAt(bx, by)
    if (!b) return
    b.mode = 'fly'
    b.pass.clear()
    b.onBelt = false
    b.flight = {
      fromX: b.x,
      fromY: b.y,
      toTx: bx + DX[p.dir] * PUNCH_TILES,
      toTy: by + DY[p.dir] * PUNCH_TILES,
      t: 0,
      dur: PUNCH_TILES / FLY_SPEED,
      dir: p.dir,
    }
    this.events.push({ type: 'punch', x: bx, y: by })
  }

  // ---------- bombs / explosions ----------

  private updateBombs(dt: number): void {
    const explode: Bomb[] = []

    for (const b of this.bombs) {
      if (b.mode === 'fly') {
        this.updateBombFlight(b, dt)
        continue
      }
      // Conveyors grab idle bombs; belts re-steer sliding belt-bombs at tile centers.
      const tx = Math.floor(b.x)
      const ty = Math.floor(b.y)
      const g = this.gimmicks[this.idx(tx, ty)]
      if (b.mode === 'idle' && g?.kind === 'conv') {
        const nx = tx + DX[g.dir]
        const ny = ty + DY[g.dir]
        if (this.bombSlideFree(nx, ny)) {
          b.mode = 'slide'
          b.dir = g.dir
          b.speed = CONVEYOR_SPEED
          b.onBelt = true
        }
      }
      if (b.mode === 'slide') this.updateBombSlide(b, dt)

      b.timer -= dt
      if (b.timer <= 0) explode.push(b)
      else if (this.flames.has(this.idx(Math.floor(b.x), Math.floor(b.y)))) explode.push(b)
    }

    for (const b of explode) this.explodeBomb(b)
  }

  private updateBombSlide(b: Bomb, dt: number): void {
    let dist = b.speed * dt
    let guard = 16
    while (dist > EPS && guard-- > 0) {
      const tx = Math.floor(b.x)
      const ty = Math.floor(b.y)
      const cx = tx + 0.5
      const cy = ty + 0.5
      // Signed progress past the current tile center, along the slide direction.
      const prog = (b.x - cx) * DX[b.dir] + (b.y - cy) * DY[b.dir]
      if (prog < -EPS) {
        // Just crossed into this tile: carry on to its center.
        const step = Math.min(dist, -prog)
        b.x += DX[b.dir] * step
        b.y += DY[b.dir] * step
        dist -= step
        continue
      }
      if (prog <= EPS) {
        // At a tile center: belts re-steer; rolling off the belt's end stops the bomb.
        if (b.onBelt) {
          const g = this.gimmicks[this.idx(tx, ty)]
          if (g?.kind === 'conv') {
            b.dir = g.dir
          } else {
            b.x = cx
            b.y = cy
            b.mode = 'idle'
            b.onBelt = false
            return
          }
        }
        const nx = tx + DX[b.dir]
        const ny = ty + DY[b.dir]
        if (!this.bombSlideFree(nx, ny)) {
          b.x = cx
          b.y = cy
          b.mode = 'idle'
          return
        }
      }
      const step = Math.min(dist, 1 - prog)
      b.x += DX[b.dir] * step
      b.y += DY[b.dir] * step
      dist -= step
    }
  }

  private updateBombFlight(b: Bomb, dt: number): void {
    const f = b.flight!
    f.t += dt
    if (f.t < f.dur) {
      const k = f.t / f.dur
      b.x = f.fromX + (f.toTx + 0.5 - f.fromX) * k
      b.y = f.fromY + (f.toTy + 0.5 - f.fromY) * k
      return
    }
    const ltx = this.wrapTx(f.toTx)
    const lty = this.wrapTy(f.toTy)
    const free =
      this.cell(ltx, lty) === Cell.Empty && !this.bombAt(ltx, lty) && !this.playerAt(ltx, lty)
    if (free) {
      b.x = ltx + 0.5
      b.y = lty + 0.5
      b.mode = 'idle'
      b.flight = null
      b.timer = Math.max(b.timer, 0.4)
    } else {
      b.flight = {
        fromX: ltx + 0.5,
        fromY: lty + 0.5,
        toTx: ltx + DX[f.dir],
        toTy: lty + DY[f.dir],
        t: 0,
        dur: 1 / FLY_SPEED,
        dir: f.dir,
      }
      b.x = ltx + 0.5
      b.y = lty + 0.5
    }
  }

  private explodeBomb(first: Bomb): void {
    const queue = [first]
    const done = new Set<number>()
    while (queue.length) {
      const b = queue.shift()!
      if (done.has(b.id)) continue
      done.add(b.id)
      const i = this.bombs.indexOf(b)
      if (i < 0) continue
      this.bombs.splice(i, 1)
      if (b.mode === 'fly') continue // safety: flying bombs don't blow mid-air

      const tx = Math.floor(b.x)
      const ty = Math.floor(b.y)
      this.events.push({ type: 'explosion', x: tx, y: ty })
      this.addFlame(tx, ty)
      for (let dir = 0; dir < 4; dir++) {
        for (let k = 1; k <= b.power; k++) {
          const nx = tx + DX[dir] * k
          const ny = ty + DY[dir] * k
          if (!this.inBounds(nx, ny)) break
          const c = this.cell(nx, ny)
          if (c === Cell.Solid) break
          if (c === Cell.Soft) {
            this.igniteCrate(nx, ny)
            break
          }
          if (c === Cell.Burning) break
          const ni = this.idx(nx, ny)
          if (this.powerups.has(ni)) {
            this.powerups.delete(ni)
            this.addFlame(nx, ny)
            break
          }
          const other = this.bombAt(nx, ny)
          this.addFlame(nx, ny)
          if (other && !done.has(other.id)) {
            queue.push(other)
            break
          }
        }
      }
    }
  }

  private addFlame(tx: number, ty: number): void {
    const i = this.idx(tx, ty)
    this.flames.set(i, Math.max(this.flames.get(i) ?? 0, FLAME_TIME))
    this.powerups.delete(i)
  }

  private igniteCrate(tx: number, ty: number): void {
    const i = this.idx(tx, ty)
    this.grid[i] = Cell.Burning
    this.burning.set(i, BURN_TIME)
    this.events.push({ type: 'crate', x: tx, y: ty })
  }

  private updateFlames(dt: number): void {
    for (const [i, t] of this.flames) {
      if (t - dt <= 0) this.flames.delete(i)
      else this.flames.set(i, t - dt)
    }
    for (const [i, t] of this.burning) {
      if (t - dt <= 0) {
        this.burning.delete(i)
        this.grid[i] = Cell.Empty
        const pu = this.hidden.get(i)
        if (pu !== undefined) {
          this.hidden.delete(i)
          this.powerups.set(i, pu)
          this.events.push({ type: 'reveal', x: i % this.w, y: Math.floor(i / this.w), powerup: pu })
        }
      } else {
        this.burning.set(i, t - dt)
      }
    }
  }

  private killPlayersInFlames(): void {
    for (const p of this.players) {
      if (!p.alive || p.flight) continue
      const [tx, ty] = this.tileOf(p)
      if (this.flames.has(this.idx(tx, ty))) this.killPlayer(p)
    }
  }

  killPlayer(p: Player): void {
    if (!p.alive) return
    p.alive = false
    p.disease = null
    this.events.push({ type: 'death', x: p.x, y: p.y, player: p.idx })
  }

  private checkRoundEnd(): void {
    if (this.phase === 'over' || this.players.length < 2) return
    if (this.aliveCount() <= 1) {
      this.phase = 'over'
      const survivor = this.players.find((p) => p.alive)
      this.winner = survivor ? survivor.idx : null
      this.events.push({ type: 'roundOver', winner: this.winner })
    }
  }
}
