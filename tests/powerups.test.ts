import { describe, expect, it } from 'vitest'
import { Powerup, Disease } from '../src/core/types'
import { BASE_SPEED, DISEASE_TIME, SPEED_INC } from '../src/core/constants'
import { makeGame, step, teleport } from './helpers'

describe('powerups', () => {
  function pickup(pu: Powerup) {
    const g = makeGame(['1....', '.....', '....2'])
    g.powerups.set(g.idx(1, 0), pu)
    step(g, 0.6, { 0: { dx: 1 } })
    expect(g.powerups.has(g.idx(1, 0))).toBe(false)
    return g
  }

  it('extra bomb raises the limit', () => {
    const g = pickup(Powerup.ExtraBomb)
    expect(g.players[0].maxBombs).toBe(2)
  })

  it('flame raises blast power', () => {
    const g = pickup(Powerup.Flame)
    expect(g.players[0].power).toBe(3)
  })

  it('speed stacks', () => {
    const g = pickup(Powerup.Speed)
    expect(g.players[0].speedUps).toBe(1)
    expect(g.effSpeed(g.players[0])).toBeCloseTo(BASE_SPEED + SPEED_INC)
  })

  it('kick and punch unlock abilities', () => {
    expect(pickup(Powerup.Kick).players[0].kick).toBe(true)
    expect(pickup(Powerup.Punch).players[0].punch).toBe(true)
  })

  it('skull infects with a disease', () => {
    const g = pickup(Powerup.Skull)
    expect(g.players[0].disease).not.toBeNull()
    expect(g.players[0].diseaseT).toBeGreaterThan(0)
  })
})

describe('diseases', () => {
  it('constipation blocks bomb placement', () => {
    const g = makeGame(['1....', '.....', '....2'])
    g.infect(g.players[0], Disease.Constipation)
    expect(g.tryPlaceBomb(g.players[0])).toBe(false)
  })

  it('diarrhea drops bombs involuntarily', () => {
    const g = makeGame(['1....', '.....', '....2'])
    g.players[0].maxBombs = 3
    g.infect(g.players[0], Disease.Diarrhea)
    step(g, 0.2)
    expect(g.bombs.length).toBeGreaterThan(0)
  })

  it('reversed controls invert movement', () => {
    const g = makeGame(['.1...', '.....', '....2'])
    g.infect(g.players[0], Disease.Reverse)
    step(g, 0.4, { 0: { dx: 1 } })
    expect(g.players[0].x).toBeLessThan(1.5) // pressed right, went left
  })

  it('short flame caps bomb power at 1', () => {
    const g = makeGame(['1....', '.....', '....2'])
    g.players[0].power = 5
    g.infect(g.players[0], Disease.ShortFlame)
    expect(g.effPower(g.players[0])).toBe(1)
  })

  it('slow disease overrides speed boosts', () => {
    const g = makeGame(['1....', '.....', '....2'])
    g.players[0].speedUps = 6
    g.infect(g.players[0], Disease.Slow)
    expect(g.effSpeed(g.players[0])).toBeLessThan(BASE_SPEED)
  })

  it('cures itself after its duration', () => {
    const g = makeGame(['1....', '.....', '....2'])
    g.infect(g.players[0], Disease.Constipation)
    step(g, DISEASE_TIME + 0.2)
    expect(g.players[0].disease).toBeNull()
  })

  it('spreads on contact between players', () => {
    const g = makeGame(['1.2..', '.....', '.....'])
    g.infect(g.players[0], Disease.Reverse)
    teleport(g, 1, 0, 0) // same tile -> touching
    g.players[1].x = 0.6
    step(g, 0.1)
    expect(g.players[1].disease).toBe(Disease.Reverse)
  })
})
