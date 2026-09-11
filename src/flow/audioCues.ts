/** Short Web Audio cues so the rider need not watch the screen. No microphone. */

let sharedCtx: AudioContext | null = null

function audioContext(): AudioContext | null {
  const Ctor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new Ctor()
  }
  return sharedCtx
}

function tone(ctx: AudioContext, startAt: number, frequency: number, duration: number, gain = 0.12) {
  const osc = ctx.createOscillator()
  const amp = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(frequency, startAt)
  amp.gain.setValueAtTime(0.0001, startAt)
  amp.gain.exponentialRampToValueAtTime(gain, startAt + 0.012)
  amp.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)
  osc.connect(amp)
  amp.connect(ctx.destination)
  osc.start(startAt)
  osc.stop(startAt + duration + 0.02)
}

export type CountdownCue = 'start' | 'end'

export function playCountdownCue(kind: CountdownCue): void {
  const ctx = audioContext()
  if (!ctx) return
  void ctx.resume().then(() => {
    const t = ctx.currentTime + 0.02
    if (kind === 'start') {
      tone(ctx, t, 660, 0.11, 0.14)
      tone(ctx, t + 0.14, 880, 0.12, 0.14)
      return
    }
    tone(ctx, t, 523, 0.1, 0.13)
    tone(ctx, t + 0.11, 784, 0.24, 0.16)
  })
}
