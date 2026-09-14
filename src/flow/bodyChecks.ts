import { gripContactPending } from '../calibration/propose.ts'
import type { FitSession } from '../shell/FitSession.tsx'
import type { BodyCheck } from './types.ts'
import { nearJointsPx } from './liveMetrics.ts'

function nearSideLabel(nearSide: string): string {
  if (nearSide === 'left') return 'links'
  if (nearSide === 'right') return 'rechts'
  return nearSide
}

function pedalStatusLabel(status: string): string {
  if (status === 'locked') return 'gehalten'
  if (status === 'lost') return 'verloren'
  if (status === 'idle') return 'noch nicht gewählt'
  return status
}

export function bodyChecks(fit: FitSession): BodyCheck[] {
  const joints = nearJointsPx(fit.pose.frame)
  const poseOk = fit.pose.ready && Boolean(fit.pose.frame && joints.nearSide !== '—')
  const bodyOk = poseOk && Boolean(joints.hip && joints.knee && joints.ankle)
  const pedalOk =
    fit.pedal.sample.status === 'locked' ||
    (fit.pedal.sample.pixel !== null && fit.pedal.sample.status !== 'lost')
  const gripPending = gripContactPending(fit.calibration.detect, fit.calibration.data)

  return [
    {
      id: 'side',
      label: 'Seitliche Körperlinie',
      hint: poseOk
        ? `Kamera-nahe Seite: ${nearSideLabel(joints.nearSide)}`
        : fit.pose.freshness.status === 'lost'
          ? 'Pose verloren — Fahrer wieder ins Bild holen oder Personenerkennung erneut starten.'
          : fit.pose.freshness.status === 'stale'
            ? 'Pose veraltet — Körpercheck wartet auf einen frischen Frame.'
            : 'Fahrer im Seitenblick, Hoods, ganze Beinlinie im Bild.',
      ok: poseOk,
    },
    {
      id: 'joints',
      label: 'Hüfte, Knie und Knöchel sichtbar',
      hint: bodyOk
        ? 'Die gesamte Beinlinie ist im Ist-Skelett.'
        : 'Für den Kniewinkel muss auch der Knöchel im Bild sein. Kamera weiter weg oder 0,5× wählen; den ganzen Tretzyklus prüfen.',
      ok: bodyOk,
    },
    {
      id: 'pedal',
      label: 'Pedalbezug',
      hint: pedalOk
        ? `Marker ${pedalStatusLabel(fit.pedal.sample.status)}${
            fit.pedal.sample.crankAngleDeg != null
              ? ` · ${fit.pedal.sample.crankAngleDeg.toFixed(0)}°`
              : ''
          }`
        : fit.pedal.sample.status === 'lost'
          ? 'Marker verloren. Pedalmarker auswählen und erneut in die Bühne klicken.'
          : 'Hellen Kontrastpunkt am Pedal ins Bild holen. Pedalmarker auswählen, sobald die Person erkannt ist.',
      ok: pedalOk,
    },
    {
      id: 'grip',
      label: 'Griffkontakt an den Hoods',
      hint: gripPending
        ? 'Der Vorschlag sitzt auf dem Rad. Griffkontakt bestätigen — eine Punktkorrektur allein reicht nicht.'
        : 'Griffbezug gesetzt.',
      ok: !gripPending,
    },
  ]
}
