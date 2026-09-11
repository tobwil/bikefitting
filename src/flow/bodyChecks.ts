import type { FitSession } from '../shell/FitSession.tsx'
import type { BodyCheck } from './types.ts'
import { nearJointsPx } from './liveMetrics.ts'

export function bodyChecks(fit: FitSession): BodyCheck[] {
  const joints = nearJointsPx(fit.pose.frame)
  const poseOk = Boolean(fit.pose.frame && joints.nearSide !== '—')
  const bodyOk = Boolean(joints.hip && joints.knee)
  const pedalOk =
    fit.pedal.sample.status === 'locked' ||
    (fit.pedal.sample.pixel !== null && fit.pedal.sample.status !== 'lost')

  return [
    {
      id: 'side',
      label: 'Seitliche Körperlinie',
      hint: poseOk
        ? `Kamera-nahe Seite: ${joints.nearSide}`
        : 'Fahrer im Seitenblick, Hoods, ganze Beinlinie im Bild.',
      ok: poseOk,
    },
    {
      id: 'joints',
      label: 'Hüfte und Knie sichtbar',
      hint: bodyOk ? 'Hüfte und Knie sind im Ist-Skelett.' : 'Hüfte und Knie müssen in der Kamera bleiben.',
      ok: bodyOk,
    },
    {
      id: 'pedal',
      label: 'Pedalbezug',
      hint: pedalOk
        ? `Marker ${fit.pedal.sample.status}${
            fit.pedal.sample.crankAngleDeg != null
              ? ` · ${fit.pedal.sample.crankAngleDeg.toFixed(0)}°`
              : ''
          }`
        : 'Hellen Kontrastpunkt am Pedal ins Bild holen. Pedalmarker auswählen, sobald die Person erkannt ist.',
      ok: pedalOk,
    },
  ]
}
