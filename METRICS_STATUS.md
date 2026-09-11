# METRICS_STATUS — Messpipeline E4

Numeric sagittal metrics over valid crank cycles. **No Ampel**, no accounts, no cloud.

Harness: `npm run metrics:harness` (synthetic pose + pedal + B/S/G transform; no camera).

| Check | VM result | How |
| --- | --- | --- |
| Cycle detection | **Pass** | Pedal `locked` + crank unwrap ≥360° → candidate revolution. Idle/lost abort the open cycle; brief locked frames with no angle are skipped. Incomplete wraps excluded. |
| Valid revolutions | **Pass** | 8 synthetic revs at 80 rpm / 30 fps → ≥6 valid. Phase-loss and 1-rev streams excluded. |
| Knee flexion | **Pass** (`ok`) | φ = 180° − inner(hip–knee–ankle) in the bike plane. Same definition as calibration `flexion`. |
| Trunk / torso | **Pass** (`ok`) | α = atan2(dy, dx) of hip→shoulder vs bike +x, folded to [0, 180). 0° tucked, 90° upright. |
| Elbow flexion | **Pass** (`ok`) | φ = 180° − inner(shoulder–elbow–wrist). Hidden elbow landmarks → `unavailable` + `visibility`. |
| Aggregate | **Pass** | Per-cycle mean, then mean / median / IQR (`spread`) across valid cycles only. |
| Quality vs unavailable | **Pass** | Each metric is `ok` (numbers, empty reasons) or `unavailable` (`degrees: null`, reasons: `visibility` \| `phase_loss` \| `too_few_cycles`). Never a number with a colour band. |
| Live synthetic series | **Pass** | Fixture lock: valid revs track pedal; knee / trunk / elbow `ok` with median + IQR. Reset series then re-accumulate. |
| BUILD_OK | **Pass** | `tsc -b && vite build`; `npm run metrics:harness` (5/5); `oxlint` (no new errors). |

## Angle definitions (code)

See comments on `kneeFlexionDeg`, `trunkTorsoDeg`, `elbowFlexionDeg` in `src/metrics/angles.ts`. All sagittal 2D, camera-near side. Consume pose landmarks + pedal phase + `pixelToBike` — do not rewrite those cores.

## MAC_TEST_STILL_NEEDED

- Live MediaPipe Ist + pedal lock across ≥3 real revolutions on a Mac trainer
- Distal elbow / wrist visibility at the hoods (Lite vs Full)
- Confirm trunk α against a level camera (transform origin B, x forward, y up)
