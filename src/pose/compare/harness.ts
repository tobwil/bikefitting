import { DEFAULT_POSE_MODEL, POSE_HEAVY_REASON } from '../../config/models.ts'
import { fileFixtureCompareClip, parseAnnotatedSequence, syntheticCompareClip } from './clips.ts'
import { createModelCache, refuseHeavyModel } from './cache.ts'
import { formatDecisionNote } from './decision.ts'
import { createCompareRunner } from './runCompare.ts'
import { simulatedDetect, simulatedLoad } from './simulated.ts'
import { landmarkRmseNorm } from './stats.ts'

export type CompareHarnessCase = { name: string; passed: boolean; detail: string }
export type CompareHarnessResult = { passed: boolean; cases: CompareHarnessCase[]; message: string }

function check(name: string, passed: boolean, detail: string): CompareHarnessCase {
  return { name, passed, detail }
}

export async function runCompareHarness(): Promise<CompareHarnessResult> {
  const cases: CompareHarnessCase[] = []

  cases.push(
    check(
      'product default stays Lite',
      DEFAULT_POSE_MODEL === 'lite',
      `DEFAULT_POSE_MODEL=${DEFAULT_POSE_MODEL}`,
    ),
  )

  const heavy = refuseHeavyModel()
  cases.push(
    check(
      'heavy is later-benchmark-only',
      !heavy.ok && heavy.reason === POSE_HEAVY_REASON,
      heavy.reason,
    ),
  )

  const cache = createModelCache({
    load: simulatedLoad,
    detect: simulatedDetect,
  })
  cases.push(check('Full is not loaded until compare', !cache.isLoaded('full') && !cache.isLoaded('lite'), cache.loaded().join(',')))
  const firstLite = await cache.ensure('lite')
  cases.push(
    check(
      'Lite can load without pulling Full',
      firstLite.cached === false && cache.isLoaded('lite') && !cache.isLoaded('full'),
      `cached=${firstLite.cached} loaded=${cache.loaded().join(',')}`,
    ),
  )
  const secondLite = await cache.ensure('lite')
  cases.push(check('Lite hits cache on second ensure', secondLite.cached, `cached=${secondLite.cached}`))
  await cache.dispose()

  let overlapping = 0
  let maxOverlap = 0
  const serial = createModelCache({
    async load(model) {
      overlapping += 1
      maxOverlap = Math.max(maxOverlap, overlapping)
      await delay(20)
      overlapping -= 1
      return simulatedLoad(model)
    },
    detect: simulatedDetect,
  })
  const together = Promise.all([serial.ensure('lite'), serial.ensure('full')])
  await together
  cases.push(
    check(
      'concurrent model switch is serialized',
      maxOverlap === 1 && serial.isLoaded('lite') && serial.isLoaded('full'),
      `maxOverlap=${maxOverlap} loaded=${serial.loaded().join(',')}`,
    ),
  )
  await serial.dispose()

  const abortCache = createModelCache({
    async load(model) {
      await delay(40)
      return simulatedLoad(model)
    },
    detect: simulatedDetect,
  })
  const pending = abortCache.ensure('full')
  abortCache.abort()
  let abortedLoad = false
  try {
    await pending
  } catch (error) {
    abortedLoad = error instanceof Error && /abgebrochen/i.test(error.message)
  }
  cases.push(
    check(
      'abort during Full load does not keep the model',
      abortedLoad && !abortCache.isLoaded('full'),
      `aborted=${abortedLoad} loaded=${abortCache.loaded().join(',')}`,
    ),
  )
  await abortCache.dispose()

  const runner = createCompareRunner({
    load: simulatedLoad,
    detect: simulatedDetect,
  })
  const synthetic = syntheticCompareClip(24)
  const report = await runner.run(synthetic, { detector: 'injected' })
  const note = formatDecisionNote(report)
  const gt = report.landmarkError.vsTruth
  const liteWorse =
    gt.liteRmseNorm !== null && gt.fullRmseNorm !== null && gt.liteRmseNorm > gt.fullRmseNorm
  cases.push(
    check(
      'synthetic clip logs version, runtime, lost frames',
      report.lite.versionPath.includes('pose_landmarker_lite') &&
        report.full.versionPath.includes('pose_landmarker_full') &&
        report.lite.initMs === 42 &&
        report.full.initMs === 118 &&
        report.lite.lostFrames === 0 &&
        report.full.lostFrames === 0 &&
        report.lite.inference.n === synthetic.frames.length,
      `lite=${report.lite.versionPath} full=${report.full.versionPath} lost=${report.lite.lostFrames}/${report.full.lostFrames}`,
    ),
  )
  cases.push(
    check(
      'synthetic clip has landmark error and angle deltas',
      liteWorse &&
        report.angleDeltas.kneeFlexion.n > 0 &&
        report.angleDeltas.elbowFlexion.n > 0 &&
        report.angleDeltas.trunkTorso.n > 0,
      `rmse L/F ${gt.liteRmseNorm?.toFixed(4)}/${gt.fullRmseNorm?.toFixed(4)} knee n=${report.angleDeltas.kneeFlexion.n}`,
    ),
  )
  cases.push(
    check(
      'decision note includes accuracy + runtime and does not promote Full',
      !report.decision.promoteFull &&
        !report.decision.applyFullToProduct &&
        !report.decision.loadHeavy &&
        /ACCURACY/.test(note) &&
        /RUNTIME/.test(note) &&
        report.decision.verdict === 'keep_lite',
      note.split('\n')[0] ?? note,
    ),
  )
  cases.push(
    check(
      'person-pose compare does not touch bike B/S/G calib APIs',
      !JSON.stringify(report).includes('geometry.v1') && !JSON.stringify(report).includes('Fahrrad'),
      'no calib detect fields on compare report',
    ),
  )

  const again = await runner.run(synthetic, { detector: 'injected' })
  cases.push(
    check(
      'second compare reuses cached Lite and Full',
      runner.cache.isLoaded('lite') && runner.cache.isLoaded('full') && again.lite.initMs === 42,
      `loaded=${runner.cache.loaded().join(',')}`,
    ),
  )

  const fileClip = fileFixtureCompareClip()
  const fileReport = await runner.run(fileClip, { detector: 'injected' })
  cases.push(
    check(
      'file fixture clip compares Lite vs Full on the same timestamps',
      fileClip.kind === 'file' &&
        fileReport.clip.frames === fileClip.frames.length &&
        fileReport.lite.frames === fileReport.full.frames &&
        fileReport.landmarkError.vsTruth.available &&
        fileReport.decision.promoteFull === false,
      `frames=${fileReport.clip.frames} kind=${fileReport.clip.kind}`,
    ),
  )

  const annotated = parseAnnotatedSequence({
    kind: 'bikefit.pose-annotation.v1',
    name: 'mini',
    width: 1280,
    height: 720,
    frames: synthetic.frames.slice(0, 3).map((frame) => ({
      timestampMs: frame.timestampMs,
      landmarks: frame.truth,
    })),
  })
  cases.push(
    check(
      'annotated sequence parses when present',
      !('error' in annotated) && annotated.kind === 'annotated' && annotated.frames.length === 3,
      'error' in annotated ? annotated.error : annotated.name,
    ),
  )

  const abortable = createCompareRunner({
    load: simulatedLoad,
    async detect(model, frame) {
      await delay(15)
      return simulatedDetect(model, frame)
    },
  })
  const first = abortable.run(syntheticCompareClip(8), { detector: 'injected' })
  await delay(10)
  abortable.abort()
  const aborted = await first
  await abortable.dispose()
  cases.push(
    check('in-flight compare abort is first-class', aborted.aborted === true, `aborted=${aborted.aborted}`),
  )

  let active = 0
  let sawTwo = false
  const slow = createCompareRunner({
    load: simulatedLoad,
    async detect(model, frame) {
      active += 1
      if (active > 1) sawTwo = true
      await delay(5)
      const result = simulatedDetect(model, frame)
      active -= 1
      return result
    },
  })
  await slow.run(syntheticCompareClip(6), { detector: 'injected' })
  cases.push(
    check(
      'Lite and Full never detect the same clip concurrently',
      !sawTwo,
      `sawTwo=${sawTwo}`,
    ),
  )
  await slow.dispose()

  const truth = synthetic.frames[0]?.truth ?? []
  const same = landmarkRmseNorm(truth, truth)
  cases.push(check('identical landmarks have zero RMSE', same.n > 0 && same.rmseNorm === 0, `n=${same.n} rmse=${same.rmseNorm}`))

  await runner.dispose()

  const failed = cases.filter((item) => !item.passed)
  return {
    passed: failed.length === 0,
    cases,
    message:
      failed.length === 0
        ? `POSE_COMPARE_OK — ${cases.length} checks.`
        : `POSE_COMPARE_FAIL — ${failed.map((item) => item.name).join(', ')}`,
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
