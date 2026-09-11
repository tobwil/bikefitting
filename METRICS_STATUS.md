# METRICS_STATUS — Messpipeline E4 + Review P1 (1, 2, 6)

Numeric sagittal metrics over valid crank cycles. **No Ampel**, no accounts, no cloud.

Harness: `npm run metrics:harness` (synthetic pose + pedal + B/S/G transform; no camera).

| Check | VM result | How |
| --- | --- | --- |
| Cycle detection | **Pass** | Pedal `locked` + crank unwrap ≥360° from TDC. Leading partial rev after mid-crank start is dropped. Idle/lost abort the open cycle; brief locked frames with no angle are skipped. |
| Valid revolutions | **Pass** | 8 synthetic revs at 80 rpm / 30 fps → ≥6 valid. Phase-loss and 1-rev streams excluded. |
| Knee BDC | **Pass** (`ok`, `bottom_dead_center`) | φ at crank 180° over a ±12° window, lerp in crank space (see `src/metrics/bdc.ts`). Method / unit / n / quality live on the metric. |
| Knee cycle-mean | **Pass** (separate metric) | Per-cycle mean kept as `kneeFlexionCycleMean` (`cycle_mean`). Time-varying fixture: BDC ≠ cycle-mean; only BDC may enter the BDC rule. |
| Trunk / torso | **Pass** (`ok`, `cycle_mean`) | α = atan2(dy, dx) of hip→shoulder vs bike +x, folded to [0, 180). |
| Elbow flexion | **Pass** (`ok`, `cycle_mean`) | φ = 180° − inner(shoulder–elbow–wrist). Hidden elbow → `unavailable` + `visibility`. |
| Tracking vs metric quality | **Pass** | 10 pedal revs, hidden knee: tracking `ok`, knee `unavailable` (`visibility`). 10 pedal / 3 knee usable → rules get n=3, not 10. |
| Capture boundaries | **Pass** | States `ready → countdown → recording → finished \| aborted`. 20 setup revs ignored; 800 ms does not end a 3 s countdown; restart after 5 rec revs starts at 0; freeze at target revs is atomic. |
| BUILD_OK | **Pass** | `tsc -b && vite build`; `npm run metrics:harness`; `npm run flow:harness`; `npm run check:rules`. |

## Angle definitions (code)

See comments on `kneeFlexionDeg`, `trunkTorsoDeg`, `elbowFlexionDeg` in `src/metrics/angles.ts`. BDC window / interpolation / visibility: `src/metrics/bdc.ts`. All sagittal 2D, camera-near side. Consume pose landmarks + pedal phase + `pixelToBike` — do not rewrite those cores.

## Capture

`createMeasurementCapture` opens an empty aggregator only when countdown ends (real seconds). Preview frames must not be pushed. Finished reports are frozen; displayed revs, n, and export must share that snapshot. Live `pipeline.snapshot()` is cached: `push` materializes once, later `snapshot()` reuse that object until the next frame.

## MAC_TEST_STILL_NEEDED

- Live MediaPipe Ist + pedal lock across ≥3 real revolutions on a Mac trainer
- Distal elbow / wrist visibility at the hoods (Lite vs Full)
- Confirm trunk α against a level camera (transform origin B, x forward, y up)
- Confirm BDC window against a known crank mark on a trainer
- Phase stills on a real Mac: JPEG bake + representative cycle vs reported BDC median
