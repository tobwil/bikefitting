# ANALYSIS_STATUS — AP-03 L2 + AP-05 markerless `max_extension`

After a confirmed local **Gespeichert** clip, a local analysis job starts by itself. `measure()` is wired to AP-05 `observeKneeFromPoses`. Method id is `max_extension` / `max_extension.p10.v1`. This is **not** bottom dead centre.

## BUILD_OK

`npm run build` plus `npm run analysis:harness` (job lifecycle + markerless method checks).

## Product path

1. Complete save (persist + decode + duration) still comes from L1 capture store.
2. UI: **Aufnahme wird ausgewertet**, clip preview, progress from **posed/planned frames** (not a clock).
3. Failure: **Analyse erneut versuchen** reuses `captureId` + `contentHash` from the store. Camera is not dumped to empty idle.
4. Mount / dismount / stillstand are split from a contiguous pedaling span. No mandatory manual trim.
5. Incomplete clips are not auto-enqueued.
6. Default `measure()` adapter is `ap05.markerless`. It returns a `max_extension` observation (or `unavailable` with reasons). `ap05.pending` remains as an explicit stub only.

## Adapter wiring

AP-03 owns decode / pose / segment. AP-05 owns markerless numbers.

```ts
// src/analysis/metricsAdapter.ts
MARKERLESS_AP05_ADAPTER.measure(request) → observeKneeFromPoses(frames at mediaTimeMs)
```

Pose samples use **media time** (`request.samples[].mediaTimeMs` copied onto `PoseFrame.timestampMs`). Inference timestamps are not used as motion time.

Do not require pedal markers or B/S/G. Do not emit ActionDecision `adjust` (AP-10: usable `max_extension` is `review` + `markerless_not_released`).

## Method

- **id:** `max_extension`
- **version:** `max_extension.p10.v1`
- **UI phrase:** Kniebeugung nahe größter Streckung
- **phaseSource:** `motion_estimate` (not a verified crank detector)
- **Beginner n:** 10 complete usable motion cycles (expert BDC min-cycle = 3 is unchanged)

## What this package does **not** claim

- Not BDC / not crank 180° / not a pedal-marker phase
- Not a saddle-height recommendation or Ampel
- Not AP-09 accuracy / repeatability on real video
- Not AP-06 Ergebnis card (follows in #42)
- Not trunk / elbow / millimetre scale
- No cloud, no mandatory B/S/G or pedal markers
