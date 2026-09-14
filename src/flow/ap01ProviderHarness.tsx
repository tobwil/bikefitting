import { useLayoutEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { FitProvider, useFit, type FitSession } from '../shell/FitSession.tsx'
import { FlowProvider, useFlow, type FlowContextValue } from './FlowProvider.tsx'
import { FlowPrimary } from './components/FlowPrimary.tsx'
import { Stage } from '../shell/Stage.tsx'
import { LIVE_GEOMETRY_ZOOM_MS } from '../camera/liveGeometryWatch.ts'
import { flowCalibrateReady } from './calibrateReady.ts'

export type Ap01ProviderCase = { name: string; passed: boolean; detail: string }
export type Ap01ProviderResult = { passed: boolean; cases: Ap01ProviderCase[]; message: string }

function check(name: string, passed: boolean, detail: string): Ap01ProviderCase {
  return { name, passed, detail }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function waitUntil(ok: () => boolean, timeoutMs = 5000): Promise<boolean> {
  const start = performance.now()
  while (performance.now() - start < timeoutMs) {
    if (ok()) return true
    await wait(40)
  }
  return ok()
}

async function pngFileFromCanvas(): Promise<File> {
  const canvas = document.createElement('canvas')
  canvas.width = 8
  canvas.height = 8
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  ctx.fillStyle = '#336699'
  ctx.fillRect(0, 0, 8, 8)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((next) => (next ? resolve(next) : reject(new Error('toBlob'))), 'image/png')
  })
  return new File([blob], 'switch.png', { type: 'image/png' })
}

function installZoomStub(track: MediaStreamTrack, initial: number) {
  let zoom = initial
  const originalSettings = track.getSettings.bind(track)
  track.getCapabilities = () =>
    ({ zoom: { min: 0.5, max: 3, step: 0.1 } }) as MediaTrackCapabilities
  track.getSettings = () => ({ ...originalSettings(), zoom }) as MediaTrackSettings
  return {
    set(next: number) {
      zoom = next
    },
  }
}

function FitProbe({
  fitRef,
  flowRef,
}: {
  fitRef: { current: FitSession | null }
  flowRef: { current: FlowContextValue | null }
}) {
  const fit = useFit()
  const flow = useFlow()
  fitRef.current = fit
  flowRef.current = flow
  useLayoutEffect(() => {
    fit.setStageMounted(true)
    return () => fit.setStageMounted(false)
  }, [fit])
  return (
    <div data-ap01-harness="provider">
      <Stage />
      <FlowPrimary />
    </div>
  )
}

