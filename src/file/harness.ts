import { createMetricsPipeline, emptyMetricsReport } from '../metrics/pipeline.ts'
import { createMeasurementCapture } from '../metrics/capture.ts'
import { createPedalTracker } from '../pedal/tracker.ts'
import { buildMeasurementResult } from '../flow/buildResult.ts'
import { parseMeasurementResult } from '../sessions/parseResult.ts'
import { classifyLocalFile } from './classify.ts'
import {
  insetCrop,
  isIdentityTransform,
  nextRotation,
  originalToWorking,
  rotatePoint,
  sourceTransformForCapture,
  unrotatePoint,
  workingToOriginal,
} from './frameTransform.ts'
import { fileFixtureClip, FILE_FIXTURE_HEIGHT, FILE_FIXTURE_ID, FILE_FIXTURE_WIDTH } from './fixture.ts'
import { applyFileMetaPatch, fileSourceKey } from './meta.ts'
import {
  classifyTimelineDiscontinuity,
  isHeldFrame,
  mediaTimestampMs,
  seekKind,
  shouldResetOnSeek,
} from './mediaClock.ts'
import { applyFileTransportSeek, applySeekReset, emptySeekSinks, resetCaptureSegment } from './seekReset.ts'
import { createPhaseCapture } from '../metrics/phaseCapture.ts'
import { createFootCollector } from '../foot/diagnostic.ts'
import { syntheticPoseFrame } from '../pose/syntheticLandmarks.ts'
import { restartFile, seekFile, snapshotPlayback, stepFileFrame, presentFilePlayback } from './playback.ts'
import { assertNotCycleMeasurement, cycleMeasurementAllowed, staticCheckQualityNote } from './staticCheck.ts'
import { IDENTITY_SOURCE_TRANSFORM } from '../types/file.ts'
import { SYNTHETIC_MARKS } from '../camera/synthetic.ts'
import { computePixelBikeTransform } from '../calibration/transform.ts'

export type FileHarnessCase = { name: string; passed: boolean; detail: string }
export type FileHarnessResult = { passed: boolean; cases: FileHarnessCase[]; message: string }

function check(name: string, passed: boolean, detail: string): FileHarnessCase {
  return { name, passed, detail }
}

function reportFromClip(frames: ReturnType<typeof fileFixtureClip>) {
  const pipeline = createMetricsPipeline()
  for (const frame of frames) pipeline.push(frame)
  return pipeline.snapshot()
}

