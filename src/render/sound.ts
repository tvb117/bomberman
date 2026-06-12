import type { GameEvent } from '../core/types'

/** Tiny procedural WebAudio synth — no audio assets needed. */
export class Sound {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  muted = false

  /** Must be called from a user gesture before sounds play. */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume()
      return
    }
    const AC = window.AudioContext ?? (window as any).webkitAudioContext
    if (!AC) return
    this.ctx = new AC()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.35
    this.master.connect(this.ctx.destination)
  }

  toggleMute(): boolean {
    this.muted = !this.muted
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.35
    return this.muted
  }

  consumeEvents(events: GameEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'explosion':
          this.boom()
          break
        case 'place':
          this.blip(220, 0.06, 'square', 0.4)
          break
        case 'pickup':
          this.arp([523, 659, 784], 0.06)
          break
        case 'skull':
          this.slide(400, 80, 0.5, 'sawtooth', 0.5)
          break
        case 'death':
          this.slide(600, 60, 0.6, 'square', 0.5)
          break
        case 'kick':
          this.blip(160, 0.08, 'triangle', 0.6)
          break
        case 'punch':
          this.slide(200, 500, 0.12, 'square', 0.4)
          break
        case 'tramp':
          this.slide(250, 900, 0.25, 'sine', 0.6)
          break
        case 'sdStart':
          this.arp([400, 350, 300, 250], 0.15, 'sawtooth')
          break
        case 'roundOver':
          this.arp([523, 659, 784, 1047], 0.1)
          break
        default:
          break
      }
    }
  }

  private env(dur: number, vol: number): GainNode | null {
    if (!this.ctx || !this.master) return null
    const g = this.ctx.createGain()
    const t = this.ctx.currentTime
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    g.connect(this.master)
    return g
  }

  private blip(freq: number, dur: number, type: OscillatorType, vol: number): void {
    if (!this.ctx) return
    const g = this.env(dur, vol)
    if (!g) return
    const o = this.ctx.createOscillator()
    o.type = type
    o.frequency.value = freq
    o.connect(g)
    o.start()
    o.stop(this.ctx.currentTime + dur)
  }

  private slide(from: number, to: number, dur: number, type: OscillatorType, vol: number): void {
    if (!this.ctx) return
    const g = this.env(dur, vol)
    if (!g) return
    const o = this.ctx.createOscillator()
    o.type = type
    const t = this.ctx.currentTime
    o.frequency.setValueAtTime(from, t)
    o.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + dur)
    o.connect(g)
    o.start()
    o.stop(t + dur)
  }

  private arp(freqs: number[], step: number, type: OscillatorType = 'square'): void {
    if (!this.ctx) return
    freqs.forEach((f, i) => {
      setTimeout(() => this.blip(f, step * 1.5, type, 0.35), i * step * 1000)
    })
  }

  private boom(): void {
    if (!this.ctx) return
    const g = this.env(0.5, 0.9)
    if (!g) return
    const dur = 0.5
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2)
    }
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(900, this.ctx.currentTime)
    filter.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + dur)
    src.connect(filter)
    filter.connect(g)
    src.start()
  }
}
