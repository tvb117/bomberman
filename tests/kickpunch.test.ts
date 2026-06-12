import { describe, expect, it } from 'vitest'
import { makeGame, drop, step, teleport } from './helpers'

describe('kicking bombs', () => {
  it('walking into a bomb with the kick powerup sends it sliding to the wall', () => {
    const g = makeGame(['1........', '.........', '........2'])
    g.players[0].kick = true
    teleport(g, 0, 1, 0)
    drop(g, 0) // bomb at (1,0)
    teleport(g, 0, 0, 0)
    step(g, 1.5, { 0: { dx: 1 } }) // walk right into the bomb; it slides at 6 tiles/s
    const b = g.bombs[0]
    expect(b).toBeDefined()
    expect(Math.floor(b.x)).toBe(8) // slid to the far wall
    expect(b.y).toBeCloseTo(0.5, 1)
  })

  it('without the powerup the bomb stays put', () => {
    const g = makeGame(['1........', '.........', '........2'])
    teleport(g, 0, 1, 0)
    drop(g, 0)
    teleport(g, 0, 0, 0)
    step(g, 0.8, { 0: { dx: 1 } })
    expect(Math.floor(g.bombs[0].x)).toBe(1)
  })

  it('a kicked bomb stops in front of another bomb', () => {
    const g = makeGame(['1........', '.........', '........2'])
    g.players[0].kick = true
    g.players[0].maxBombs = 2
    teleport(g, 0, 6, 0)
    drop(g, 0) // blocker at (6,0)
    teleport(g, 0, 1, 0)
    drop(g, 0) // bomb to kick at (1,0)
    teleport(g, 0, 0, 0)
    step(g, 0.8, { 0: { dx: 1 } })
    const kicked = g.bombs.find((b) => Math.floor(b.x) !== 6)!
    expect(Math.floor(kicked.x)).toBe(5)
  })
})

describe('punching bombs', () => {
  it('punches a bomb three tiles ahead', () => {
    const g = makeGame(['1........', '.........', '........2'])
    g.players[0].punch = true
    teleport(g, 0, 1, 0)
    drop(g, 0)
    teleport(g, 0, 0, 0)
    g.players[0].dir = 1 // facing right
    step(g, 0.05, { 0: { punch: true } })
    expect(g.bombs[0].mode).toBe('fly')
    step(g, 1)
    expect(g.bombs[0].mode).toBe('idle')
    expect(Math.floor(g.bombs[0].x)).toBe(4) // 1 + 3
  })

  it('a punched bomb wraps around the arena edge', () => {
    const g = makeGame(['1........', '.........', '........2'])
    g.players[0].punch = true
    teleport(g, 0, 7, 0)
    drop(g, 0) // bomb at (7,0)
    teleport(g, 0, 6, 0)
    g.players[0].dir = 1
    step(g, 0.05, { 0: { punch: true } })
    step(g, 1)
    expect(Math.floor(g.bombs[0].x)).toBe(1) // 7+3=10 -> wraps to 1 on width 9
  })

  it('bounces onward when the landing tile is blocked', () => {
    const g = makeGame(['1...#....', '.........', '........2'])
    g.players[0].punch = true
    teleport(g, 0, 1, 0)
    drop(g, 0)
    teleport(g, 0, 0, 0)
    g.players[0].dir = 1
    step(g, 0.05, { 0: { punch: true } })
    step(g, 1.5)
    expect(g.bombs[0].mode).toBe('idle')
    expect(Math.floor(g.bombs[0].x)).toBe(5) // target (4,0) is solid -> bounce to 5
  })

  it('punching needs the powerup', () => {
    const g = makeGame(['1........', '.........', '........2'])
    teleport(g, 0, 1, 0)
    drop(g, 0)
    teleport(g, 0, 0, 0)
    g.players[0].dir = 1
    step(g, 0.05, { 0: { punch: true } })
    expect(g.bombs[0].mode).toBe('idle')
  })
})
