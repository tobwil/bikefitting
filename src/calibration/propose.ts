import {
  type BikeCalibration,
  type BikeMarkId,
  type CalibrationBinding,
  type GripKind,
  type MarkProvenance,
  type PixelPoint,
} from '../types/calibration.ts'
import { emptyCalibration } from './storage.ts'
import { computePixelBikeTransform } from './transform.ts'
import { assessCalibration, type VideoGeometry } from './validity.ts'
import {
  DETECT_VERSION,
  detectBikeFromPixels,
  detectFromFixture,
  detectFromObjectClass,
  type BikeCandidate,
  type BikeDetectOutput,
  type DetectedMark,
} from './detect.ts'
import type { FixtureStillOptions } from './fixtureStill.ts'
import type { PixelImage } from './pixels.ts'
import { MARK_ORDER } from './marks.ts'

export type DetectPhase = 'idle' | 'review' | 'failed' | 'manual' | 'applied'

export type DetectSession = {
  phase: DetectPhase
  version: BikeDetectOutput['version']
  image: { width: number; height: number }
  candidates: BikeCandidate[]
  selectedId: string | null
  riderPresent: boolean
  perspectiveOk: boolean
  message: string
  /** True while a take is running — do not re-estimate confirmed points. */
  locked: boolean
  gripContact: 'unconfirmed' | GripKind
}

export function emptyDetectSession(): DetectSession {
  return {
    phase: 'idle',
    version: DETECT_VERSION,
    image: { width: 0, height: 0 },
    candidates: [],
    selectedId: null,
    riderPresent: false,
    perspectiveOk: false,
    message: '',
    locked: false,
    gripContact: 'unconfirmed',
  }
}

function cloneSession(session: DetectSession): DetectSession {
  return structuredClone(session)
}

function selectedCandidate(session: DetectSession): BikeCandidate | null {
  if (session.candidates.length === 1) return session.candidates[0] ?? null
  return session.candidates.find((c) => c.id === session.selectedId) ?? null
}

function cloneMark(mark: DetectedMark): DetectedMark {
  return { ...mark, pixel: { ...mark.pixel } }
}

export function isLockedStatus(status: DetectedMark['status']): boolean {
  return status === 'confirmed' || status === 'corrected'
}

function mergeLocked(next: BikeCandidate, prev: BikeCandidate | null): BikeCandidate {
  if (!prev) return next
  const points = { ...next.points }
  for (const id of MARK_ORDER) {
    const old = prev.points[id]
    if (old && isLockedStatus(old.status)) points[id] = cloneMark(old)
  }
  return { ...next, points }
}

function outputToSession(out: BikeDetectOutput, prev: DetectSession | null = null): DetectSession {
  const prevSel = prev ? selectedCandidate(prev) : null
  const candidates = out.candidates.map((c) => mergeLocked(c, prevSel && c.id === prevSel.id ? prevSel : null))
  const needPick = candidates.length > 1
  const allBad = candidates.every((c) => c.viewQuality === 'bad_perspective' || c.viewQuality === 'none')
  const none = candidates.length === 0
  const phase: DetectPhase = none || allBad ? 'failed' : 'review'
  return {
    phase,
    version: out.version,
    image: out.image,
    candidates,
    selectedId: needPick ? null : (candidates[0]?.id ?? null),
    riderPresent: out.riderPresent,
    perspectiveOk: out.perspectiveOk && !allBad,
    message: none || allBad ? `${out.message} Manueller Weg ist frei.` : out.message,
    locked: prev?.locked ?? false,
    gripContact: 'unconfirmed',
  }
}

export function proposeFromImage(
  image: PixelImage,
  opts: { riderPresent?: boolean; previous?: DetectSession } = {},
): DetectSession {
  if (opts.previous?.locked) return opts.previous
  const out = detectBikeFromPixels(image, { riderPresent: opts.riderPresent })
  return outputToSession(out, opts.previous ?? null)
}

export function proposeFromFixture(
  opts: FixtureStillOptions & { riderPresent?: boolean; previous?: DetectSession } = {},
): DetectSession {
  if (opts.previous?.locked) return opts.previous
  const out = detectFromFixture(opts)
  return outputToSession(out, opts.previous ?? null)
}

export function rejectClassLabel(label: string): DetectSession {
  return outputToSession(detectFromObjectClass(label))
}

export function selectCandidate(session: DetectSession, id: string): DetectSession {
  const next = cloneSession(session)
  if (!next.candidates.some((c) => c.id === id)) {
    next.message = 'Unbekanntes Fahrrad — bitte erneut wählen.'
    return next
  }
  next.selectedId = id
  next.message = 'Fahrrad gewählt. Punkte prüfen oder ziehen.'
  return next
}

export function fallbackManual(session: DetectSession, message?: string): DetectSession {
  const next = cloneSession(session)
  next.phase = 'manual'
  next.message = message ?? 'Manuelle Kalibrierung. Drei Klicks: Tretlager, Sattel, Hoods.'
  return next
}

