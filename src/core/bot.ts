import { Cell, DX, DY, Powerup, type PlayerInput } from './types'
import { BOMB_TIMER } from './constants'
import { mulberry32, type Rng } from './rng'
import type { Game } from './game'

const NONE: PlayerInput = { dx: 0, dy: 0, bomb: false, punch: false }

/**
 * Grid-based AI: keeps a danger map (tiles covered by bombs/flames),
 * flees danger, hunts powerups/crates/enemies, and only drops a bomb
 * when an escape route exists afterwards.
 */
export class BotController {
  private rng: Rng
  private aggression: number
  private replanIn = 0
  private path: number[] = []
  private wantBomb = false
  private wantPunch = false
  private bombHeld = false
  private punchHeld = false

  constructor(
    public readonly idx: number,
    seed: number,
  ) {
    this.rng = mulberry32(seed)
    this.aggression = 0.55 + this.rng() * 0.45
  }

  update(game: Game, dt: number): PlayerInput {
    const p = game.players[this.idx]
    if (!p.alive || p.flight) return NONE

    this.replanIn -= dt
    if (this.replanIn <= 0) {
      this.plan(game)
      this.replanIn = 0.08 + this.rng() * 0.07
    }

    let dx: -1 | 0 | 1 = 0
    let dy: -1 | 0 | 1 = 0
    const here = game.idx(Math.floor(p.x), Math.floor(p.y))
    while (this.path.length && this.path[0] === here) this.path.shift()
    if (this.path.length) {
      const n = this.path[0]
      const nx = (n % game.w) + 0.5
      const ny = Math.floor(n / game.w) + 0.5
      dx = Math.sign(nx - p.x) as -1 | 0 | 1
      dy = Math.sign(ny - p.y) as -1 | 0 | 1
      if (dx !== 0 && dy !== 0) {
        // One axis at a time; finish the bigger offset first.
        if (Math.abs(nx - p.x) >= Math.abs(ny - p.y)) dy = 0
        else dx = 0
      }
    }

    // Pulse buttons (release for one frame so edge detection fires next time).
    let bomb = false
    let punch = false
    if (this.wantBomb && !this.bombHeld) {
      bomb = true
      this.wantBomb = false
    }
    if (this.wantPunch && !this.punchHeld) {
      punch = true
      this.wantPunch = false
    }
    this.bombHeld = bomb
    this.punchHeld = punch
    return { dx, dy, bomb, punch }
  }

  // ---------- planning ----------

  private plan(game: Game): void {
    const p = game.players[this.idx]
    const danger = this.dangerMap(game)
    const start = game.idx(Math.floor(p.x), Math.floor(p.y))

    if (danger[start] < Infinity) {
      this.path = this.fleePath(game, start, danger)
      this.wantBomb = false
      return
    }

    // Standing safe: consider dropping a bomb here.
    if (this.shouldBomb(game, start, danger)) {
      this.wantBomb = true
      // Pre-plan the escape so we move out immediately.
      const withBomb = danger.slice()
      this.stampBlast(game, start, game.effPower(p), BOMB_TIMER, withBomb)
      this.path = this.fleePath(game, start, withBomb)
      return
    }

    // In danger of being cornered with no plan? Try punching a neighbour bomb away.
    this.path = this.seekPath(game, start, danger)
    if (!this.path.length && p.punch) {
      const fx = Math.floor(p.x) + DX[p.dir]
      const fy = Math.floor(p.y) + DY[p.dir]
      if (game.inBounds(fx, fy) && game.bombAt(fx, fy)) this.wantPunch = true
    }
  }

  /** Min time-to-flame per tile; Infinity = safe. */
  private dangerMap(game: Game): number[] {
    const d = new Array<number>(game.w * game.h).fill(Infinity)
    for (const [i] of game.flames) d[i] = 0
    for (const [i] of game.burning) d[i] = 0
    for (const b of game.bombs) {
      if (b.mode === 'fly') continue
      const tx = Math.floor(b.x)
      const ty = Math.floor(b.y)
      this.stampBlast(game, game.idx(tx, ty), b.power, b.timer, d)
    }
    return d
  }

  private stampBlast(game: Game, at: number, power: number, time: number, d: number[]): void {
    const tx = at % game.w
    const ty = Math.floor(at / game.w)
    d[at] = Math.min(d[at], time)
    for (let dir = 0; dir < 4; dir++) {
      for (let k = 1; k <= power; k++) {
        const nx = tx + DX[dir] * k
        const ny = ty + DY[dir] * k
        if (!game.inBounds(nx, ny)) break
        const c = game.cell(nx, ny)
        if (c === Cell.Solid || c === Cell.Soft || c === Cell.Burning) break
        const ni = game.idx(nx, ny)
        d[ni] = Math.min(d[ni], time)
        if (game.bombAt(nx, ny)) break
      }
    }
  }

  private walkable(game: Game, tx: number, ty: number, from: number): boolean {
    if (!game.inBounds(tx, ty)) return false
    if (game.cell(tx, ty) !== Cell.Empty) return false
    const b = game.bombAt(tx, ty)
    if (b && game.idx(tx, ty) !== from) return false
    return true
  }

