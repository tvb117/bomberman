import { Cell, type Arena, type Dir, type Gimmick, Powerup } from './types'
import { W, H, SOFT_DENSITY, POWERUP_CHANCE } from './constants'
import { weighted, type Rng } from './rng'

export interface MapData {
  w: number
  h: number
  grid: Uint8Array
  gimmicks: (Gimmick | null)[]
  /** Powerups hidden under soft blocks, keyed by tile index. */
  hidden: Map<number, Powerup>
  spawns: [number, number][]
}

const POWERUP_WEIGHTS: readonly (readonly [Powerup, number])[] = [
  [Powerup.ExtraBomb, 25],
  [Powerup.Flame, 25],
  [Powerup.Speed, 15],
  [Powerup.Kick, 10],
  [Powerup.Punch, 10],
  [Powerup.Skull, 15],
]

/** Default spawn corners + mid edges, in player-slot order. */
export function defaultSpawns(w: number, h: number): [number, number][] {
  const mx = Math.floor(w / 2)
  return [
    [0, 0],
    [w - 1, h - 1],
    [w - 1, 0],
    [0, h - 1],
    [mx, 0],
    [mx, h - 1],
  ]
}

export function generateMap(rng: Rng, arena: Arena, numPlayers: number): MapData {
  const w = W
  const h = H
  const grid = new Uint8Array(w * h)
  const gimmicks: (Gimmick | null)[] = new Array(w * h).fill(null)
  const hidden = new Map<number, Powerup>()
  const spawns = defaultSpawns(w, h).slice(0, Math.max(2, numPlayers))

  // Classic pillar pattern.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (x % 2 === 1 && y % 2 === 1) grid[y * w + x] = Cell.Solid

  // Arena gimmicks carve out their tiles (even pillars give way to gadgets).
  if (arena === 'gadgets') {
    for (const [gx, gy] of [
      [4, 4],
      [10, 4],
      [4, 8],
      [10, 8],
      [7, 6],
    ]) {
      const i = gy * w + gx
      grid[i] = Cell.Empty
      gimmicks[i] = { kind: 'tramp' }
    }
  } else if (arena === 'conveyor') {
    // Clockwise ring around the center: rect (5,4)-(9,8) perimeter.
    const x1 = 5,
      y1 = 4,
      x2 = 9,
      y2 = 8
    const put = (x: number, y: number, dir: Dir) => {
      const i = y * w + x
      grid[i] = Cell.Empty
      gimmicks[i] = { kind: 'conv', dir }
    }
    for (let x = x1; x < x2; x++) put(x, y1, 1)
    for (let y = y1; y < y2; y++) put(x2, y, 2)
    for (let x = x2; x > x1; x--) put(x, y2, 3)
    for (let y = y2; y > y1; y--) put(x1, y, 0)
  }

  // Tiles kept clear around each spawn: the tile plus two straight in each direction.
  const safe = new Set<number>()
  for (const [sx, sy] of spawns) {
    safe.add(sy * w + sx)
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]) {
      for (let k = 1; k <= 2; k++) {
        const nx = sx + dx * k
        const ny = sy + dy * k
        if (nx >= 0 && ny >= 0 && nx < w && ny < h) safe.add(ny * w + nx)
      }
    }
  }

  for (let i = 0; i < w * h; i++) {
    if (grid[i] !== Cell.Empty || gimmicks[i] || safe.has(i)) continue
    if (rng() < SOFT_DENSITY) {
      grid[i] = Cell.Soft
      if (rng() < POWERUP_CHANCE) hidden.set(i, weighted(rng, POWERUP_WEIGHTS))
    }
  }

  return { w, h, grid, gimmicks, hidden, spawns }
}

const CONV_CHARS: Record<string, Dir> = { '^': 0, '>': 1, v: 2, '<': 3 }

/** Parse a test layout (see GameOptions.layout). */
export function parseLayout(rows: string[]): MapData {
  const h = rows.length
  const w = rows[0].length
  const grid = new Uint8Array(w * h)
  const gimmicks: (Gimmick | null)[] = new Array(w * h).fill(null)
  const spawnsByDigit: [number, number, number][] = []
  for (let y = 0; y < h; y++) {
    if (rows[y].length !== w) throw new Error(`layout row ${y} has wrong width`)
    for (let x = 0; x < w; x++) {
      const c = rows[y][x]
      const i = y * w + x
      if (c === '#') grid[i] = Cell.Solid
      else if (c === '+') grid[i] = Cell.Soft
      else if (c === 'T') gimmicks[i] = { kind: 'tramp' }
      else if (c in CONV_CHARS) gimmicks[i] = { kind: 'conv', dir: CONV_CHARS[c] }
      else if (c >= '1' && c <= '6') spawnsByDigit.push([parseInt(c, 10), x, y])
    }
  }
  spawnsByDigit.sort((a, b) => a[0] - b[0])
  const spawns = spawnsByDigit.map(([, x, y]) => [x, y] as [number, number])
  return { w, h, grid, gimmicks, hidden: new Map(), spawns }
}
