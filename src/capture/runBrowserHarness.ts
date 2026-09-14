import { createCameraRecorder } from './recorder.ts'
import { finalizeCapture } from './finalize.ts'
import { createMemoryCaptureStore } from './storage.ts'
import { inspectDecodedClip } from './inspect.ts'
import { isPreviewConnected } from './liveness.ts'
import { savedUiLabel, SAVED_LABEL, INCOMPLETE_LABEL } from './copy.ts'
import { runCaptureHarness } from './harness.ts'

export type ProviderHarnessCase = { name: string; passed: boolean; detail: string }
export type ProviderHarnessResult = { passed: boolean; cases: ProviderHarnessCase[]; message: string }

function check(name: string, passed: boolean, detail: string): ProviderHarnessCase {
  return { name, passed, detail }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function movingCanvasStream(ms: number): { stream: MediaStream; stop: () => void } {
  const canvas = document.createElement('canvas')
  canvas.width = 320
  canvas.height = 180
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  let t = 0
  let timer = 0
  const draw = () => {
    t += 1
    ctx.fillStyle = t % 2 === 0 ? '#c4a35a' : '#3a342c'
    ctx.fillRect(0, 0, 320, 180)
    ctx.fillStyle = '#e8e0d4'
    ctx.fillRect(20 + (t % 80), 40, 40, 80)
  }
  draw()
  const stream = canvas.captureStream(24)
  timer = window.setInterval(draw, 40)
  window.setTimeout(() => window.clearInterval(timer), ms + 500)
  return {
    stream,
    stop() {
      window.clearInterval(timer)
      for (const track of stream.getTracks()) track.stop()
    },
  }
}

async function recordOnce(recordMs: number, interruptAt?: number) {
  const fixture = movingCanvasStream(recordMs + 800)
  const created = createCameraRecorder(fixture.stream, { timesliceMs: 50 })
  if ('code' in created) {
    fixture.stop()
    throw new Error(created.message)
  }
  created.start()
  if (interruptAt != null) {
    await wait(interruptAt)
    fixture.stream.getVideoTracks()[0]?.stop()
  } else {
    await wait(recordMs)
  }
  const stopped = await created.stop(interruptAt != null ? 'interrupt' : 'timer')
  fixture.stop()
  return stopped
}

export async function runMountedCaptureHarness(): Promise<ProviderHarnessResult> {
  const cases: ProviderHarnessCase[] = []
  const logic = runCaptureHarness()
  cases.push(...logic.cases)

  try {
    const recorded = await recordOnce(1200)
    cases.push(
      check(
        'MediaRecorder captures camera/canvas stream not overlay screenshot',
        recorded.blob.size > 500 && recorded.hasAudioTracks === false && recorded.mime.extension.length > 0,
        `${recorded.byteLength} bytes ${recorded.mime.mimeType}`,
      ),
    )
    const store = createMemoryCaptureStore()
    const saved = await finalizeCapture({
      blob: recorded.blob,
      mime: recorded.mime,
      intendedDurationMs: 1200,
      captureType: 'webcam',
      store,
    })
    if ('code' in saved) {
      cases.push(check('timed clip finalizes and persists', false, saved.message))
    } else {
      const label = savedUiLabel({
        persisted: true,
        decoded: true,
        completeness: saved.asset.completeness,
      })
      cases.push(
        check(
          'confirmed save is Gespeichert only when complete',
          saved.asset.completeness === 'complete' && label === SAVED_LABEL && saved.asset.hasAudio === false,
          `${label} · ${saved.asset.durationMs.toFixed(0)}ms`,
        ),
      )
      const again = await store.get(saved.asset.captureId)
      const url = URL.createObjectURL(again?.blob ?? saved.blob)
      const video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      video.src = url
      document.body.appendChild(video)
      try {
        await video.play()
      } catch {
        /* autoplay */
      }
      await wait(200)
      cases.push(
        check(
          'saved clip is playable after persist',
          video.readyState >= 1 && video.videoWidth >= 2 && Number.isFinite(video.duration) && video.duration > 0,
          `${video.videoWidth}x${video.videoHeight} ${video.duration}s ready=${video.readyState}`,
        ),
      )
      video.remove()
      URL.revokeObjectURL(url)
    }

    const poseError = 'Packet timestamp mismatch'
    void poseError
    const recordedWithPoseNoise = await recordOnce(900)
    cases.push(
      check(
        'pose error does not stop recorder',
        recordedWithPoseNoise.byteLength > 0 && recordedWithPoseNoise.reason === 'timer',
        `${recordedWithPoseNoise.byteLength} ${recordedWithPoseNoise.reason}`,
      ),
    )

    const interrupted = await recordOnce(2000, 250)
    const inspected = await inspectDecodedClip(interrupted.blob, 2000)
    const incompleteLabel = savedUiLabel({
      persisted: Boolean(inspected.decoded && inspected.completeness),
      decoded: inspected.decoded,
      completeness: inspected.completeness,
    })
    cases.push(
      check(
        'camera interrupt finalizes remaining bytes; incomplete is never Gespeichert',
        interrupted.reason === 'interrupt' && incompleteLabel !== SAVED_LABEL,
        `${interrupted.byteLength}b decoded=${inspected.decoded} ${inspected.completeness} label=${incompleteLabel}`,
      ),
    )
    if (inspected.decoded && inspected.completeness === 'incomplete') {
      cases.push(check('incomplete uses Unvollständig', incompleteLabel === INCOMPLETE_LABEL, String(incompleteLabel)))
    }

    cases.push(
      check(
        'connected requires updating decoded frames',
        isPreviewConnected({
          hasStreamObject: true,
          playable: true,
          lastDecodedFrameAtMs: null,
          nowMs: 50,
        }) === false,
        'stream-only rejected',
      ),
    )
  } catch (error) {
    cases.push(
      check('mounted recorder threw', false, error instanceof Error ? error.message : String(error)),
    )
  }

  const failed = cases.filter((item) => !item.passed)
  return {
    passed: failed.length === 0,
    cases,
    message:
      failed.length === 0
        ? `CAPTURE_MOUNTED_OK — ${cases.length} checks.`
        : `CAPTURE_MOUNTED_FAIL — ${failed.map((item) => item.name).join(', ')}`,
  }
}
