import { MIN_LANDMARK_VISIBILITY } from '../config/defaults.ts'
import { inferNearSide, visibleJoint } from '../pose/nearSide.ts'
import type { PoseFrame } from '../types/landmarks.ts'
import { CORRECT_FRAMING_LABEL, RECORD_ANYWAY_LABEL, RECORD_PRIMARY_LABEL } from './copy.ts'
import { FRAMING_HOLD_MS } from './constants.ts'

export type FramingCode = 'ok' | 'person_missing' | 'foot_missing' | 'leg_incomplete' | 'pose_brief_drop'

export type FramingHint = {
  code: FramingCode
  message: string
  primaryLabel: string
  primaryKind: 'record' | 'correct_framing'
  secondaryLabel: string | null
  secondaryKind: 'record_anyway' | null
  secondaryExplain: string | null
}

const OK_HINT: FramingHint = {
  code: 'ok',
  message: 'Hüfte, Knie und Fuß sind im Bild. Nicht auf den Bildschirm schauen, sobald die Aufnahme läuft.',
  primaryLabel: RECORD_PRIMARY_LABEL,
  primaryKind: 'record',
  secondaryLabel: null,
  secondaryKind: null,
  secondaryExplain: null,
}

export function framingFromPose(input: {
  connected: boolean
  poseReady: boolean
  freshness: 'live' | 'stale' | 'lost' | 'unknown'
  hip: boolean
  knee: boolean
  ankle: boolean
  foot: boolean
}): FramingHint {
  if (!input.connected) {
    return {
      code: 'person_missing',
      message: 'Warten, bis das Kamerabild läuft. Verbunden gilt erst bei neuen Bildern, nicht nur bei einem Stream.',
      primaryLabel: RECORD_PRIMARY_LABEL,
      primaryKind: 'record',
      secondaryLabel: null,
      secondaryKind: null,
      secondaryExplain: null,
    }
  }
  if (input.freshness === 'lost' && !input.poseReady) {
    return {
      code: 'pose_brief_drop',
      message: 'Person kurz nicht erkannt. Das Video wird trotzdem gespeichert — Aufnahme nicht unterbrechen.',
      primaryLabel: RECORD_PRIMARY_LABEL,
      primaryKind: 'record',
      secondaryLabel: null,
      secondaryKind: null,
      secondaryExplain: null,
    }
  }
  if (!input.hip && !input.knee && !input.ankle) {
    return {
      code: 'person_missing',
      message: 'Fahrer seitlich ins Bild holen. Ganze Beinlinie: Hüfte, Knie, Fuß.',
      primaryLabel: CORRECT_FRAMING_LABEL,
      primaryKind: 'correct_framing',
      secondaryLabel: RECORD_ANYWAY_LABEL,
      secondaryKind: 'record_anyway',
      secondaryExplain:
        'Ohne sichtbare Person kann die spätere Auswertung scheitern. Das Video wird trotzdem lokal gespeichert.',
    }
  }
  if (!input.foot || !input.ankle) {
    return {
      code: 'foot_missing',
      message: 'Fuß fehlt im Bild. Kamera weiter weg oder 0,5× — der ganze Fuß muss im Ausschnitt bleiben.',
      primaryLabel: CORRECT_FRAMING_LABEL,
      primaryKind: 'correct_framing',
      secondaryLabel: RECORD_ANYWAY_LABEL,
      secondaryKind: 'record_anyway',
      secondaryExplain:
        'Die Aufnahme wird gespeichert. Fehlt der Fuß, kann die Auswertung später scheitern.',
    }
  }
  if (!input.hip || !input.knee) {
    return {
      code: 'leg_incomplete',
      message: 'Beinlinie unvollständig. Ausschnitt so wählen, dass Hüfte, Knie und Fuß im Tretzyklus sichtbar bleiben.',
      primaryLabel: CORRECT_FRAMING_LABEL,
      primaryKind: 'correct_framing',
      secondaryLabel: RECORD_ANYWAY_LABEL,
      secondaryKind: 'record_anyway',
      secondaryExplain:
        'Die Aufnahme wird gespeichert. Ohne Beinlinie kann die Auswertung später scheitern.',
    }
  }
  return OK_HINT
}

export function jointsFromPoseFrame(frame: PoseFrame | null): {
  hip: boolean
  knee: boolean
  ankle: boolean
  foot: boolean
} {
  if (!frame || frame.landmarks.length === 0) {
    return { hip: false, knee: false, ankle: false, foot: false }
  }
  const near = frame.nearSide ?? inferNearSide(frame.landmarks, MIN_LANDMARK_VISIBILITY) ?? 'right'
  const vis = (joint: 'HIP' | 'KNEE' | 'ANKLE' | 'HEEL' | 'FOOT_INDEX') =>
    Boolean(visibleJoint(frame.landmarks, near, joint, MIN_LANDMARK_VISIBILITY))
  const ankle = vis('ANKLE')
  const heel = vis('HEEL')
  const toe = vis('FOOT_INDEX')
  return {
    hip: vis('HIP'),
    knee: vis('KNEE'),
    ankle,
    foot: heel || toe,
  }
}

export function stabilizeHint(
  prev: FramingHint | null,
  next: FramingHint,
  heldForMs: number,
  minHoldMs = FRAMING_HOLD_MS,
): FramingHint {
  if (!prev || prev.code === next.code) return next
  if (heldForMs < minHoldMs) return prev
  return next
}

/** Pose loss never blocks local video save. Camera/disk errors do. */
export function framingBlocksSave(hint: FramingHint | null): boolean {
  void hint
  return false
}