export function failToManual(message: string): DetectSession {
  return fallbackManual(emptyDetectSession(), message)
}

function updateSelected(session: DetectSession, fn: (c: BikeCandidate) => BikeCandidate): DetectSession {
  const next = cloneSession(session)
  const id = next.selectedId
  if (!id) {
    next.message = next.candidates.length > 1 ? 'Zuerst ein Fahrrad wählen.' : next.message
    return next
  }
  next.candidates = next.candidates.map((c) => (c.id === id ? fn(c) : c))
  return next
}

export function correctPoint(session: DetectSession, id: BikeMarkId, pixel: PixelPoint): DetectSession {
  if (session.locked) return session
  const next = updateSelected(session, (c) => {
    const prev = c.points[id]
    const mark: DetectedMark = {
      id,
      pixel: { ...pixel },
      visibility: 1,
      confidence: 1,
      occluded: false,
      uncertain: false,
      status: 'corrected',
      origin: 'corrected',
      // Bike-point correction keeps the previous grip kind. origin:corrected is not hand contact.
      gripKind: id === 'G' ? (prev?.gripKind ?? 'bike_ref') : undefined,
    }
    return { ...c, points: { ...c.points, [id]: mark }, viewQuality: c.viewQuality === 'occluded' ? 'ok' : c.viewQuality }
  })
  next.message = `${id} korrigiert. Automatik überschreibt das nicht.`
  if (next.phase === 'applied') {
    // stay applied — caller re-applies marks
  }
  return next
}

export function confirmPoint(session: DetectSession, id: BikeMarkId): DetectSession {
  if (session.locked) return session
  return updateSelected(session, (c) => {
    const prev = c.points[id]
    if (!prev) return c
    return {
      ...c,
      points: {
        ...c.points,
        [id]: { ...prev, status: prev.status === 'corrected' ? 'corrected' : 'confirmed', uncertain: false },
      },
    }
  })
}

/** Confirm all determinate proposals. Occluded/uncertain stay proposed — never silent-confirm. */
export function confirmProposal(session: DetectSession): DetectSession {
  if (session.locked) return session
  if (session.candidates.length > 1 && !session.selectedId) {
    const next = cloneSession(session)
    next.message = 'Mehrere Fahrräder — bitte eines wählen.'
    return next
  }
  const cand = selectedCandidate(session)
  if (!cand) return fallbackManual(session, 'Kein Kandidat. Manuell setzen.')
  if (cand.viewQuality === 'bad_perspective') {
    return fallbackManual(session, cand.message)
  }

  const next = updateSelected(session, (c) => {
    const points = { ...c.points }
    for (const id of MARK_ORDER) {
      const p = points[id]
      if (!p) continue
      if (p.uncertain || p.status === 'undetermined') continue
      if (isLockedStatus(p.status)) continue
      points[id] = { ...p, status: 'confirmed' }
    }
    return { ...c, points }
  })
  const after = selectedCandidate(next)
  const ready = after && MARK_ORDER.every((id) => {
    const p = after.points[id]
    return p && isLockedStatus(p.status)
  })
  if (ready) {
    next.phase = 'applied'
    next.gripContact = next.riderPresent ? 'unconfirmed' : 'bike_ref'
    next.message = next.riderPresent
      ? 'Punkte bestätigt. Am Körper-Schritt den Griffkontakt prüfen.'
      : 'Punkte bestätigt. G ist vorläufiger Hood-Bezug ohne Fahrer.'
  } else {
    next.phase = 'review'
    next.message = 'Unsichere Punkte nicht stillschweigend bestätigt. Ziehen oder manuell setzen.'
  }
  return next
}

export function confirmGripContact(session: DetectSession, kind: GripKind): DetectSession {
  const next = cloneSession(session)
  next.gripContact = kind
  const cand = selectedCandidate(next)
  if (cand?.points.G) {
    cand.points.G = {
      ...cand.points.G,
      gripKind: kind,
      status: isLockedStatus(cand.points.G.status) ? cand.points.G.status : 'confirmed',
      uncertain: false,
    }
  }
  next.message = kind === 'hand' ? 'Griffkontakt bestätigt.' : 'Vorläufiger Hood-Bezug ohne Handkontakt.'
  return next
}

/** Persist grip on BikeCalibration when DetectSession is idle after restore (no live candidate). */
export function confirmGripOnCalibration(cal: BikeCalibration, kind: GripKind): BikeCalibration {
  const detect = cal.detect
    ? { ...cal.detect, gripContact: kind }
    : {
        version: { detector: DETECT_VERSION.detector, model: DETECT_VERSION.model },
        riderPresent: true,
        gripContact: kind,
      }
  const prevG = cal.provenance?.G
  return {
    ...cal,
    updatedAt: new Date().toISOString(),
    detect,
    provenance: prevG ? { ...cal.provenance, G: { ...prevG, gripKind: kind } } : cal.provenance,
  }
}

