import { describe, expect, it } from 'vitest'
import { Cell } from '../src/core/types'
import { makeGame, step, tile } from './helpers'

describe('player movement', () => {
  it('moves right and is stopped by the arena edge', () => {
    const g = makeGame(['1....', '.....', '....2'])
    step(g, 2, { 0: { dx: 1 } })
    const p = g.players[0]
    expect(p.x).toBeGreaterThan(4.5)
    expect(p.x).toBeLessThan(4.7) // clamped just past the last tile's center
    expect(tile(g, 0)).toEqual([4, 0])
  })

  it('is blocked by solid and soft blocks', () => {
    const g = makeGame(['1#...', '.....', '....2'])
    step(g, 1, { 0: { dx: 1 } })
    expect(tile(g, 0)).toEqual([0, 0])

    const g2 = makeGame(['1+...', '.....', '....2'])
    step(g2, 1, { 0: { dx: 1 } })
    expect(tile(g2, 0)).toEqual([0, 0])
  })

  it('centers onto the lane when turning a corner', () => {
    const g = makeGame(['1....', '.....', '....2'])
    const p = g.players[0]
    p.y = 0.62 // slightly off-lane
    step(g, 1, { 0: { dx: 1 } })
    expect(Math.abs(p.y - 0.5)).toBeLessThan(0.01)
    expect(p.x).toBeGreaterThan(2)
  })

  it('speed powerups make the player faster', () => {
    const g1 = makeGame(['1......', '.......', '......2'])
    const g2 = makeGame(['1......', '.......', '......2'])
    g2.players[0].speedUps = 4
    step(g1, 0.5, { 0: { dx: 1 } })
    step(g2, 0.5, { 0: { dx: 1 } })
    expect(g2.players[0].x).toBeGreaterThan(g1.players[0].x)
  })

  it('cannot walk through a bomb placed by someone else', () => {
    const g = makeGame(['1.2..', '.....', '.....'])
    g.tryPlaceBomb(g.players[1]) // bomb at (2,0)
    step(g, 1.2, { 0: { dx: 1 } })
    expect(tile(g, 0)).toEqual([1, 0])
    expect(g.players[0].x).toBeLessThan(2)
  })

  it('can leave its own bomb tile but not come back onto it', () => {
    const g = makeGame(['1....', '.....', '....2'])
    g.tryPlaceBomb(g.players[0])
    step(g, 0.7, { 0: { dx: 1 } }) // walk off the bomb
    expect(tile(g, 0)).not.toEqual([0, 0])
    step(g, 0.7, { 0: { dx: -1 } }) // try to come back
    expect(tile(g, 0)).toEqual([1, 0])
  })
})

describe('grid integrity', () => {
  it('layout parser places cells and spawns', () => {
    const g = makeGame(['1#+..', '.....', '....2'])
    expect(g.cell(1, 0)).toBe(Cell.Solid)
    expect(g.cell(2, 0)).toBe(Cell.Soft)
    expect(tile(g, 0)).toEqual([0, 0])
    expect(tile(g, 1)).toEqual([4, 2])
  })
})
