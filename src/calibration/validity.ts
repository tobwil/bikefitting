import type { BikeCalibration, PixelPoint } from '../types/calibration.ts'
import type { VideoSourceKind } from '../types/camera.ts'
import { makeSetupId } from '../camera/setupId.ts'

export const MIN_MARK_SEPARATION_PX = 12
export const MIN_TRIANGLE_AREA_PX = 80

export type CalibrationIssue =
  | 'missing_marks'
  | 'identical_marks'
  | 'degenerate'
  | 'out_of_bounds'
  | 'no_transform'
  | 'source_mismatch'
  | 'no_video'

export type VideoGeometry = {
  source: VideoSourceKind
  deviceId: string | null
  width: number
  height: number
  geometryRevision?: number
}

export type CalibrationAssessment = {
  ok: boolean
  issues: CalibrationIssue[]
  message: string
  setupId: string | null
}

const ISSUE_COPY: Record<CalibrationIssue, string> = {
  missing_marks: 'B, S und G müssen gesetzt sein.',
  identical_marks: 'B, S und G dürfen nicht auf demselben Punkt liegen.',
  degenerate: 'Marken sind kollinear oder zu nah — Geometrie unbrauchbar.',
  out_of_bounds: 'Mindestens eine Marke liegt außerhalb des Videobilds.',
  no_transform: 'Keine gültige Pixel↔Bike-Transformation.',
  source_mismatch: 'Kalibrierung gilt nicht für diese Kamera, Datei oder Auflösung.',
  no_video: 'Kein abspielbares Videobild mit gültiger Größe.',
}

function dist(a: PixelPoint, b: PixelPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function triangleArea(a: PixelPoint, b: PixelPoint, c: PixelPoint): number {
  return Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2
}

function inBounds(p: PixelPoint, width: number, height: number): boolean {
  return p.x >= 0 && p.y >= 0 && p.x <= width && p.y <= height
}

export function assessCalibration(
  cal: BikeCalibration,
  video: VideoGeometry | null,
): CalibrationAssessment {
  const issues: CalibrationIssue[] = []
  const setupId = video && video.width >= 2 && video.height >= 2 ? makeSetupId(video) : null

  if (!video || video.width < 2 || video.height < 2) {
    issues.push('no_video')
  }

  const { B, S, G } = cal.marks
  if (!B || !S || !G) {
    issues.push('missing_marks')
  } else {
    const pairs = [dist(B, S), dist(S, G), dist(G, B)]
    if (pairs.some((d) => d < 1)) {
      issues.push('identical_marks')
    } else if (
      pairs.some((d) => d < MIN_MARK_SEPARATION_PX) ||
      triangleArea(B, S, G) < MIN_TRIANGLE_AREA_PX
    ) {
      issues.push('degenerate')
    }
    if (video && video.width >= 2 && video.height >= 2) {
      if (![B, S, G].every((p) => inBounds(p, video.width, video.height))) {
        issues.push('out_of_bounds')
      }
    }
  }

  if (!cal.transform) {
    issues.push('no_transform')
  }

  if (setupId && cal.binding && cal.binding.setupId !== setupId) {
    issues.push('source_mismatch')
  }

  const unique = [...new Set(issues)]
  return {
    ok: unique.length === 0,
    issues: unique,
    message: unique.length === 0 ? 'Kalibrierung gültig.' : unique.map((id) => ISSUE_COPY[id]).join(' '),
    setupId,
  }
}

export function isCalibrationReady(cal: BikeCalibration, video: VideoGeometry | null): boolean {
  return assessCalibration(cal, video).ok
}
