import { describe, expect, it } from 'vitest'
import { Game } from '../src/core/game'
import { BotController } from '../src/core/bot'
import { NO_INPUT, type PlayerInput } from '../src/core/types'
import { BOMB_TIMER } from '../src/core/constants'
import { makeGame, teleport } from './helpers'

function runWithBots(game: Game, bots: BotController[], seconds: number): number {
  let places = 0
  const dt = 1 / 60
  for (let i = 0; i < seconds * 60; i++) {
    const inputs: PlayerInput[] = game.players.map(() => ({ ...NO_INPUT }))
    for (const b of bots) inputs[b.idx] = b.update(game, dt)
    game.update(dt, inputs)
    for (const e of game.drainEvents()) if (e.type === 'place') places++
    if (game.phase === 'over') break
  }
  return places
}

describe('bot AI', () => {
  it('flees out of a bomb blast line and survives', () => {
    const g = makeGame(['1....', '.....', '....2'])
    teleport(g, 1, 1, 0)
    g.tryPlaceBomb(g.players[1]) // bomb at (1,0): covers the bot's tile
    teleport(g, 1, 4, 2)
    const bot = new BotController(0, 1)
    runWithBots(g, [bot], BOMB_TIMER + 0.5)
    expect(g.bombs.length).toBe(0) // it exploded
    expect(g.players[0].alive).toBe(true) // bot got out of the way
  })

  it('plays a real match: explores, drops bombs, and someone survives', () => {
    const g = new Game({
      players: [
        { name: 'BotA', isBot: true },
        { name: 'BotB', isBot: true },
      ],
      seed: 1234,
      arena: 'classic',
      roundTime: 999,
    })
    const bots = [new BotController(0, 11), new BotController(1, 22)]
    const places = runWithBots(g, bots, 20)
    expect(places).toBeGreaterThan(0) // bots actually bomb crates/each other
    expect(g.players.some((p) => p.alive)).toBe(true) // not a mutual instant suicide
  })

  it('does not bomb itself into a corner with no escape', () => {
    // Dead-end corridor: dropping a bomb at the end would be suicide.
    const g = makeGame(['1+...', '#####', '....2'])
    const bot = new BotController(0, 3)
    runWithBots(g, [bot], 4)
    // Whatever it did, it must still be alive.
    expect(g.players[0].alive).toBe(true)
  })
})
