# MODEL_COMPARE_STATUS — Lite vs Full (Nachreview 6dbc306 §D)

Status: **this branch**. Lab compare only. Product pose stays **Lite**. No YOLO. No framework switch. Person pose ≠ bike B/S/G calib.

## BUILD_OK

`npm run build` (`tsc -b && vite build`)

- `npm run pose:compare` — Lite/Full compare harness (synthetic + file-fixture clip)
- `npm run pose:harness` — existing INIT / MISS / session checks (unchanged)

## What the lab logs

Same clip, Lite then Full (never concurrent detect):

| Field | Source |
| --- | --- |
| Model version | `pose_landmarker_{lite\|full}/float16/1` + `@mediapipe/tasks-vision@0.10.35` |
| Runtime | INIT ms, inference p50 / p95 |
| Lost frames | miss / timeout / error vs detected |
| Landmark error | pairwise Lite↔Full; vs GT when synthetic/annotated |
| Angle deltas | mean abs knee / torso / elbow (same sagittal defs as E4) |

Heavy Pose Landmarker is **later-benchmark-only** — not vendored, button disabled.

## Cache / abort / switch

- Full is **not** created on app start. The product `FitSession` worker is Lite.
- Compare uses its own cache. Second run reuses loaded engines.
- Abort bumps a generation: in-flight load is dropped; in-flight compare returns `aborted`.
- Concurrent Lite+Full INIT is serialized. Detect never overlaps.

## Decision (accuracy + runtime)

`promoteFull` is **always false** on this delivery. Large models load only after a proven benefit on a real annotated side-view clip **and** a manual promotion.

VM evidence (`npm run pose:compare`, injected tracks; cartoon is not MediaPipe accuracy):

| Clip | Frames | GT RMSE Lite / Full | Lost | Verdict |
| --- | ---: | --- | --- | --- |
| synthetic-fixture-clip | 24 | 0.0134 / 0.0032 | 0 / 0 | keep_lite |
| `bikefit.file-replay.synthetic-crank.v1` | 46 | Full closer on distal | 0 / 0 | keep_lite |

Simulated Lite infer 8.2 ms vs Full 17.6 ms; init 42 vs 118 ms. Full is **not** loaded in the product worker. Cartoon MediaPipe (optional lab button) may lose every frame — logged as lost frames, not a bake-off.

Re-measure on a Mac (Chrome, trainer, hoods) with an annotated sequence before changing the default.

## UI

Gate-A-Labor → **Labor · Lite vs Full**

- **Synthetic-Clip** / **File-Fixture** — same-clip compare with GT (VM)
- **MediaPipe auf Clip** — local vendored Lite+Full workers on painted fixture frames
- **Datei lokal** — video/image/JSON annotation, no upload
- **Abbrechen** — generation abort
- **Heavy (später)** — disabled

## Out of scope

- OneEuro (C), MetricCard bands (E)
- Ampel / `productionEnabled`
- Bike detect / YOLO / cloud
