/** Verifies the rebind UI works and screenshots the new visuals. */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

mkdirSync('shots', { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 900, height: 920 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })
await page.waitForSelector('#controls table')
await page.screenshot({ path: 'shots/6-menu-controls.png' })

// Rebind P1 bomb from E to Space and verify label + persistence.
await page.click('.keybtn[data-p="0"][data-a="bomb"]')
await page.keyboard.press('Space')
const label = await page.textContent('.keybtn[data-p="0"][data-a="bomb"]')
if (label !== 'Space') {
  console.error('FAIL: rebind label is', JSON.stringify(label))
  process.exit(1)
}
const stored = await page.evaluate(() => localStorage.getItem('atomicblast.keymaps.v1'))
if (!stored?.includes('"bomb":"Space"')) {
  console.error('FAIL: rebind not persisted:', stored)
  process.exit(1)
}
console.log('rebind works and persists')

// Reset and confirm defaults come back.
await page.click('#btnResetKeys')
const restored = await page.textContent('.keybtn[data-p="0"][data-a="bomb"]')
if (restored !== 'E') {
  console.error('FAIL: reset did not restore E, got', restored)
  process.exit(1)
}
console.log('reset works')

// Verify the rebound key actually drives the player: bind P1 bomb to Space,
// start a 1-human game, press Space, expect a bomb to appear.
await page.click('.keybtn[data-p="0"][data-a="bomb"]')
await page.keyboard.press('Space')
await page.evaluate(() => window.__start(1, 1))
await page.waitForFunction(() => window.__game().state === 'playing')
await page.keyboard.down('Space') // hold so a (throttled) frame samples it
await page.waitForTimeout(400)
await page.keyboard.up('Space')
const bombs = await page.evaluate(() => window.__game().bombs)
if (bombs < 1) {
  console.error('FAIL: Space did not place a bomb')
  process.exit(1)
}
console.log('rebound key places bombs in-game')
await page.evaluate(() => localStorage.clear())

// Screenshot the new character art mid-game with 4 bots.
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })
await page.evaluate(() => window.__start(0, 4))
await page.waitForFunction(() => window.__game().state === 'playing')
await page.evaluate(() => window.__tick(3))
await page.waitForTimeout(300)
await page.screenshot({ path: 'shots/7-new-art.png' })

if (errors.length) {
  console.error('FAIL console errors:\n' + errors.join('\n'))
  process.exit(1)
}
console.log('OK: UI check passed')
await browser.close()
