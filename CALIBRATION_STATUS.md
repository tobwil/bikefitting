# CALIBRATION_STATUS — P2 auto B/S/G proposals

Status: **this branch**. Automatic point proposals + confirm + easy correct. Fully unsupervised calib is out of scope.

## BUILD_OK

`npm run build` plus:

- `npm run calib:harness` — propose → confirm → apply, manual fallback, no silent-confirm
- existing `setup` / `flow` / `metrics` / `soll` / `rules` / `sessions` harnesses

## What works

- **Fahrrad erkennen** captures a still at source resolution (same coords as clicks).
- Local **geometry.v1** prototype finds a bike region + B/S/G. Person pose is not bike calib. A `bicycle` class label is rejected.
- Candidates carry pixel, visibility, confidence, `vorgeschlagen` / `bestätigt` / `korrigiert` / `unklar`.
- **Punkte passen** confirms determinate points without three new clicks. Occluded B stays uncertain.
- Drag / click on the zoomable still corrects a point; re-detect does not overwrite confirmed/corrected marks.
- Failure (empty / bad perspective / several bikes without a pick) opens the manual B→S→G path. Nothing blocks.
- Only confirmed/corrected points become `BikeCalibration`. Detect version + per-point origin freeze into the result.
- Without a rider, G is a provisional hood ref. Body step confirms real hand contact.
- Detect is locked while a take is running. Camera/setup change clears proposals (reconfirm).

## Known limits

- Geometry is a prototype against the synthetic fixture / gold frame triangle — not a trained bike model.
- Real Continuity Camera still needs a Mac. Bad perspective asks to reposition; no millimetres from an unscaled view.
- Unsupervised “always right” calib is not claimed.