/** Copy persisted grip onto a DetectSession without reconstructing candidates. */
export function restoreDetectGrip(session: DetectSession, cal: BikeCalibration): DetectSession {
  const grip = cal.detect?.gripContact
  if (!grip || session.gripContact === grip) return session
  return { ...session, gripContact: grip }
}

export function lockDetect(session: DetectSession, locked: boolean): DetectSession {
  return { ...session, locked }
}

export function provenanceFromMark(mark: DetectedMark): MarkProvenance {
  return {
    origin: mark.origin,
    status: mark.status,
    visibility: mark.visibility,
    confidence: mark.confidence,
    occluded: mark.occluded,
    uncertain: mark.uncertain,
    gripKind: mark.gripKind,
  }
}

export type ApplyResult = {
  calibration: BikeCalibration | null
  reason: string
  applied: BikeMarkId[]
}

/** Only confirmed/corrected points become BikeCalibration marks. */
export function applyConfirmed(
  session: DetectSession,
  binding: CalibrationBinding | null = null,
  previous: BikeCalibration | null = null,
): ApplyResult {
  const cand = selectedCandidate(session)
  if (!cand) return { calibration: null, reason: 'Kein gewähltes Fahrrad.', applied: [] }

  const marks: BikeCalibration['marks'] = {
    B: previous?.marks.B ?? null,
    S: previous?.marks.S ?? null,
    G: previous?.marks.G ?? null,
  }
  const provenance: NonNullable<BikeCalibration['provenance']> = { ...(previous?.provenance ?? {}) }
  const applied: BikeMarkId[] = []

  for (const id of MARK_ORDER) {
    const p = cand.points[id]
    if (!p || !isLockedStatus(p.status)) continue
    marks[id] = { ...p.pixel }
    provenance[id] = provenanceFromMark(p)
    applied.push(id)
  }

  if (applied.length === 0) {
    return { calibration: null, reason: 'Keine bestätigten Punkte — Geometrie allein gilt nicht als Kalibrierung.', applied }
  }

  const now = new Date().toISOString()
  const calibration: BikeCalibration = {
    version: previous?.version ?? 1,
    marks,
    transform: computePixelBikeTransform(marks),
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    binding: binding ?? previous?.binding ?? null,
    detect: {
      version: session.version,
      riderPresent: session.riderPresent,
      gripContact: session.gripContact,
    },
    provenance,
  }
  return { calibration, reason: 'Bestätigte Punkte übernommen.', applied }
}

export function assessProposal(session: DetectSession, video: VideoGeometry | null) {
  const cand = selectedCandidate(session)
  if (!cand) return { ok: false, geometryOk: false, message: 'Kein Kandidat.' }
  const scratch: BikeCalibration = {
    ...emptyCalibration(),
    marks: {
      B: cand.points.B?.pixel ?? null,
      S: cand.points.S?.pixel ?? null,
      G: cand.points.G?.pixel ?? null,
    },
  }
  scratch.transform = computePixelBikeTransform(scratch.marks)
  const assessment = assessCalibration(scratch, video)
  return {
    ok: session.phase === 'applied' && assessment.ok,
    geometryOk: assessment.ok,
    message: assessment.ok
      ? session.phase === 'applied'
        ? assessment.message
        : 'Geometrie plausibel — trotzdem bestätigen. Das ist keine automatische Freigabe.'
      : assessment.message,
    assessment,
  }
}

/**
 * Body-step hand-contact still needed.
 * Persisted `cal.detect.gripContact` is source of truth after restore (DetectSession is idle).
 * `origin: corrected` is a bike-point edit, not proof of hand contact.
 */
export function gripContactPending(session: DetectSession, cal: BikeCalibration): boolean {
  const gLive = selectedCandidate(session)?.points.G ?? null
  const gProv = cal.provenance?.G
  const origin = gProv?.origin ?? gLive?.origin
  const gripKind = gProv?.gripKind ?? gLive?.gripKind
  // Idle session defaults to unconfirmed — do not use it when calibration already stored a status.
  const grip = cal.detect?.gripContact ?? (session.phase === 'idle' ? undefined : session.gripContact)

  if (grip === 'hand' || gripKind === 'hand' || origin === 'manual') return false

  const hasG = Boolean(cal.marks.G) || Boolean(gLive)
  if (!hasG) return false

  if (grip === 'unconfirmed' || grip === 'bike_ref') return true
  if (origin === 'auto' || origin === 'corrected') return true
  return false
}

export function manualProvenance(id: BikeMarkId): MarkProvenance {
  return {
    origin: 'manual',
    status: 'confirmed',
    visibility: 1,
    confidence: 1,
    occluded: false,
    uncertain: false,
    gripKind: id === 'G' ? 'hand' : undefined,
  }
}

export function selectedPoints(session: DetectSession): Record<BikeMarkId, DetectedMark | null> | null {
  return selectedCandidate(session)?.points ?? null
}

export function selectedRegion(session: DetectSession) {
  return selectedCandidate(session)?.region ?? null
}
