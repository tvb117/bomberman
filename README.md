# 💣 Atomic Blast

A browser-based, Atomic Bomberman-style local-multiplayer game. Pure TypeScript +
Canvas 2D — no game framework. The whole rule set lives in a framework-free
simulation core (`src/core/`) so it is fully unit-tested.

## Play

```bash
npm install
npm run dev        # open the printed URL (default http://localhost:5173)
```

Pick humans (0–4) and bots (total 2–6), an arena, and hit **START GAME**.
Set humans to 0 to watch a bot battle.

All keys are **rebindable**: click any key button in the menu, press the new
key (saved to localStorage; "Reset controls" restores defaults).

| Player | Move (default) | Bomb | Punch |
| ------ | -------------- | ---- | ----- |
| P1 | WASD | E | Q |
| P2 | Arrows | Enter | Right-Shift |
| P3 | IJKL | O | U |
| P4 | Numpad 8/4/5/6 | Numpad 0 | NumpadEnter |

`P` pause · `M` mute · `Esc` back to menu.

## Rules

Classic Bomberman: last bomber standing wins the round, first to N round wins
takes the match. Bombs (2.5 s fuse) blast crates open in four directions and
chain-react; crates hide powerups:

💣 extra bomb · 🔥 bigger blast · ⚡ speed · 🥾 **kick** (walk into a bomb to send
it sliding) · 🥊 **punch** (knock the bomb ahead of you 3 tiles over walls — it
wraps around the arena!) · 💀 **skull**: a random disease (reversed controls,
constant diarrhea-bombing, constipation, slow, turbo, tiny flames) that spreads
to anyone you touch.

Arenas can feature **trampolines** (fling you 3 tiles over everything) and
**conveyor belts** (carry players *and* bombs). When the clock hits zero,
**sudden death** rains indestructible blocks in a spiral until someone is
crushed... or everyone is.

## Develop

```bash
npm test                        # 48 Vitest unit tests for the rules engine
npm run build                   # type-check + production bundle (dist/)
npm run preview                 # serve the production build
node scripts/browser-check.mjs  # headless-Chromium end-to-end check (needs Node 18+)
```

Layout: `src/core/` simulation (game rules, map gen, bot AI, seeded RNG) —
`src/render/` canvas renderer + WebAudio synth — `src/main.ts` menu/match flow —
`tests/` Vitest suites using ASCII-art map layouts.
