import { describe, expect, it } from 'vitest'
import { Cell, Powerup } from '../src/core/types'
import { BOMB_TIMER, BURN_TIME, FLAME_TIME } from '../src/core/constants'
import { makeGame, drop, step, teleport } from './helpers'

describe('bombs and explosions', () => {
  it('explodes after its fuse and spreads flames by power', () => {
    const g = makeGame(['1......', '.......', '.......', '......2'])
    drop(g, 0) // power 2 at (0,0)
    teleport(g, 0, 6, 0)
    step(g, BOMB_TIMER + 0.05)
    expect(g.bombs.length).toBe(0)
    for (const [x, y] of [
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [0, 2],
    ]) {
      expect(g.flames.has(g.idx(x, y)), `flame at ${x},${y}`).toBe(true)
    }
    expect(g.flames.has(g.idx(3, 0))).toBe(false) // power 2 reaches only 2 tiles
    step(g, FLAME_TIME + 0.05)
    expect(g.flames.size).toBe(0)
  })

  it('flames are stopped by solid walls', () => {
    const g = makeGame(['1#.....', '.......', '.......', '......2'])
    drop(g, 0)
    teleport(g, 0, 6, 2)
    step(g, BOMB_TIMER + 0.05)
    expect(g.flames.has(g.idx(1, 0))).toBe(false)
    expect(g.flames.has(g.idx(2, 0))).toBe(false)
  })

  it('burns soft blocks, stops there, and reveals hidden powerups', () => {
    const g = makeGame(['1.+....', '.......', '.......', '......2'])
    g.hidden.set(g.idx(2, 0), Powerup.Kick)
    drop(g, 0)
    teleport(g, 0, 6, 2)
    step(g, BOMB_TIMER + 0.05)
    expect(g.cell(2, 0)).toBe(Cell.Burning)
    expect(g.flames.has(g.idx(3, 0))).toBe(false) // didn't pierce the crate
    step(g, BURN_TIME + 0.05)
    expect(g.cell(2, 0)).toBe(Cell.Empty)
    expect(g.powerups.get(g.idx(2, 0))).toBe(Powerup.Kick)
  })

  it('chain-reacts neighbouring bombs instantly', () => {
    const g = makeGame(['1......', '.......', '.......', '......2'])
    g.players[0].maxBombs = 2
    drop(g, 0) // (0,0)
    teleport(g, 0, 2, 0)
    step(g, 0.5) // wait so the second fuse lags the first
    drop(g, 0) // (2,0) — alone it would blow at t=3.0
    teleport(g, 0, 6, 3)
    step(g, BOMB_TIMER - 0.5 + 0.05) // t just past the FIRST fuse only
    expect(g.bombs.length).toBe(0) // both gone via chain
    expect(g.flames.has(g.idx(4, 0))).toBe(true) // second bomb's blast happened
  })

  it('respects the simultaneous bomb limit', () => {
    const g = makeGame(['1......', '.......', '.......', '......2'])
    expect(g.tryPlaceBomb(g.players[0])).toBe(true)
    teleport(g, 0, 3, 0)
    expect(g.tryPlaceBomb(g.players[0])).toBe(false) // maxBombs = 1
    g.players[0].maxBombs = 2
    expect(g.tryPlaceBomb(g.players[0])).toBe(true)
  })

  it('flames destroy revealed powerups on the floor', () => {
    const g = makeGame(['1......', '.......', '.......', '......2'])
    g.powerups.set(g.idx(2, 0), Powerup.Speed)
    drop(g, 0)
    teleport(g, 0, 6, 3)
    step(g, BOMB_TIMER + 0.05)
    expect(g.powerups.has(g.idx(2, 0))).toBe(false)
  })

  it('kills players standing in flames and ends the round', () => {
    const g = makeGame(['1.2....', '.......', '.......', '.......'])
    drop(g, 0)
    teleport(g, 0, 6, 3)
    step(g, BOMB_TIMER + 0.1)
    expect(g.players[1].alive).toBe(false)
    expect(g.phase).toBe('over')
    expect(g.winner).toBe(0)
  })

  it('a draw when the last two players die together', () => {
    const g = makeGame(['1.2....', '.......', '.......', '.......'])
    teleport(g, 0, 1, 0)
    drop(g, 0) // bomb between both players, power 2 covers both
    teleport(g, 0, 0, 0)
    step(g, BOMB_TIMER + 0.1)
    expect(g.players[0].alive).toBe(false)
    expect(g.players[1].alive).toBe(false)
    expect(g.phase).toBe('over')
    expect(g.winner).toBeNull()
  })
})
