import { describe, expect, it } from 'vitest'
import { generateMap } from '../src/core/mapgen'
import { mulberry32 } from '../src/core/rng'
import { Cell } from '../src/core/types'
import { W, H } from '../src/core/constants'

describe('map generation', () => {
  it('builds the classic pillar pattern', () => {
    const m = generateMap(mulberry32(1), 'classic', 4)
    expect(m.w).toBe(W)
    expect(m.h).toBe(H)
    for (let y = 1; y < m.h; y += 2)
      for (let x = 1; x < m.w; x += 2) expect(m.grid[y * m.w + x]).toBe(Cell.Solid)
  })

  it('keeps spawn zones clear for all players', () => {
    const m = generateMap(mulberry32(7), 'classic', 6)
    expect(m.spawns.length).toBe(6)
    for (const [sx, sy] of m.spawns) {
      expect(m.grid[sy * m.w + sx]).toBe(Cell.Empty)
      for (const [dx, dy] of [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ]) {
        const nx = sx + dx
        const ny = sy + dy
        if (nx >= 0 && ny >= 0 && nx < m.w && ny < m.h) {
          expect(m.grid[ny * m.w + nx]).not.toBe(Cell.Soft)
        }
      }
    }
  })

  it('scatters soft blocks and hides powerups under some of them', () => {
    const m = generateMap(mulberry32(3), 'classic', 2)
    let soft = 0
    for (let i = 0; i < m.grid.length; i++) if (m.grid[i] === Cell.Soft) soft++
    expect(soft).toBeGreaterThan(40)
    expect(m.hidden.size).toBeGreaterThan(5)
    for (const i of m.hidden.keys()) expect(m.grid[i]).toBe(Cell.Soft)
  })

  it('gadgets arena has trampolines on cleared tiles', () => {
    const m = generateMap(mulberry32(5), 'gadgets', 2)
    const tramps = m.gimmicks.filter((g) => g?.kind === 'tramp')
    expect(tramps.length).toBe(5)
    m.gimmicks.forEach((g, i) => {
      if (g) expect(m.grid[i]).toBe(Cell.Empty)
    })
  })

  it('conveyor arena forms a closed clockwise belt loop', () => {
    const m = generateMap(mulberry32(5), 'conveyor', 2)
    const belts = m.gimmicks
      .map((g, i) => (g?.kind === 'conv' ? i : -1))
      .filter((i) => i >= 0)
    expect(belts.length).toBe(16)
    // Following each belt's direction must land on another belt tile (closed loop).
    const DX = [0, 1, 0, -1]
    const DY = [-1, 0, 1, 0]
    for (const i of belts) {
      const g = m.gimmicks[i]!
      if (g.kind !== 'conv') continue
      const x = (i % m.w) + DX[g.dir]
      const y = Math.floor(i / m.w) + DY[g.dir]
      expect(m.gimmicks[y * m.w + x]?.kind).toBe('conv')
    }
  })
})
