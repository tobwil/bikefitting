# CALIBRATION_STATUS — P2 auto B/S/G proposals

Status: **this branch**. Automatic point proposals + confirm + easy correct. Fully unsupervised calib is out of scope. Findings 1–5 are in (prototype honesty, off-thread detect, image generation, grip restore, zoom/pan).

## BUILD_OK

`npm run build` plus:

- `npm run calib:harness` — propose → confirm → apply, gold-rectangle reject, pixel occlusion, shifted-still generation, O(N) facing, grip restore pending, zoom/pan reach
- existing `setup` / `flow` / `metrics` / `soll` / `rules` / `sessions` harnesses

## What works

- **Prototyp vorschlagen** captures a still at source resolution (same coords as clicks) and runs `geometry.v1` / `local-prototype` **off the UI thread** (worker + progress + cancel + stale discard).
- The detector is an experimental color/silhouette prototype — **not** general bike detection and **not** frame-detect-done. Real camera copy pushes the manual path and does not invent confidence from gold pixel count.
- A filled gold rectangle is rejected. Pixel-path occlusion keeps B uncertain / not safely visible. Fixture known-ref tests stay on `proposeFromFixture`, separate from pixel detect. No silent synthetic fallback after a pixel miss.
- Candidates carry pixel, visibility, modest prototype confidence, `vorgeschlagen` / `bestätigt` / `korrigiert` / `unklar`.
- **Punkte passen** confirms determinate points without three new clicks. Occluded B stays uncertain.
- Confirm/correct merge only within the same **image generation**. A new capture (even same camera/resolution) needs re-confirm. Same still re-run keeps intentional corrections.
- Drag / click on the zoomable still corrects a point; zoom centers on the selected mark, pan/scroll moves the view. Re-detect does not overwrite confirmed/corrected marks.
- Failure (empty / bad perspective / several bikes without a pick) opens the manual B→S→G path. Nothing blocks. Nav/abort stay usable while detect runs.
- Only confirmed/corrected points become `BikeCalibration`. Detect version + per-point origin freeze into the result.
- Without a rider, G is a provisional hood ref. Body step confirms real hand contact. Persisted `detect.gripContact` survives reload; idle DetectSession does not skip the check. `origin: corrected` is a bike-point edit, not hand contact.
- Detect is locked while a take is running. Camera/setup change clears proposals (reconfirm).

## Known limits

- Geometry is a prototype against the synthetic fixture / gold frame triangle — not a trained bike model. Color is not object identity.
- Real Continuity Camera still needs a Mac. Bad perspective asks to reposition; no millimetres from an unscaled view.
- Unsupervised “always right” calib is not claimed. Ampel stays off unless `productionEnabled`.
