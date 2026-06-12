/**
 * Browser smoke test: loads the game in headless Chromium, starts a 4-bot
 * match via the window.__start hook, and verifies the simulation actually
 * runs (bots move, bombs get placed, rounds resolve). Saves screenshots.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173'
mkdirSync('shots', { recursive: true })

const fail = (msg) => {
  console.error('FAIL:', msg)
  process.exit(1)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 900, height: 860 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('#menu:not(.hidden)')
await page.screenshot({ path: 'shots/1-menu.png' })
console.log('menu rendered')

// Start a 0-human / 4-bot match so the game plays itself (short rounds).
await page.selectOption('#optTime', '60')
await page.evaluate(() => window.__start(0, 4))
await page.waitForFunction(() => window.__game().state === 'playing')
await page.waitForTimeout(1500)
await page.screenshot({ path: 'shots/2-early-game.png' })

const s1 = await page.evaluate(() => window.__game())
console.log('t=1.5s', JSON.stringify(s1))
if (s1.players.length !== 4) fail('expected 4 players')

// Let the bots fight; verify movement and bombing happened.
const start = await page.evaluate(() => window.__game())
await page.waitForTimeout(6000)
const mid = await page.evaluate(() => window.__game())
console.log('t=7.5s', JSON.stringify(mid))
const moved = mid.players.some(
  (p, i) => Math.abs(p.x - start.players[i].x) + Math.abs(p.y - start.players[i].y) > 0.5,
)
if (!moved) fail('bots never moved')
if (mid.time < 5) fail('simulation clock not advancing')
await page.screenshot({ path: 'shots/3-mid-game.png' })

// Wait for a kill or a full round to resolve (bots + sudden death guarantee progress).
const sawAction = await page
  .waitForFunction(
    () => {
      const g = window.__game()
      return g.bombs > 0 || g.flames > 0 || g.players.some((p) => !p.alive)
    },
    { timeout: 30000 },
  )
  .then(() => true)
  .catch(() => false)
if (!sawAction) fail('no bombs/flames/kills observed in 30s')
await page.screenshot({ path: 'shots/4-action.png' })
const s3 = await page.evaluate(() => window.__game())
console.log('action', JSON.stringify(s3))

// A full round must resolve. Headless rAF is throttled, so fast-forward the
// simulation deterministically: 2 minutes of game time covers sudden death,
// which guarantees termination even if the bots stalemate.
let roundDone = false
for (let i = 0; i < 6 && !roundDone; i++) {
  await page.evaluate(() => window.__tick(20))
  const g = await page.evaluate(() => window.__game())
  roundDone = g.wins.some((w) => w > 0) || g.state === 'roundEnd' || g.state === 'matchEnd'
}
await page.waitForTimeout(300) // let one rAF draw the final state
await page.screenshot({ path: 'shots/5-round-end.png' })
const s4 = await page.evaluate(() => window.__game())
console.log('round-end', JSON.stringify(s4))
if (!roundDone) fail('no round resolved within 150s')

if (errors.length) fail('console errors:\n' + errors.join('\n'))
console.log('OK: game runs in the browser, a full round resolved, no console errors')
await browser.close()