export async function runAp01ProviderHarness(): Promise<Ap01ProviderResult> {
  const cases: Ap01ProviderCase[] = []
  if (typeof document === 'undefined') {
    return {
      passed: false,
      cases: [check('document available', false, 'AP-01 provider harness needs a browser document')],
      message: 'AP01_MOUNTED_FAIL — no document',
    }
  }

  const host = document.createElement('div')
  host.setAttribute('data-ap01-harness', 'root')
  document.body.appendChild(host)
  const fitRef: { current: FitSession | null } = { current: null }
  const flowRef: { current: FlowContextValue | null } = { current: null }
  let root: Root | null = null

  try {
    root = createRoot(host)
    root.render(
      <FitProvider>
        <FlowProvider>
          <FitProbe fitRef={fitRef} flowRef={flowRef} />
        </FlowProvider>
      </FitProvider>,
    )
    const mounted = await waitUntil(() => Boolean(fitRef.current && flowRef.current))
    cases.push(check('FitProvider+FlowProvider mount', mounted, mounted ? 'mounted' : 'timeout'))
    if (!mounted || !fitRef.current || !flowRef.current) {
      return { passed: false, cases, message: 'AP01_MOUNTED_FAIL — provider did not mount' }
    }

    flowRef.current.goTo('camera')
    await wait(40)
    fitRef.current.camera.startSynthetic()
    const live = await waitUntil(
      () =>
        Boolean(
          fitRef.current?.camera.status.source === 'synthetic' &&
            fitRef.current.camera.status.permission === 'granted' &&
            fitRef.current.camera.stream &&
            (fitRef.current.camera.playback.playable || (fitRef.current.camera.playback.width ?? 0) >= 2),
        ),
      6000,
    )
    cases.push(
      check(
        'AP-01 provider: synthetic live without CameraScreen zoom UI',
        live && !host.querySelector('[data-camera-zoom]'),
        `source=${fitRef.current.camera.status.source} zoomUi=${Boolean(host.querySelector('[data-camera-zoom]'))}`,
      ),
    )
    if (!live) {
      return { passed: false, cases, message: 'AP01_MOUNTED_FAIL — synthetic did not start' }
    }

    fitRef.current.calibration.applyFixtureMarks()
    const calibrated = await waitUntil(() => fitRef.current?.calibration.assessment.ok === true, 3000)
    const readyBefore = flowCalibrateReady(fitRef.current)
    cases.push(
      check(
        'AP-01 provider: fixture calibration ready before source switch',
        calibrated && readyBefore,
        `ok=${String(fitRef.current.calibration.assessment.ok)} ready=${String(readyBefore)} setup=${fitRef.current.calibration.data.binding?.setupId ?? '—'}`,
      ),
    )

    await fitRef.current.camera.startFile(await pngFileFromCanvas())
    const switched = await waitUntil(
      () => fitRef.current?.camera.status.source === 'file' && Boolean(fitRef.current.camera.file),
      5000,
    )
    await wait(80)
    const afterSwitchOk = fitRef.current.calibration.assessment.ok
    const afterSwitchReady = flowCalibrateReady(fitRef.current)
    const afterSwitchMarks = fitRef.current.calibration.data.marks
    cases.push(
      check(
        'AP-01 provider: camera/source switch invalidates dependent calibration',
        switched &&
          afterSwitchOk === false &&
          afterSwitchReady === false &&
          (!afterSwitchMarks.B || !afterSwitchMarks.S || !afterSwitchMarks.G),
        `source=${fitRef.current.camera.status.source} ok=${String(afterSwitchOk)} ready=${String(afterSwitchReady)}`,
      ),
    )

    fitRef.current.camera.startSynthetic()
    const liveAgain = await waitUntil(
      () =>
        fitRef.current?.camera.status.source === 'synthetic' &&
        fitRef.current.camera.status.permission === 'granted' &&
        Boolean(fitRef.current.camera.stream),
      6000,
    )
    cases.push(check('AP-01 provider: return to live synthetic', liveAgain, fitRef.current.camera.status.source))
    if (!liveAgain || !fitRef.current.camera.stream) {
      return { passed: false, cases, message: 'AP01_MOUNTED_FAIL — synthetic did not restart' }
    }

    const track = fitRef.current.camera.stream.getVideoTracks()[0]
    if (!track) {
      cases.push(check('AP-01 provider: live track for external zoom', false, 'no video track'))
    } else {
      const stub = installZoomStub(track, 1)
      await wait(LIVE_GEOMETRY_ZOOM_MS * 2 + 200)
      fitRef.current.calibration.applyFixtureMarks()
      const recalibrated = await waitUntil(() => fitRef.current?.calibration.assessment.ok === true, 3000)
      const revisionBefore = fitRef.current.camera.geometryRevision
      const readyZoom = flowCalibrateReady(fitRef.current)
      stub.set(0.5)
      const zoomed = await waitUntil(
        () =>
          (fitRef.current?.camera.geometryRevision ?? 0) > revisionBefore &&
          fitRef.current?.calibration.assessment.ok === false,
        LIVE_GEOMETRY_ZOOM_MS * 4 + 800,
      )
      const framingButton = host.querySelector('[data-action="framing-changed"]')
      cases.push(
        check(
          'AP-01 provider: external zoom on live track invalidates geometry without App-Zoom UI',
          recalibrated &&
            readyZoom &&
            zoomed &&
            fitRef.current.camera.geometryRevision > revisionBefore &&
            fitRef.current.calibration.assessment.ok === false &&
            flowCalibrateReady(fitRef.current) === false &&
            Boolean(framingButton) &&
            !host.querySelector('[data-camera-zoom]'),
          `rev ${revisionBefore}→${fitRef.current.camera.geometryRevision} ok=${String(fitRef.current.calibration.assessment.ok)} hintUi=${Boolean(framingButton)}`,
        ),
      )
    }

    const workerSettled = await waitUntil(
      () =>
        fitRef.current?.pose.workerStatus === 'WORKER_READY' ||
        fitRef.current?.pose.workerStatus === 'error',
      8000,
    )
    const statusBeforeFatal = fitRef.current.pose.workerStatus
    fitRef.current.pose.injectGraphFatal()
    if (statusBeforeFatal === 'WORKER_READY') {
      await waitUntil(
        () =>
          fitRef.current?.pose.workerStatus === 'WORKER_READY' ||
          fitRef.current?.pose.workerStatus === 'error' ||
          fitRef.current?.pose.workerStatus === 'loading',
        8000,
      )
      await waitUntil(
        () =>
          fitRef.current?.pose.workerStatus === 'WORKER_READY' ||
          fitRef.current?.pose.workerStatus === 'error',
        8000,
      )
    }
    fitRef.current.pose.injectGraphFatal()
    const locked = await waitUntil(
      () => fitRef.current?.pose.workerStatus === 'error' && Boolean(fitRef.current.pose.workerError),
      4000,
    )
    flowRef.current.goTo('camera')
    await wait(40)
    const retryButton = host.querySelector<HTMLButtonElement>('.status-retry, [data-action="retry-pose"]')
    const poseFeedback = host.querySelector('[data-feedback="pose-error"]')
    retryButton?.click()
    const retried = await waitUntil(
      () =>
        fitRef.current?.pose.workerStatus === 'loading' ||
        fitRef.current?.pose.workerStatus === 'WORKER_READY' ||
        (fitRef.current?.pose.workerStatus === 'error' && fitRef.current.pose.workerError !== 'Pose-Graph ist defekt. Neu starten.'),
      8000,
    )
    await waitUntil(
      () =>
        fitRef.current?.pose.workerStatus === 'WORKER_READY' ||
        fitRef.current?.pose.workerStatus === 'error',
      8000,
    )
    cases.push(
      check(
        'AP-01 provider: fatal pose error locks, then UI retry starts a new engine',
        workerSettled &&
          locked &&
          Boolean(poseFeedback) &&
          Boolean(retryButton) &&
          retried &&
          fitRef.current.pose.workerStatus !== 'idle',
        `before=${statusBeforeFatal} locked=${fitRef.current.pose.workerStatus} error=${fitRef.current.pose.workerError ?? '—'} feedback=${Boolean(poseFeedback)} retry=${Boolean(retryButton)}`,
      ),
    )
  } catch (error) {
    cases.push(
      check('AP-01 provider harness threw', false, error instanceof Error ? error.message : String(error)),
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
        ? `AP01_MOUNTED_OK — ${cases.length} checks.`
        : `AP01_MOUNTED_FAIL — ${failed.map((item) => item.name).join(', ')}`,
  }
}
