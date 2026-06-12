import { Game } from '../src/core/game'
import { NO_INPUT, type GameOptions, type PlayerInput } from '../src/core/types'

export const P2 = [
  { name: 'A', isBot: false },
  { name: 'B', isBot: false },
]

export function makeGame(layout: string[], extra: Partial<GameOptions> = {}): Game {
  return new Game({ players: P2, seed: 42, layout, roundTime: 999, ...extra })
}

/** Step the simulation, feeding (partial) inputs per player index every tick. */
export function step(
  game: Game,
  seconds: number,
  inputs: Record<number, Partial<PlayerInput>> = {},
  dt = 1 / 60,
): void {
  const n = Math.max(1, Math.round(seconds / dt))
  for (let i = 0; i < n; i++) {
    const arr: PlayerInput[] = game.players.map((_, idx) => ({ ...NO_INPUT, ...inputs[idx] }))
    game.update(dt, arr)
  }
}

export function tile(game: Game, i: number): [number, number] {
  const p = game.players[i]
  return [Math.floor(p.x), Math.floor(p.y)]
}

/** Place a bomb for player i at their current tile (fails the test if rejected). */
export function drop(game: Game, i: number): void {
  if (!game.tryPlaceBomb(game.players[i])) throw new Error(`player ${i} could not place bomb`)
}

export function teleport(game: Game, i: number, tx: number, ty: number): void {
  game.players[i].x = tx + 0.5
  game.players[i].y = ty + 0.5
}