  /** BFS to the nearest safe tile; may cross endangered tiles if there's time. */
  private fleePath(game: Game, start: number, danger: number[]): number[] {
    const p = game.players[this.idx]
    const tilesPerSec = game.effSpeed(p)
    const prev = new Map<number, number>()
    const seen = new Set<number>([start])
    const queue: [number, number][] = [[start, 0]]
    while (queue.length) {
      const [cur, steps] = queue.shift()!
      if (danger[cur] === Infinity && cur !== start) {
        return this.tracePath(prev, start, cur)
      }
      if (steps > 12) continue
      const cx = cur % game.w
      const cy = Math.floor(cur / game.w)
      for (let dir = 0; dir < 4; dir++) {
        const nx = cx + DX[dir]
        const ny = cy + DY[dir]
        const ni = ny * game.w + nx
        if (seen.has(ni) || !this.walkable(game, nx, ny, start)) continue
        // Only enter a doomed tile if we can be through it before it blows.
        const eta = (steps + 1) / tilesPerSec
        if (danger[ni] !== Infinity && danger[ni] < eta + 0.35) continue
        seen.add(ni)
        prev.set(ni, cur)
        queue.push([ni, steps + 1])
      }
    }
    return []
  }

  /** BFS over safe tiles scoring powerups, crate frontiers and enemies. */
  private seekPath(game: Game, start: number, danger: number[]): number[] {
    const prev = new Map<number, number>()
    const seen = new Set<number>([start])
    const queue: [number, number][] = [[start, 0]]
    let best = -1
    let bestScore = 0.5 // require at least mildly interesting targets
    while (queue.length) {
      const [cur, steps] = queue.shift()!
      const score = this.scoreTile(game, cur, steps)
      if (score > bestScore) {
        bestScore = score
        best = cur
      }
      if (steps > 14) continue
      const cx = cur % game.w
      const cy = Math.floor(cur / game.w)
      for (let dir = 0; dir < 4; dir++) {
        const nx = cx + DX[dir]
        const ny = cy + DY[dir]
        const ni = ny * game.w + nx
        if (seen.has(ni) || !this.walkable(game, nx, ny, start)) continue
        if (danger[ni] !== Infinity) continue
        seen.add(ni)
        prev.set(ni, cur)
        queue.push([ni, steps + 1])
      }
    }
    if (best < 0 || best === start) return []
    return this.tracePath(prev, start, best)
  }

  private scoreTile(game: Game, i: number, steps: number): number {
    const tx = i % game.w
    const ty = Math.floor(i / game.w)
    let score = 0
    const pu = game.powerups.get(i)
    if (pu !== undefined) score += pu === Powerup.Skull ? 2 : 100 - steps * 4
    for (let dir = 0; dir < 4; dir++) {
      const nx = tx + DX[dir]
      const ny = ty + DY[dir]
      if (game.inBounds(nx, ny) && game.cell(nx, ny) === Cell.Soft) {
        score += 30 - steps * 2
        break
      }
    }
    for (const q of game.players) {
      if (q.idx === this.idx || !q.alive) continue
      const d = Math.abs(Math.floor(q.x) - tx) + Math.abs(Math.floor(q.y) - ty)
      if (d <= 3) score += (18 - steps) * this.aggression
    }
    return score + this.rng() * 2
  }

  private tracePath(prev: Map<number, number>, start: number, end: number): number[] {
    const path = [end]
    let cur = end
    while (cur !== start) {
      const back = prev.get(cur)
      if (back === undefined) break
      path.push(back)
      cur = back
    }
    path.reverse()
    if (path[0] === start) path.shift()
    return path
  }

  private shouldBomb(game: Game, start: number, danger: number[]): boolean {
    const p = game.players[this.idx]
    if (game.activeBombsOf(this.idx) >= p.maxBombs) return false
    const tx = start % game.w
    const ty = Math.floor(start / game.w)
    if (game.bombAt(tx, ty)) return false

    let value = 0
    for (let dir = 0; dir < 4; dir++) {
      const nx = tx + DX[dir]
      const ny = ty + DY[dir]
      if (game.inBounds(nx, ny) && game.cell(nx, ny) === Cell.Soft) value += 1
    }
    // Enemy in the blast line with nothing in between?
    const power = game.effPower(p)
    for (const q of game.players) {
      if (q.idx === this.idx || !q.alive || q.flight) continue
      const qx = Math.floor(q.x)
      const qy = Math.floor(q.y)
      if (qx === tx && Math.abs(qy - ty) <= power && this.lineClear(game, tx, ty, qx, qy)) value += 2
      if (qy === ty && Math.abs(qx - tx) <= power && this.lineClear(game, tx, ty, qx, qy)) value += 2
    }
    if (value === 0) return false
    if (this.rng() > this.aggression) return false

    // Simulate our own bomb: do we still have an exit?
    const withBomb = danger.slice()
    this.stampBlast(game, start, power, BOMB_TIMER, withBomb)
    return this.fleePath(game, start, withBomb).length > 0
  }

  private lineClear(game: Game, x1: number, y1: number, x2: number, y2: number): boolean {
    const dx = Math.sign(x2 - x1)
    const dy = Math.sign(y2 - y1)
    let x = x1 + dx
    let y = y1 + dy
    while (x !== x2 || y !== y2) {
      if (game.cell(x, y) !== Cell.Empty || game.bombAt(x, y)) return false
      x += dx
      y += dy
    }
    return true
  }
}
