import { describe, expect, it } from 'vitest'
import { makeGame, drop, step, teleport } from './helpers'

describe('trampolines', () => {
  it('launches a walking player three tiles in their direction', () => {
    const g = makeGame(['1.T......', '.........', '........2'])
    step(g, 0.9, { 0: { dx: 1 } })
    expect(g.players[0].flight).not.toBeNull() // mid-air over tiles 3-4
    step(g, 0.7, { 0: { dx: 1 } })
    expect(g.players[0].flight).toBeNull()
    expect(Math.floor(g.players[0].x)).toBeGreaterThanOrEqual(5) // landed at (5,0)+
  })

  it('flying players are immune to flames underneath', () => {
    const g = makeGame(['1.T......', '.........', '........2'])
    // Carpet the landing path with flames while the player is airborne.
    step(g, 0.9, { 0: { dx: 1 } })
    expect(g.players[0].flight).not.toBeNull()
    for (let x = 0; x < 9; x++) g.flames.set(g.idx(x, 0), 0.05) // brief flames everywhere
    step(g, 0.05)
    expect(g.players[0].alive).toBe(true) // airborne, untouched
  })
})

describe('conveyors', () => {
  it('pushes a standing player along the belt', () => {
    const g = makeGame(['1>>...', '......', '.....2'])
    step(g, 0.4, { 0: { dx: 1 } }) // step onto the belt
    step(g, 1.6) // hands off the keys; belt does the rest
    expect(Math.floor(g.players[0].x)).toBeGreaterThanOrEqual(3)
  })

  it('carries bombs and drops them at the end of the belt', () => {
    const g = makeGame(['..>>..', '......', '1....2'])
    teleport(g, 0, 2, 0)
    drop(g, 0)
    teleport(g, 0, 0, 2)
    step(g, 1.8)
    const b = g.bombs[0]
    expect(b).toBeDefined()
    expect(Math.floor(b.x)).toBe(4) // first tile past the belt
    expect(b.mode).toBe('idle')
  })
})

describe('sudden death', () => {
  it('rains blocks from the corner, crushing players', () => {
    const g = makeGame(['1..', '...', '..2'], { roundTime: 0.1 })
    step(g, 0.3)
    expect(g.suddenDeath).toBe(true)
    expect(g.cell(0, 0)).toBe(1) // Cell.Solid — spiral starts top-left
    expect(g.players[0].alive).toBe(false) // crushed
    expect(g.phase).toBe('over')
    expect(g.winner).toBe(1)
  })

  it('destroys bombs and powerups under falling blocks', () => {
    const g = makeGame(['1....', '.....', '....2'], { roundTime: 0.1 })
    drop(g, 0) // bomb at (0,0), the very first spiral tile
    g.powerups.set(g.idx(1, 0), 0)
    // Park both players deep in the spiral so the round keeps going.
    teleport(g, 0, 1, 1)
    teleport(g, 1, 3, 1)
    step(g, 0.5) // ~3 blocks fall; the bomb is crushed before its fuse ends
    expect(g.bombs.length).toBe(0)
    expect(g.powerups.size).toBe(0)
    expect(g.players[0].alive).toBe(true)
  })
})
