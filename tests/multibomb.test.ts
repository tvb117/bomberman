import { describe, expect, it } from 'vitest'
import { Powerup } from '../src/core/types'
import { makeGame, step } from './helpers'

describe('multiple bombs end-to-end (through real inputs)', () => {
  it('after collecting extra-bomb powerups, repeated presses lay multiple bombs', () => {
    const g = makeGame(['1........', '.........', '........2'])
    g.powerups.set(g.idx(1, 0), Powerup.ExtraBomb)
    g.powerups.set(g.idx(2, 0), Powerup.ExtraBomb)
    // Walk over both powerups.
    step(g, 1.0, { 0: { dx: 1 } })
    expect(g.players[0].maxBombs).toBe(3)

    // Press (place), release, walk, press again, repeat.
    step(g, 0.1, { 0: { bomb: true } })
    step(g, 0.4, { 0: { dx: 1 } })
    step(g, 0.1, { 0: { bomb: true } })
    step(g, 0.4, { 0: { dx: 1 } })
    step(g, 0.1, { 0: { bomb: true } })
    expect(g.bombs.length).toBe(3)
  })

  it('holding the bomb key while walking lays a trail (hold-to-place)', () => {
    const g = makeGame(['1........', '.........', '........2'])
    g.players[0].maxBombs = 3
    // Hold bomb the whole time while walking right.
    step(g, 1.2, { 0: { dx: 1, bomb: true } })
    expect(g.bombs.length).toBe(3)
  })
})