export function runFileHarness(): FileHarnessResult {
  const cases: FileHarnessCase[] = []

  const videoOk = classifyLocalFile({ name: 'ride.mp4', type: 'video/mp4', size: 1200 })
  const imageOk = classifyLocalFile({ name: 'still.png', type: 'image/png', size: 80 })
  const bad = classifyLocalFile({ name: 'notes.txt', type: 'text/plain', size: 12 })
  const empty = classifyLocalFile({ name: 'ride.mp4', type: 'video/mp4', size: 0 })
  cases.push(
    check('video file accepted', videoOk.ok && videoOk.kind === 'video', JSON.stringify(videoOk)),
  )
  cases.push(
    check('image file accepted as static', imageOk.ok && imageOk.kind === 'image', JSON.stringify(imageOk)),
  )
  cases.push(
    check(
      'bad file has a clear German error',
      !bad.ok && /kein abspielbares/i.test(bad.error) && /kein Upload/i.test(bad.error),
      bad.ok ? 'ok' : bad.error,
    ),
  )
  cases.push(
    check('empty file rejected', !empty.ok && /leer|unlesbar/i.test(empty.error), empty.ok ? 'ok' : empty.error),
  )

  cases.push(
    check(
      'single image is static check, not multi-cycle',
      !cycleMeasurementAllowed('image') && cycleMeasurementAllowed('video'),
      staticCheckQualityNote(),
    ),
  )
  cases.push(
    check(
      'static image report must not carry crank cycles',
      assertNotCycleMeasurement('image', emptyMetricsReport()).ok &&
        !assertNotCycleMeasurement('image', { validRevolutions: 3 }).ok,
      'static guard',
    ),
  )

  const clip = fileFixtureClip()
  const first = reportFromClip(clip)
  const second = reportFromClip(clip)
  const kneeA = first.metrics.kneeFlexion.degrees?.median ?? null
  const kneeB = second.metrics.kneeFlexion.degrees?.median ?? null
  const kneeDelta =
    kneeA !== null && kneeB !== null ? Math.abs(kneeA - kneeB) : Number.POSITIVE_INFINITY
  cases.push(
    check(
      'same clip + fixed settings reproduces cycles/values',
      first.validRevolutions === second.validRevolutions &&
        first.validRevolutions >= 6 &&
        kneeDelta <= 0.05,
      `revs ${first.validRevolutions}/${second.validRevolutions} kneeΔ=${kneeDelta.toFixed(4)} fixture=${FILE_FIXTURE_ID}`,
    ),
  )

  cases.push(
    check(
      'fixture uses real media timestamps',
      clip.length > 2 &&
        clip[0]!.mediaTimeMs === 0 &&
        clip[1]!.mediaTimeMs > clip[0]!.mediaTimeMs &&
        clip.every((frame, i) => frame.timestampMs === frame.mediaTimeMs && (i === 0 || frame.mediaTimeMs >= clip[i - 1]!.mediaTimeMs)),
      `n=${clip.length} t0=${clip[0]?.mediaTimeMs} t1=${clip[1]?.mediaTimeMs}`,
    ),
  )

  const paused = createMetricsPipeline()
  const held = clip[10]!
  paused.push(held)
  paused.push({ ...held, pose: held.pose ? { ...held.pose } : null, pedal: { ...held.pedal } })
  const pausedReport = paused.snapshot()
  cases.push(
    check(
      'pause duplicate media time is a held frame',
      isHeldFrame(held.mediaTimeMs, held.mediaTimeMs) && pausedReport.frames === 2,
      `held=${isHeldFrame(held.mediaTimeMs, held.mediaTimeMs)} frames=${pausedReport.frames}`,
    ),
  )
  const pauseGuard = createMetricsPipeline()
  pauseGuard.push(held)
  if (!isHeldFrame(held.mediaTimeMs, held.mediaTimeMs)) pauseGuard.push(held)
  cases.push(
    check(
      'pause does not mint extra cycles',
      pauseGuard.snapshot().validRevolutions === 0 && pauseGuard.snapshot().frames === 1,
      `frames=${pauseGuard.snapshot().frames} revs=${pauseGuard.snapshot().validRevolutions}`,
    ),
  )

  const prefix = clip.slice(0, 21)
  const jumped = clip[23]!
  const fake = createMetricsPipeline()
  for (const frame of prefix) fake.push(frame)
  fake.push(jumped)
  const fakeRevs = fake.snapshot().validRevolutions

  const honest = createMetricsPipeline()
  for (const frame of prefix) honest.push(frame)
  const sinks = {
    resetPedalTemporal() {},
    resetMetrics() {
      honest.reset()
    },
    resetCaptureAggregators() {},
  }
  const kind = applySeekReset(sinks, prefix[prefix.length - 1]!.mediaTimeMs, jumped.mediaTimeMs)
  honest.push(jumped)
  const honestRevs = honest.snapshot().validRevolutions
  cases.push(
    check(
      'seek without reset can invent a cycle; seek reset does not',
      kind === 'forward' && fakeRevs > honestRevs && honestRevs === 0,
      `kind=${kind} fake=${fakeRevs} honest=${honestRevs}`,
    ),
  )

  const capture = createMeasurementCapture({ targetRevs: 10 })
  capture.beginRecording()
  for (const frame of prefix) capture.push(frame)
  const beforeSeek = capture.snapshot().report.validRevolutions
  applySeekReset(
    {
      resetPedalTemporal() {},
      resetMetrics() {},
      resetCaptureAggregators() {
        capture.resetAggregators()
      },
    },
    prefix[prefix.length - 1]!.mediaTimeMs,
    jumped.mediaTimeMs,
  )
  capture.push(jumped)
  const afterSeek = capture.snapshot()
  cases.push(
    check(
      'recording seek resets aggregator, does not keep fake revs',
      afterSeek.state === 'recording' &&
        afterSeek.report.validRevolutions === 0 &&
        afterSeek.report.validRevolutions <= beforeSeek,
      `before=${beforeSeek} after=${afterSeek.report.validRevolutions} state=${afterSeek.state}`,
    ),
  )

  let overlayResets = 0
  applySeekReset(
    {
      resetPedalTemporal() {},
      resetMetrics() {},
      resetCaptureAggregators() {},
      resetOverlayFilter: () => {
        overlayResets += 1
      },
    },
    200,
    1600,
  )
  cases.push(
    check('seek also resets overlay 1€ state', overlayResets === 1, `overlayResets=${overlayResets}`),
  )

  const phase = createPhaseCapture()
  const foot = createFootCollector()
  let evidence: unknown = { kept: true }
  let media: { start: number; end: number } | null = { start: 0, end: 400 }
  let segmentIds: string[] = ['old']
  const poseA = { timestampMs: 100, pose: syntheticPoseFrame(100), pedal: prefix[0]!.pedal, transform: prefix[0]!.transform }
  phase.push(poseA, { mime: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,QQ==' })
  foot.push(syntheticPoseFrame(100), prefix[0]!.pedal)
  applySeekReset(
    {
      resetPedalTemporal() {},
      resetMetrics() {},
      resetCaptureAggregators() {
        resetCaptureSegment({
          resetMetricsAggregator: () => {
            segmentIds = ['new']
          },
          resetPhaseCapture: () => phase.reset(),
          clearPhaseEvidence: () => {
            evidence = null
          },
          resetFoot: () => foot.reset(),
          resetMediaRange: () => {
            media = null
          },
        })
      },
    },
    400,
    2000,
  )
  cases.push(
    check(
      'seek shared segment reset clears phase, foot, media, and evidence — not only metrics',
      phase.snapshot().length === 0 &&
        foot.size() === 0 &&
        evidence === null &&
        media === null &&
        segmentIds[0] === 'new',
      `phase=${phase.snapshot().length} foot=${foot.size()} evidence=${evidence} media=${media} id=${segmentIds[0]}`,
    ),
  )

  cases.push(
    check('backward seek is a reset', shouldResetOnSeek(1200, 40) && seekKind(1200, 40) === 'backward', 'rewind'),
  )
  cases.push(
    check('frame step 33ms is not a seek', !shouldResetOnSeek(1000, 1033) && seekKind(1000, 1033) === 'none', 'step'),
  )

  const orig = { x: 100, y: 40 }
  const rot90 = rotatePoint(orig, 200, 80, 90)
  const back = unrotatePoint(rot90, 200, 80, 90)
  cases.push(
    check(
      'rotation maps points back to original',
      Math.abs(back.x - orig.x) < 1e-9 && Math.abs(back.y - orig.y) < 1e-9,
      `90° ${orig.x},${orig.y} → ${rot90.x},${rot90.y} → ${back.x},${back.y}`,
    ),
  )

  const transform = { rotation: 90 as const, crop: insetCrop(0.1) }
  const working = originalToWorking(orig, 200, 80, transform)
  const roundTrip = working ? workingToOriginal(working, 200, 80, transform) : null
  cases.push(
    check(
      'crop+rotation round-trips to original pixels',
      Boolean(working && roundTrip && Math.abs(roundTrip.x - orig.x) < 1e-6 && Math.abs(roundTrip.y - orig.y) < 1e-6),
      working && roundTrip ? `${working.x.toFixed(2)},${working.y.toFixed(2)} → ${roundTrip.x},${roundTrip.y}` : 'null',
    ),
  )
  cases.push(
    check('identity transform is a no-op', IDENTITY_SOURCE_TRANSFORM.rotation === 0 && IDENTITY_SOURCE_TRANSFORM.crop === null, 'identity'),
  )
  cases.push(check('rotate button cycles 0-90-180-270', nextRotation(270) === 0 && nextRotation(0) === 90, 'cycle'))

  const fileCrop = { rotation: 90 as const, crop: insetCrop(0.1) }
  cases.push(
    check(
      'crop/rotation is file-only, camera/synthetic stay identity',
      sourceTransformForCapture('file', fileCrop) === fileCrop &&
        isIdentityTransform(sourceTransformForCapture('synthetic', fileCrop)) &&
        isIdentityTransform(sourceTransformForCapture('camera', fileCrop)),
      'source transform isolation',
    ),
  )

  const liveSnap = { paused: false, ended: false, currentTimeMs: 900, durationMs: 4000 }
  const stillSnap = presentFilePlayback(liveSnap, true)
  cases.push(
    check(
      'static still presents as paused transport',
      stillSnap.paused === true && presentFilePlayback(liveSnap, false).paused === false,
      `paused=${stillSnap.paused}`,
    ),
  )

  const tracker = createPedalTracker()
  tracker.seed(SYNTHETIC_MARKS.G.x, SYNTHETIC_MARKS.G.y)
  tracker.resetTemporal()
  cases.push(check('pedal tracker exposes temporal reset', typeof tracker.resetTemporal === 'function', 'resetTemporal'))

  const videoStub = {
    currentTime: 1.25,
    duration: 4,
    paused: true,
    ended: false,
    playbackRate: 1,
    pause() {
      this.paused = true
    },
    async play() {
      this.paused = false
      this.ended = false
    },
  }
  const snapped = snapshotPlayback(videoStub)
  const stepped = stepFileFrame(videoStub, 1, 30)
  restartFile(videoStub)
  cases.push(
    check(
      'replay controls use media time',
      snapped.currentTimeMs === mediaTimestampMs(1.25) &&
        Math.abs(stepped - (1.25 + 1 / 30)) < 1e-9 &&
        videoStub.currentTime === 0 &&
        videoStub.paused === false,
      `snap=${snapped.currentTimeMs} step=${stepped} restart=${videoStub.currentTime}`,
    ),
  )
  seekFile(videoStub, 99)
  cases.push(check('seek clamps to duration', videoStub.currentTime === 4, String(videoStub.currentTime)))

  const marks = { B: { ...SYNTHETIC_MARKS.B }, S: { ...SYNTHETIC_MARKS.S }, G: { ...SYNTHETIC_MARKS.G } }
  const dataset = buildMeasurementResult({
    startedAt: '2026-09-11T12:00:00.000Z',
    endedAt: '2026-09-11T12:00:08.000Z',
    capture: 'file',
    evaluation: 'standard',
    profile: { id: 'lab', name: 'Labor / nicht freigegeben', productionEnabled: false },
    calibration: {
      version: 1,
      marks,
      transform: computePixelBikeTransform(marks),
      createdAt: '2026-09-11T12:00:00.000Z',
      updatedAt: '2026-09-11T12:00:00.000Z',
      binding: {
        source: 'file',
        deviceId: 'ride.mp4',
        width: FILE_FIXTURE_WIDTH,
        height: FILE_FIXTURE_HEIGHT,
        setupId: `file:ride.mp4:${FILE_FIXTURE_WIDTH}x${FILE_FIXTURE_HEIGHT}`,
      },
    },
    metrics: [],
    quality: {
      level: 'ok',
      label: 'Qualität ausreichend',
      validRevs: first.validRevolutions,
      targetRevs: 10,
      lostFrames: 0,
      notes: [],
    },
    recommendations: [],
    validRevs: first.validRevolutions,
    targetRevs: 10,
    adapters: { sessions: 'module', metrics: 'module', rules: 'module', soll: 'module' },
    file: {
      kind: 'video',
      name: 'ride.mp4',
      mimeType: 'video/mp4',
      width: FILE_FIXTURE_WIDTH,
      height: FILE_FIXTURE_HEIGHT,
      durationMs: clip[clip.length - 1]!.mediaTimeMs,
      mediaTimeRangeMs: { start: 0, end: clip[clip.length - 1]!.mediaTimeMs },
      staticCheck: false,
      rotationDeg: 0,
      crop: null,
      upload: false,
    },
    mediaStartMs: 0,
    mediaEndMs: clip[clip.length - 1]!.mediaTimeMs,
  })
  const parsed = parseMeasurementResult(dataset)
  cases.push(
    check(
      'result stores file source, dimensions, time range',
      parsed.ok &&
        parsed.value.source === 'file' &&
        parsed.value.provenance.capture === 'file' &&
        parsed.value.file?.name === 'ride.mp4' &&
        parsed.value.file.width === FILE_FIXTURE_WIDTH &&
        parsed.value.file.height === FILE_FIXTURE_HEIGHT &&
        parsed.value.file.upload === false &&
        parsed.value.file.staticCheck === false &&
        parsed.value.time.mediaStartMs === 0 &&
        typeof parsed.value.time.mediaEndMs === 'number' &&
        parsed.value.calibration.binding?.source === 'file',
      parsed.ok ? `${parsed.value.source} ${parsed.value.file?.width}x${parsed.value.file?.height}` : parsed.reason,
    ),
  )
  cases.push(
    check(
      'default is no upload / no cloud coach',
      parsed.ok && parsed.value.file?.upload === false && parsed.value.profile.productionEnabled === false,
      'local only',
    ),
  )

  const meta = {
    kind: 'video' as const,
    name: 'ride.mp4',
    mimeType: 'video/mp4',
    sizeBytes: 12,
    objectUrl: 'blob:ride',
    width: 0,
    height: 0,
    durationMs: null,
    staticCheck: false,
  }
  const patchedOnce = applyFileMetaPatch(meta, { width: 1280, height: 720, durationMs: 4000 })
  const patchedSame = applyFileMetaPatch(patchedOnce, { width: 1280, height: 720, durationMs: 4000 })
  const patchedAgain = applyFileMetaPatch(patchedSame, { width: 1280, height: 720, durationMs: 4000 })
  cases.push(
    check(
      'identical metadata patch keeps the same file object',
      patchedOnce !== meta && patchedSame === patchedOnce && patchedAgain === patchedOnce,
      `once=${patchedOnce === meta} same=${patchedSame === patchedOnce}`,
    ),
  )
  cases.push(
    check(
      'source identity ignores metadata fields',
      fileSourceKey(meta) === fileSourceKey(patchedOnce) && fileSourceKey(meta) === 'blob:ride',
      fileSourceKey(patchedOnce) ?? 'null',
    ),
  )

  const cam10 = classifyTimelineDiscontinuity({
    source: 'camera',
    prevMediaMs: 1000,
    nextMediaMs: 1100,
    transportSeek: false,
  })
  const inferGap = classifyTimelineDiscontinuity({
    source: 'camera',
    prevMediaMs: 1100,
    nextMediaMs: 1480,
    transportSeek: false,
  })
  const droppedFile = classifyTimelineDiscontinuity({
    source: 'file',
    prevMediaMs: 1000,
    nextMediaMs: 1280,
    transportSeek: false,
  })
  const fileSeek = classifyTimelineDiscontinuity({
    source: 'file',
    prevMediaMs: 1000,
    nextMediaMs: 2800,
    transportSeek: true,
  })
  const fileStep = classifyTimelineDiscontinuity({
    source: 'file',
    prevMediaMs: 1000,
    nextMediaMs: 1033,
    transportSeek: true,
  })
  cases.push(
    check(
      'camera 10fps and inference holes are gaps, not seeks',
      cam10 === 'gap' && inferGap === 'gap',
      `10fps=${cam10} infer=${inferGap}`,
    ),
  )
  cases.push(
    check(
      'dropped file frame is a gap; transport seek + jump is a seek; frame-step is none',
      droppedFile === 'gap' && fileSeek === 'seek' && fileStep === 'none',
      `drop=${droppedFile} seek=${fileSeek} step=${fileStep}`,
    ),
  )

  const cameraPipe = createMetricsPipeline()
  let cameraResets = 0
  const cameraSinks = {
    resetPedalTemporal() {},
    resetMetrics() {
      cameraResets += 1
      cameraPipe.reset()
    },
    resetCaptureAggregators() {},
  }
  let prevCam: number | null = null
  let cameraPushed = 0
  for (let i = 0; i < clip.length; i += 1) {
    if (i > 40 && i < 49) continue
    const frame = clip[i]!
    applyFileTransportSeek(
      'camera',
      {
        prevMediaMs: prevCam ?? frame.mediaTimeMs,
        nextMediaMs: frame.mediaTimeMs,
        transportSeek: false,
      },
      cameraSinks,
    )
    cameraPipe.push(frame)
    cameraPushed += 1
    prevCam = frame.mediaTimeMs
  }
  const tenFpsPipe = createMetricsPipeline()
  let tenFpsResets = 0
  const tenFpsSinks = {
    resetPedalTemporal() {},
    resetMetrics() {
      tenFpsResets += 1
      tenFpsPipe.reset()
    },
    resetCaptureAggregators() {},
  }
  let prevTen: number | null = null
  for (let i = 0; i < clip.length; i += 3) {
    const frame = clip[i]!
    applyFileTransportSeek(
      'camera',
      {
        prevMediaMs: prevTen ?? frame.mediaTimeMs,
        nextMediaMs: frame.mediaTimeMs,
        transportSeek: false,
      },
      tenFpsSinks,
    )
    tenFpsPipe.push(frame)
    prevTen = frame.mediaTimeMs
  }
  const cameraRevs = cameraPipe.snapshot().validRevolutions
  const cameraFrames = cameraPipe.snapshot().frames
  cases.push(
    check(
      'mounted-path camera 10fps + inference spike keeps completed cycles',
      cameraResets === 0 &&
        tenFpsResets === 0 &&
        cameraFrames === cameraPushed &&
        cameraRevs >= 3 &&
        tenFpsPipe.snapshot().frames === Math.ceil(clip.length / 3),
      `resets=${cameraResets}/${tenFpsResets} frames=${cameraFrames}/${cameraPushed} revs=${cameraRevs} tenFps=${tenFpsPipe.snapshot().frames}`,
    ),
  )

  const filePipe = createMetricsPipeline()
  let fileResets = 0
  const fileSinks = {
    ...emptySeekSinks(),
    resetMetrics() {
      fileResets += 1
      filePipe.reset()
    },
  }
  const longPrefix = clip.slice(0, 90)
  let prevFile: number | null = null
  for (let i = 0; i < longPrefix.length; i += 1) {
    const frame = longPrefix[i]!
    if (i === 50) continue
    applyFileTransportSeek(
      'file',
      {
        prevMediaMs: prevFile ?? frame.mediaTimeMs,
        nextMediaMs: frame.mediaTimeMs,
        transportSeek: false,
      },
      fileSinks,
    )
    filePipe.push(frame)
    prevFile = frame.mediaTimeMs
  }
  const revsBeforeSeek = filePipe.snapshot().validRevolutions
  const seekKindApplied = applyFileTransportSeek(
    'file',
    { prevMediaMs: prevFile ?? 0, nextMediaMs: (prevFile ?? 0) + 1800, transportSeek: true },
    fileSinks,
  )
  cases.push(
    check(
      'mounted-path file transport seek resets; dropped frames do not',
      fileResets === 1 && seekKindApplied === 'forward' && revsBeforeSeek >= 1 && filePipe.snapshot().frames === 0,
      `resets=${fileResets} kind=${seekKindApplied} before=${revsBeforeSeek}`,
    ),
  )

  const failed = cases.filter((c) => !c.passed)
  return {
    passed: failed.length === 0,
    cases,
    message:
      failed.length === 0
        ? `FILE_HARNESS_OK — ${cases.length} checks (file source, seek reset, replay).`
        : `FILE_HARNESS_FAIL — ${failed.map((c) => c.name).join(', ')}`,
  }
}
