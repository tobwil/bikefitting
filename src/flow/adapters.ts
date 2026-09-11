import type { AdapterBundle, MetricsApi, RulesApi, SessionsApi, SollApi } from './contracts.ts'
import { stubMetrics } from './stubs/metrics.ts'
import { stubRules } from './stubs/rules.ts'
import { stubSessions } from './stubs/sessions.ts'
import { stubSoll } from './stubs/soll.ts'
import type { AdapterSource } from './types.ts'

type UnknownMod = Record<string, unknown>

function pickFn(mod: UnknownMod | undefined, names: string[]): ((...args: never[]) => unknown) | undefined {
  if (!mod) return undefined
  const bags: UnknownMod[] = [mod]
  if (mod.default && typeof mod.default === 'object') bags.push(mod.default as UnknownMod)
  for (const bag of bags) {
    for (const name of names) {
      const value = bag[name]
      if (typeof value === 'function') return value as (...args: never[]) => unknown
    }
  }
  return undefined
}

function source(mod: UnknownMod | undefined, usedModule: boolean, usedStub: boolean): AdapterSource {
  if (!mod) return 'stub'
  if (usedModule && usedStub) return 'mixed'
  return usedModule ? 'module' : 'stub'
}

function bindSessions(mod?: UnknownMod): SessionsApi {
  const list = pickFn(mod, ['listSessions', 'list', 'loadAll'])
  const get = pickFn(mod, ['getSession', 'get', 'load'])
  const save = pickFn(mod, ['saveSession', 'save', 'upsert'])
  const remove = pickFn(mod, ['deleteSession', 'remove', 'delete'])
  const used = Boolean(list || get || save || remove)
  if (!used) return stubSessions
  return {
    source: source(mod, used, !list || !save),
    list: async () => (list ? ((await list()) as Awaited<ReturnType<SessionsApi['list']>>) : stubSessions.list()),
    get: async (id) => (get ? ((await get(id as never)) as Awaited<ReturnType<SessionsApi['get']>>) : stubSessions.get(id)),
    save: async (session) =>
      save ? ((await save(session as never)) as Awaited<ReturnType<SessionsApi['save']>>) : stubSessions.save(session),
    remove: async (id) => {
      if (remove) await remove(id as never)
      else await stubSessions.remove(id)
    },
  }
}

function bindMetrics(mod?: UnknownMod): MetricsApi {
  const liveCards = pickFn(mod, ['liveMetricCards', 'liveCards', 'computeLiveMetrics'])
  const quality = pickFn(mod, ['measureQuality', 'quality', 'summarizeQuality'])
  const used = Boolean(liveCards || quality)
  if (!used) return stubMetrics
  return {
    source: source(mod, used, !liveCards || !quality),
    liveCards: (input) =>
      liveCards ? (liveCards(input as never) as ReturnType<MetricsApi['liveCards']>) : stubMetrics.liveCards(input),
    quality: (input) =>
      quality ? (quality(input as never) as ReturnType<MetricsApi['quality']>) : stubMetrics.quality(input),
  }
}

function bindRules(mod?: UnknownMod): RulesApi {
  const recommend = pickFn(mod, ['recommend', 'prioritize', 'evaluateRules', 'runRules'])
  if (!recommend) return stubRules
  return {
    source: 'module',
    recommend: (input) => recommend(input as never) as ReturnType<RulesApi['recommend']>,
  }
}

function bindSoll(mod?: UnknownMod): SollApi {
  const ghost = pickFn(mod, ['sollGhost', 'ghost', 'sollForPhase', 'computeSoll'])
  if (!ghost) return stubSoll
  return {
    source: 'module',
    ghost: (input) => ghost(input as never) as ReturnType<SollApi['ghost']>,
  }
}

function folderOf(path: string): string | null {
  const match = path.match(/\/(sessions|metrics|rules|soll)\//)
  return match ? match[1] : null
}

export async function loadAdapters(): Promise<AdapterBundle> {
  const loaders = import.meta.glob<UnknownMod>('../{sessions,metrics,rules,soll}/index.ts')
  const loaded: Partial<Record<string, UnknownMod>> = {}
  await Promise.all(
    Object.entries(loaders).map(async ([key, load]) => {
      const folder = folderOf(key)
      if (!folder) return
      try {
        loaded[folder] = await load()
      } catch {
        /* keep stub */
      }
    }),
  )
  return {
    sessions: bindSessions(loaded.sessions),
    metrics: bindMetrics(loaded.metrics),
    rules: bindRules(loaded.rules),
    soll: bindSoll(loaded.soll),
  }
}
