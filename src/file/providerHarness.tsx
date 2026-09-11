import { useLayoutEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { applyFileMetaPatch } from './meta.ts'
import { startVideoFrameLoop, type FrameDiscontinuity } from '../pose/frameSync.ts'
import { poseFreshness, poseHoldForSource, poseIsReady, poseReceiveTime } from '../pose/freshness.ts'
import { FitProvider, useFit, type FitSession } from '../shell/FitSession.tsx'
import { applyFileTransportSeek } from './seekReset.ts'
import { createMetricsPipeline } from '../metrics/pipeline.ts'
import { fileFixtureClip } from './fixture.ts'

export type ProviderHarnessCase = { name: string; passed: boolean; detail: string }
export type ProviderHarnessResult = { passed: boolean; cases: ProviderHarnessCase[]; message: string }

function check(name: string, passed: boolean, detail: string): ProviderHarnessCase {
  return { name, passed, detail }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function waitUntil(ok: () => boolean, timeoutMs = 4000): Promise<boolean> {
  const start = performance.now()
  while (performance.now() - start < timeoutMs) {
    if (ok()) return true
    await wait(25)
  }
  return ok()
}

async function pngFileFromCanvas(): Promise<File> {
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 4
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  ctx.fillStyle = '#cc3377'
  ctx.fillRect(0, 0, 4, 4)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((next) => (next ? resolve(next) : reject(new Error('toBlob'))), 'image/png')
  })
  return new File([blob], 'still.png', { type: 'image/png' })
}

function FitProbe({ fitRef }: { fitRef: { current: FitSession | null } }) {
  const fit = useFit()
  fitRef.current = fit
  useLayoutEffect(() => {
    fit.setStageMounted(true)
    return () => fit.setStageMounted(false)
  }, [fit])
  return (
    <div data-provider-harness="fit">
      <video ref={fit.attachVideo} muted playsInline data-bikefit-source={fit.camera.status.source} />
      <canvas ref={fit.attachOverlay} />
      <canvas ref={fit.attachStill} />
    </div>
  )
}

function wrapPlay(video: HTMLVideoElement): { count: () => number; restore: () => void } {
  let n = 0
  const original = video.play.bind(video)
  video.play = () => {
    n += 1
    return original()
  }
  return {
    count: () => n,
    restore: () => {
      video.play = original
    },
  }
}

function fakeLoopVideo(): {
  video: HTMLVideoElement
  tick: (mediaTimeSec: number, seeking?: boolean) => Promise<void>
} {
  const video = document.createElement('video')
  Object.defineProperty(video, 'videoWidth', { get: () => 16 })
  Object.defineProperty(video, 'videoHeight', { get: () => 16 })
  Object.defineProperty(video, 'readyState', { get: () => HTMLMediaElement.HAVE_ENOUGH_DATA })
  let pending: ((now: number, metadata?: VideoFrameCallbackMetadata) => void) | null = null
  video.requestVideoFrameCallback = ((cb: (now: number, metadata?: VideoFrameCallbackMetadata) => void) => {
    pending = cb
    return 1
  }) as HTMLVideoElement['requestVideoFrameCallback']
  video.cancelVideoFrameCallback = (() => {
    pending = null
  }) as HTMLVideoElement['cancelVideoFrameCallback']
  return {
    video,
    async tick(mediaTimeSec, seeking = false) {
      if (seeking) video.dispatchEvent(new Event('seeking'))
      video.currentTime = mediaTimeSec
      const cb = pending
      pending = null
      cb?.(performance.now(), { mediaTime: mediaTimeSec } as VideoFrameCallbackMetadata)
      await wait(0)
    },
  }
}

async function recordTinyWebm(): Promise<File | null> {
  if (typeof MediaRecorder === 'undefined' || typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 16
  canvas.height = 16
  const ctx = canvas.getContext('2d')
  if (!ctx || typeof canvas.captureStream !== 'function') return null
  const stream = canvas.captureStream(10)
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
    ? 'video/webm;codecs=vp8'
    : MediaRecorder.isTypeSupported('video/webm')
      ? 'video/webm'
      : ''
  if (!mime) return null
  const recorder = new MediaRecorder(stream, { mimeType: mime })
  const chunks: Blob[] = []
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }
  recorder.start(50)
  for (let i = 0; i < 12; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? '#111111' : '#eeeeee'
    ctx.fillRect(0, 0, 16, 16)
    await wait(100)
  }
  recorder.stop()
  await new Promise<void>((resolve) => {
    recorder.onstop = () => resolve()
  })
  for (const track of stream.getTracks()) track.stop()
  if (chunks.length === 0) return null
  return new File(chunks, 'clip.webm', { type: 'video/webm' })
}

