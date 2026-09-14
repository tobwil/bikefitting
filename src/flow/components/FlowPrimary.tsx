import { ALLOW_SYNTHETIC_FIXTURE } from '../../config/defaults.ts'
import { useFit } from '../../shell/FitSession.tsx'
import { useFlow } from '../FlowProvider.tsx'
import { flowFeedback, personIsVisible } from '../feedback.ts'
import { remeasureDestination } from '../navPolicy.ts'
import { retryHandler, retryKindForFeedback } from '../retryAction.ts'
import { PrimaryBar } from './PrimaryBar.tsx'

export function FlowPrimary() {
  const flow = useFlow()
  const fit = useFit()
  const feedback = flowFeedback({
    step: flow.step,
    camera: fit.camera.status,
    personVisible: personIsVisible(fit.pose.frame, fit.pose.nearSide),
    pedalStatus: fit.pedal.sample.status,
    workerError: fit.pose.workerError,
  })
  const retry = retryHandler(retryKindForFeedback(feedback), {
    reconnectCamera: () => {
      void fit.camera.restart()
    },
    restartPose: () => {
      void fit.pose.retry()
    },
    reselectPedal: () => {
      fit.pedal.setSelecting(true)
    },
  })
  const back = (
    <button type="button" onClick={flow.back}>
      Zurück
    </button>
  )

  if (flow.step === 'camera') {
    const needsStart = !flow.cameraReady
    const fileJourney = flow.journey === 'file' || fit.camera.status.source === 'file'
    return (
      <PrimaryBar
        feedback={feedback}
        onRetry={retry}
        secondary={back}
        primary={
          needsStart ? (
            fileJourney ? (
              <button type="button" className="is-active" onClick={() => document.querySelector<HTMLInputElement>('input[type=file]')?.click()}>
                Datei wählen
              </button>
            ) : (
              <button type="button" className="is-active" onClick={() => void fit.camera.start()}>
                Kamera starten
              </button>
            )
          ) : (
            <button type="button" className="is-active" onClick={flow.next}>
              Weiter zur Kalibrierung
            </button>
          )
        }
      />
    )
  }

  if (flow.step === 'calibrate') {
    return (
      <PrimaryBar
        feedback={feedback}
        onRetry={retry}
        secondary={back}
        primary={
          <button type="button" className="is-active" disabled={!flow.calibrateReady} onClick={flow.next}>
            Weiter zum Körperbezug
          </button>
        }
      />
    )
  }

  if (flow.step === 'body') {
    return (
      <PrimaryBar
        feedback={feedback}
        onRetry={retry}
        secondary={back}
        primary={
          <button type="button" className="is-active" disabled={!flow.bodyReady} onClick={flow.next}>
            Messung starten
          </button>
        }
      />
    )
  }

  if (flow.step === 'measure') {
    const { phase, startCountdown, abort, finish, validRevs } = flow.measure
    if (fit.camera.staticCheck) {
      return (
        <PrimaryBar
          feedback={{
            id: 'static-check',
            tone: 'info',
            title: 'Einzelbild — statische Prüfung, keine Mehrzyklus-Messung.',
          }}
          secondary={back}
          primary={
            <button type="button" className="is-active" disabled>
              Keine Mehrzyklus-Messung
            </button>
          }
        />
      )
    }
    const demoEval =
      ALLOW_SYNTHETIC_FIXTURE && flow.journey === 'demo' ? (
        <button type="button" data-action="demo-result" onClick={() => finish({ demo: true })}>
          {phase === 'recording' ? 'Warte auf gültige Zyklen…' : 'Beispiel auswerten'}
        </button>
      ) : null

    if (phase === 'countdown') {
      return (
        <PrimaryBar
          feedback={{
            id: 'countdown',
            tone: 'info',
            title: 'Aufnahme startet — nicht auf den Bildschirm schauen.',
          }}
          secondary={back}
          primary={
            <button type="button" className="is-active" data-action="abort-measure" onClick={abort}>
              Abbrechen
            </button>
          }
        />
      )
    }

    if (phase === 'recording') {
      return (
        <PrimaryBar
          feedback={feedback}
          onRetry={startCountdown}
          secondary={
            <>
              {back}
              <button type="button" data-action="abort-measure" onClick={abort}>
                Abbrechen
              </button>
            </>
          }
          primary={
            <>
              <button type="button" className="is-active" disabled={validRevs < 1} onClick={() => finish()}>
                Mit {validRevs} Umdrehungen auswerten
              </button>
              <button type="button" onClick={startCountdown}>
                Erneut versuchen
              </button>
              {demoEval}
            </>
          }
        />
      )
    }

    return (
      <PrimaryBar
        feedback={feedback}
        onRetry={startCountdown}
        secondary={back}
        primary={
          <>
            <button type="button" className="is-active" onClick={startCountdown}>
              {phase === 'finished' || phase === 'aborted' ? 'Erneut versuchen' : 'Countdown starten'}
            </button>
            {demoEval}
          </>
        }
      />
    )
  }

  if (flow.step === 'result') {
    const remasureDest = remeasureDestination({
      cameraReady: flow.cameraReady,
      calibrateReady: flow.calibrateReady,
      sample: fit.pedal.sample,
      seedPoint: fit.pedal.seedPoint,
    })
    return (
      <PrimaryBar
        feedback={feedback}
        secondary={
          <button type="button" data-action="remeasure" onClick={flow.entryPath === 'beginner' ? flow.retakeCapture : flow.remeasure}>
            {flow.entryPath === 'beginner'
              ? 'Neu aufnehmen'
              : remasureDest === 'body'
                ? 'Bezug erneut setzen'
                : 'Erneut messen'}
          </button>
        }
        primary={
          <button type="button" className="is-active" onClick={() => flow.goTo('start')}>
            Zur Startseite
          </button>
        }
      />
    )
  }

  return null
}
