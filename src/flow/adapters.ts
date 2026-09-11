import type { AdapterBundle } from './contracts.ts'
import { realMetrics } from './bindMetrics.ts'
import { realRules } from './bindRules.ts'
import { realSessions } from './bindSessions.ts'
import { realSoll } from './bindSoll.ts'

/** E4–E7 are on main. Bind the product journey to the real modules, not glob stubs. */
export async function loadAdapters(): Promise<AdapterBundle> {
  return {
    sessions: realSessions,
    metrics: realMetrics,
    rules: realRules,
    soll: realSoll,
  }
}
