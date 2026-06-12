import type { PlayerInput } from './core/types'

export type Action = 'up' | 'down' | 'left' | 'right' | 'bomb' | 'punch'
export const ACTIONS: Action[] = ['up', 'down', 'left', 'right', 'bomb', 'punch']
export const ACTION_LABELS: Record<Action, string> = {
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  bomb: '💣 Bomb',
  punch: '🥊 Punch',
}

/** One binding per action (KeyboardEvent.code). */
export type KeyMap = Record<Action, string>

export const DEFAULT_KEYMAPS: KeyMap[] = [
  { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', bomb: 'KeyE', punch: 'KeyQ' },
  {
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    bomb: 'Enter',
    punch: 'ShiftRight',
  },
  { up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL', bomb: 'KeyO', punch: 'KeyU' },
  {
    up: 'Numpad8',
    down: 'Numpad5',
    left: 'Numpad4',
    right: 'Numpad6',
    bomb: 'Numpad0',
    punch: 'NumpadEnter',
  },
]

const STORAGE_KEY = 'atomicblast.keymaps.v1'

export function loadKeymaps(): KeyMap[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_KEYMAPS.map((m) => ({ ...m }))
    const parsed = JSON.parse(raw) as Partial<KeyMap>[]
    return DEFAULT_KEYMAPS.map((def, i) => ({ ...def, ...(parsed?.[i] ?? {}) }))
  } catch {
    return DEFAULT_KEYMAPS.map((m) => ({ ...m }))
  }
}

export function saveKeymaps(maps: KeyMap[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(maps))
  } catch {
    /* private browsing etc. — keep in-memory bindings */
  }
}

const SPECIAL_LABELS: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Enter: 'Enter',
  NumpadEnter: 'NumEnter',
  Space: 'Space',
  ShiftLeft: 'L-Shift',
  ShiftRight: 'R-Shift',
  ControlLeft: 'L-Ctrl',
  ControlRight: 'R-Ctrl',
  AltLeft: 'L-Alt',
  AltRight: 'R-Alt',
  Period: '.',
  Comma: ',',
  Slash: '/',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Minus: '-',
  Equal: '=',
  Tab: 'Tab',
  Backspace: '⌫',
}

/** Human-readable label for a KeyboardEvent.code. */
export function keyLabel(code: string): string {
  if (!code) return '—'
  if (code in SPECIAL_LABELS) return SPECIAL_LABELS[code]
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Numpad')) return 'Num' + code.slice(6)
  return code
}

export class Keyboard {
  private down = new Set<string>()

  constructor() {
    window.addEventListener('keydown', (e) => {
      this.down.add(e.code)
      if (
        e.code.startsWith('Arrow') ||
        e.code === 'Space' ||
        e.code === 'Enter' ||
        e.code === 'Tab' ||
        e.code.startsWith('Numpad')
      ) {
        e.preventDefault()
      }
    })
    window.addEventListener('keyup', (e) => this.down.delete(e.code))
    window.addEventListener('blur', () => this.down.clear())
  }

  isDown(code: string): boolean {
    return code !== '' && this.down.has(code)
  }

  inputFor(map: KeyMap): PlayerInput {
    const dx = (this.isDown(map.right) ? 1 : 0) - (this.isDown(map.left) ? 1 : 0)
    const dy = (this.isDown(map.down) ? 1 : 0) - (this.isDown(map.up) ? 1 : 0)
    return {
      dx: dx as -1 | 0 | 1,
      dy: dy as -1 | 0 | 1,
      bomb: this.isDown(map.bomb),
      punch: this.isDown(map.punch),
    }
  }
}
