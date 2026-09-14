import { LOCAL_APP_ID, LOCAL_ORIGIN, localOrigin } from './constants.ts'
import { parseBuildInfo, type BikeFitBuildInfo } from './buildInfo.ts'

export type ListenerProcess = {
  pid: number
  command: string
}

export type Occupant =
  | { kind: 'free' }
  | { kind: 'ours'; origin: string; info: BikeFitBuildInfo; listener: ListenerProcess | null }
  | { kind: 'foreign'; origin: string; listener: ListenerProcess | null; reason: string }

export type StarterPlan =
  | { action: 'reuse'; origin: string; info: BikeFitBuildInfo }
  | { action: 'start'; origin: string }
  | { action: 'block-foreign'; origin: string; message: string; listener: ListenerProcess | null }

export function foreignPortMessage(input: {
  origin: string
  listener: ListenerProcess | null
  reason?: string
}): string {
  const who = input.listener
    ? `PID ${input.listener.pid} (${input.listener.command})`
    : 'ein anderes Programm'
  const reason = input.reason ? ` ${input.reason}` : ''
  return [
    `Port ${new URL(input.origin).port} ist bereits belegt — aber nicht von BikeFit.`,
    `Belegt von: ${who}.${reason}`,
    'BikeFit beendet fremde Programme nicht und startet keinen zweiten Server.',
    'Bitte das andere Programm schließen. Danach erneut „BikeFit starten“ doppelklicken.',
    `Die App bleibt unter ${input.origin} (nicht localhost).`,
  ].join(' ')
}

export function classifyOccupant(input: {
  listening: boolean
  health: unknown
  listener?: ListenerProcess | null
  origin?: string
}): Occupant {
  const origin = input.origin ?? LOCAL_ORIGIN
  if (!input.listening) return { kind: 'free' }
  const info = parseBuildInfo(input.health)
  if (info) {
    return { kind: 'ours', origin, info, listener: input.listener ?? null }
  }
  const reason = input.health
    ? 'Die Antwort auf diesem Port ist nicht BikeFit.'
    : `Keine BikeFit-Kennung (${LOCAL_APP_ID}) unter ${origin}/bikefit-build.json.`
  return {
    kind: 'foreign',
    origin,
    listener: input.listener ?? null,
    reason,
  }
}

export function planStart(occupant: Occupant): StarterPlan {
  if (occupant.kind === 'ours') {
    return { action: 'reuse', origin: occupant.origin, info: occupant.info }
  }
  if (occupant.kind === 'foreign') {
    return {
      action: 'block-foreign',
      origin: occupant.origin,
      listener: occupant.listener,
      message: foreignPortMessage({
        origin: occupant.origin,
        listener: occupant.listener,
        reason: occupant.reason,
      }),
    }
  }
  return { action: 'start', origin: localOrigin() }
}

/** Parse `lsof -nP -iTCP:PORT -sTCP:LISTEN` so the dialog can name the foreign process. */
export function parseLsofListen(output: string): ListenerProcess | null {
  const lines = output.split(/\r?\n/).filter((line) => line.trim().length > 0)
  const data = lines.find((line) => !line.startsWith('COMMAND'))
  if (!data) return null
  const parts = data.trim().split(/\s+/)
  if (parts.length < 2) return null
  const command = parts[0]
  const pid = Number(parts[1])
  if (!command || !Number.isInteger(pid) || pid <= 0) return null
  return { pid, command }
}
