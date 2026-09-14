# ANALYSIS_STATUS — AP-05 markerfreie Kniemethode

Marker-free knee observation on a **saved local clip**, not live rVFC. Method id is `max_extension` / `max_extension.p10.v1`. This is **not** bottom dead centre.

Harness: `npm run analysis:harness` (synthetic pose-replay clip bytes + pose frames; no camera, no cloud).

| Check | VM result | How |
| --- | --- | --- |
| Pose replay over saved clip | **Pass** (fixture) | Media-time walk + side lock. Fixture kind `bikefit.pose-replay-clip`. Real WebM/MP4 decode is AP-03. |
| Pedaling segment | **Pass** | Hip–ankle unwrap; still / mount / dismount excluded, not stitched. |
| Knee metric | **Pass** | Per valid cycle: 10th percentile of raw flexion; median across ≥10 cycles. |
| Method identity | **Pass** | Never renamed to `bottom_dead_center`. BDC rule profile does not auto-apply. |
| ActionDecision | **Pass** | Missing knee → `retake`/`missing_knee`. Few cycles → insufficient. Usable `max_extension` → `review` + `markerless_not_released` (no seat tip). |
| Evidence | **Pass** | `motion_state` + media time / cycle / frame refs. No `phase:bdc`. |

## Method

- **id:** `max_extension`
- **version:** `max_extension.p10.v1`
- **UI phrase:** Kniebeugung nahe größter Streckung
- **phaseSource:** `motion_estimate` (not a verified crank detector)
- **Beginner n:** 10 complete usable motion cycles (expert BDC min-cycle = 3 is unchanged)

## AP-03 interface

`runMarkerlessJob({ jobId, captureId, clipId, bytes, poseFrames? })` → MarkerlessReport / MetricsReport-like.

- If `poseFrames` is set (AP-03 decode + pose), AP-05 measures.
- If `bytes` are a pose-replay fixture, AP-05 decodes them locally.
- If `bytes` are real MediaRecorder media without pose frames → `decoder_required`.

## What this package does **not** claim

- Not BDC / not crank 180° / not a pedal-marker phase
- Not a saddle-height recommendation or Ampel
- Not AP-09 accuracy / repeatability on real video
- Not WebM/MP4/HEVC decode (AP-03)
- Not trunk / elbow / millimetre scale
- Not live-only measurement
- No cloud, no mandatory B/S/G or pedal markers