export async function runMountedProviderHarness(): Promise<ProviderHarnessResult> {
  const cases: ProviderHarnessCase[] = []
  if (typeof document === 'undefined') {
    return {
      passed: false,
      cases: [check('document available', false, 'mounted harness needs a browser document')],
      message: 'FILE_MOUNTED_FAIL — no document',
    }
  }

  const host = document.createElement('div')
  host.setAttribute('data-provider-harness', 'root')
  document.body.appendChild(host)
  const fitRef: { current: FitSession | null } = { current: null }
  let root: Root | null = null

  try {
    root = createRoot(host)
    root.render(
      <FitProvider>
        <FitProbe fitRef={fitRef} />
      </FitProvider>,
    )
    const mounted = await waitUntil(() => Boolean(fitRef.current))
    cases.push(check('FitProvider mount', mounted, mounted ? 'mounted' : 'timeout'))
    if (!mounted || !fitRef.current) {
      return {
        passed: false,
        cases,
        message: 'FILE_MOUNTED_FAIL — provider did not mount',
      }
    }

    const video = host.querySelector('video')
    cases.push(check('stage video attached', video instanceof HTMLVideoElement, video ? 'video' : 'missing'))
    if (!(video instanceof HTMLVideoElement)) {
      return { passed: false, cases, message: 'FILE_MOUNTED_FAIL — no video' }
    }

    const playSpy = wrapPlay(video)
    await fitRef.current.camera.startFile(await pngFileFromCanvas())
    const decoded = await waitUntil(
      () =>
        Boolean(
          fitRef.current?.camera.file?.kind === 'image' &&
            (fitRef.current.camera.playback.playable ||
              (fitRef.current.camera.file.width >= 2 && fitRef.current.camera.file.height >= 2)),
        ),
    )
    cases.push(
      check(
        'browser file decode (PNG still)',
        decoded && fitRef.current.camera.file?.kind === 'image',
        `playable=${String(fitRef.current.camera.playback.playable)} ${fitRef.current.camera.file?.width}x${fitRef.current.camera.file?.height}`,
      ),
    )

    const playsAfterBind = playSpy.count()
    const fileAfterBind = fitRef.current.camera.file
    const fileObj = fitRef.current.camera.file
    let sameAfterPatches = false
    if (fileObj) {
      sameAfterPatches = true
      for (let i = 0; i < 8; i += 1) {
        const next = applyFileMetaPatch(fileObj, {
          width: fileObj.width,
          height: fileObj.height,
          durationMs: fileObj.durationMs,
        })
        if (next !== fileObj) sameAfterPatches = false
      }
    }
    video.dispatchEvent(new Event('loadedmetadata'))
    video.dispatchEvent(new Event('timeupdate'))
    fitRef.current.camera.pause()
    const pausedAfter = video.paused
    video.dispatchEvent(new Event('loadedmetadata'))
    video.dispatchEvent(new Event('timeupdate'))
    fitRef.current.camera.rotate()
    await wait(40)
    cases.push(
      check(
        'identical metadata does not rebind or extra play(); pause survives events',
        playSpy.count() === playsAfterBind &&
          sameAfterPatches &&
          pausedAfter &&
          video.paused &&
          fitRef.current.camera.file?.objectUrl === fileAfterBind?.objectUrl,
        `plays=${playSpy.count()}/${playsAfterBind} paused=${String(video.paused)} samePatch=${String(sameAfterPatches)}`,
      ),
    )
    playSpy.restore()

    fitRef.current.pose.simulateLoss()
    await wait(20)
    const afterLoss = fitRef.current.pose.freshness
    const readyAfterLoss = fitRef.current.pose.ready
    await wait(1000)
    const afterWait = fitRef.current.pose.freshness
    cases.push(
      check(
        'paused still stays static (not false live / permanent lost) after wait',
        afterLoss.status === 'static' &&
          afterWait.status === 'static' &&
          fitRef.current.pose.ready === readyAfterLoss &&
          poseHoldForSource({ source: 'file', staticCheck: true }) === 'static',
        `${afterLoss.status}→${afterWait.status} ready=${String(readyAfterLoss)}`,
      ),
    )

    fitRef.current.camera.seek(2)
    await wait(20)
    cases.push(
      check(
        'seek on still does not report live',
        fitRef.current.pose.freshness.status !== 'live',
        fitRef.current.pose.freshness.status,
      ),
    )

    const webm = await recordTinyWebm()
    if (webm) {
      await fitRef.current.camera.startFile(webm)
      const videoDecoded = await waitUntil(
        () =>
          Boolean(
            fitRef.current?.camera.file?.kind === 'video' &&
              (fitRef.current.camera.playback.playable || (fitRef.current.camera.file.width ?? 0) >= 2),
          ),
        6000,
      )
      cases.push(
        check(
          'browser file decode (WebM)',
          videoDecoded,
          `playable=${String(fitRef.current.camera.playback.playable)} ${fitRef.current.camera.file?.width}x${fitRef.current.camera.file?.height}`,
        ),
      )
      const videoEl = host.querySelector('video')
      if (videoEl instanceof HTMLVideoElement) {
        const vPlay = wrapPlay(videoEl)
        await wait(80)
        const afterStart = vPlay.count()
        fitRef.current.camera.pause()
        await wait(30)
        videoEl.dispatchEvent(new Event('timeupdate'))
        videoEl.dispatchEvent(new Event('loadedmetadata'))
        await wait(30)
        cases.push(
          check(
            'paused video survives timeupdate/loadedmetadata without extra play()',
            videoEl.paused && vPlay.count() === afterStart,
            `paused=${String(videoEl.paused)} plays=${vPlay.count()}/${afterStart}`,
          ),
        )
        vPlay.restore()
        fitRef.current.pose.simulateLoss()
        await wait(20)
        const pausedFresh = fitRef.current.pose.freshness.status
        fitRef.current.camera.seek(0.4)
        await wait(40)
        const afterSeek = fitRef.current.pose.freshness.status
        cases.push(
          check(
            'paused file is static; seek is not false live',
            pausedFresh === 'static' && afterSeek !== 'live',
            `paused=${pausedFresh} seek=${afterSeek}`,
          ),
        )
      }
    } else {
      cases.push(check('browser file decode (WebM)', true, 'skipped — MediaRecorder unavailable'))
    }

    const loopVideo = fakeLoopVideo()
    const events: FrameDiscontinuity[] = []
    const loopPipe = createMetricsPipeline()
    let loopResets = 0
    const loop = startVideoFrameLoop(
      loopVideo.video,
      async () => {},
      {
        timestampClock: 'wall',
        maxGapMs: 80,
        onDiscontinuity: (info) => {
          events.push(info)
          const applied = applyFileTransportSeek('camera', info, {
            resetPedalTemporal() {},
            resetMetrics() {
              loopResets += 1
              loopPipe.reset()
            },
            resetCaptureAggregators() {},
          })
          void applied
        },
      },
    )
    const clip = fileFixtureClip()
    for (let i = 0; i < Math.min(24, clip.length); i += 1) {
      loopPipe.push(clip[i]!)
    }
    await loopVideo.tick(0)
    for (let i = 1; i <= 12; i += 1) {
      await loopVideo.tick(i * 0.1)
    }
    await loopVideo.tick(1.45)
    const cameraEvents = events.slice()
    const revsAfterCamera = loopPipe.snapshot().validRevolutions
    loop.stop()

    const fileEvents: FrameDiscontinuity[] = []
    let fileLoopResets = 0
    const fileLoopVideo = fakeLoopVideo()
    const fileLoop = startVideoFrameLoop(
      fileLoopVideo.video,
      async () => {},
      {
        timestampClock: 'media',
        maxGapMs: 80,
        onDiscontinuity: (info) => {
          fileEvents.push(info)
          const applied = applyFileTransportSeek('file', info, {
            resetPedalTemporal() {},
            resetMetrics() {
              fileLoopResets += 1
            },
            resetCaptureAggregators() {},
            resetPose() {},
          })
          void applied
        },
      },
    )
    await fileLoopVideo.tick(0)
    await fileLoopVideo.tick(0.1)
    await fileLoopVideo.tick(0.35)
    await fileLoopVideo.tick(2.0, true)
    fileLoop.stop()

    const cameraSeekEvents = cameraEvents.filter((e) => e.transportSeek)
    const fileSeekApplied = fileEvents.some((e) => e.transportSeek && e.nextMediaMs - e.prevMediaMs > 80)
    cases.push(
      check(
        'frame loop: camera 10fps + spike is not a transport seek; cycles kept',
        cameraSeekEvents.length === 0 &&
          loopResets === 0 &&
          loopPipe.snapshot().frames === Math.min(24, clip.length) &&
          cameraEvents.every((e) => !e.transportSeek),
        `events=${cameraEvents.length} seeks=${cameraSeekEvents.length} resets=${loopResets} revs=${revsAfterCamera}`,
      ),
    )
    cases.push(
      check(
        'frame loop: real file seek resets; dropped file frame does not',
        fileLoopResets === 1 && fileSeekApplied && fileEvents.some((e) => !e.transportSeek && e.nextMediaMs - e.prevMediaMs > 80),
        `resets=${fileLoopResets} events=${fileEvents.map((e) => `${e.transportSeek ? 'seek' : 'gap'}:${(e.nextMediaMs - e.prevMediaMs).toFixed(0)}`).join(',')}`,
      ),
    )

    const received = poseReceiveTime()
    const staticFresh = poseFreshness(received, received + 2000, {
      hold: poseHoldForSource({ source: 'file', paused: true }),
    })
    cases.push(
      check(
        'same frame same readiness after wait (static hold)',
        staticFresh.status === 'static' &&
          poseIsReady(staticFresh, {
            timestampMs: 400,
            videoWidth: 8,
            videoHeight: 8,
            landmarks: [{ x: 0.2, y: 0.2, z: 0, visibility: 1 }],
            engine: 'synthetic',
          }),
        staticFresh.status,
      ),
    )
  } catch (error) {
    cases.push(
      check('mounted harness threw', false, error instanceof Error ? error.message : String(error)),
    )
  } finally {
    root?.unmount()
    host.remove()
  }

  const failed = cases.filter((item) => !item.passed)
  return {
    passed: failed.length === 0,
    cases,
    message:
      failed.length === 0
        ? `FILE_MOUNTED_OK — ${cases.length} checks.`
        : `FILE_MOUNTED_FAIL — ${failed.map((item) => item.name).join(', ')}`,
  }
}
