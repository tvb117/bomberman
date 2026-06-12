/** Grid cell contents. Stored in a flat Uint8Array, index = y * w + x. */
export enum Cell {
  Empty = 0,
  Solid = 1,
  Soft = 2,
  Burning = 3,
}

/** Direction: 0 up, 1 right, 2 down, 3 left. */
export type Dir = 0 | 1 | 2 | 3
export const DX = [0, 1, 0, -1]
export const DY = [-1, 0, 1, 0]

export enum Powerup {
  ExtraBomb = 0,
  Flame = 1,
  Speed = 2,
  Kick = 3,
  Punch = 4,
  Skull = 5,
}

export enum Disease {
  Slow = 0,
  Speedy = 1,
  Reverse = 2,
  Constipation = 3,
  Diarrhea = 4,
  ShortFlame = 5,
}
export const DISEASE_COUNT = 6

export type Gimmick = { kind: 'tramp' } | { kind: 'conv'; dir: Dir }

export interface PlayerInput {
  dx: -1 | 0 | 1
  dy: -1 | 0 | 1
  bomb: boolean
  punch: boolean
}

export const NO_INPUT: PlayerInput = { dx: 0, dy: 0, bomb: false, punch: false }

export interface PlayerSpec {
  name: string
  isBot: boolean
}

export type Arena = 'classic' | 'gadgets' | 'conveyor'

export interface GameOptions {
  players: PlayerSpec[]
  seed?: number
  arena?: Arena
  roundTime?: number
  /**
   * Test hook: explicit map layout instead of random generation.
   * One string per row. Characters:
   *   '.' empty  '#' solid  '+' soft  'T' trampoline
   *   '^' '>' 'v' '<' conveyor   '1'-'6' player spawn (empty tile)
   */
  layout?: string[]
}

export interface Flight {
  fromX: number
  fromY: number
  /** Unwrapped target tile coords (may be off-grid; wrapped on landing). */
  toTx: number
  toTy: number
  t: number
  dur: number
  dir: Dir
}

export type BombMode = 'idle' | 'slide' | 'fly'

export interface Bomb {
  id: number
  owner: number
  x: number
  y: number
  power: number
  timer: number
  mode: BombMode
  dir: Dir
  /** Sliding speed in tiles/sec (kick vs conveyor differ). */
  speed: number
  /** Player indices allowed to pass through (standing on it when placed). */
  pass: Set<number>
  flight: Flight | null
  /** True while the bomb is riding a conveyor belt. */
  onBelt: boolean
}

export interface Player {
  idx: number
  name: string
  isBot: boolean
  alive: boolean
  x: number
  y: number
  dir: Dir
  speedUps: number
  maxBombs: number
  power: number
  kick: boolean
  punch: boolean
  disease: Disease | null
  diseaseT: number
  flight: Flight | null
  /** Grace period after landing before a trampoline can re-launch. */
  airCool: number
  prevPunch: boolean
}

export type GameEvent =
  | { type: 'explosion'; x: number; y: number }
  | { type: 'place'; x: number; y: number }
  | { type: 'pickup'; x: number; y: number; player: number; powerup: Powerup }
  | { type: 'skull'; x: number; y: number; player: number }
  | { type: 'death'; x: number; y: number; player: number }
  | { type: 'kick'; x: number; y: number }
  | { type: 'punch'; x: number; y: number }
  | { type: 'tramp'; x: number; y: number; player: number }
  | { type: 'crate'; x: number; y: number }
  | { type: 'reveal'; x: number; y: number; powerup: Powerup }
  | { type: 'sdStart' }
  | { type: 'sdBlock'; x: number; y: number }
  | { type: 'roundOver'; winner: number | null }
