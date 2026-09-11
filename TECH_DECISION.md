# TECH_DECISION — BikeFit Mac E0 / Gate A

Status: **modules merged + wired on main**. VM Gate A documented in `GATE_A.md`. Fill Mac measurements after a real Chrome-on-macOS run.

## Decision log

| Topic | Choice | Why |
| --- | --- | --- |
| Stack | TypeScript + React + Vite 8 | Requested; official `create-vite` react-ts scaffold |
| Pose API | `@mediapipe/tasks-vision@0.10.35` Pose Landmarker, **VIDEO** mode in a Web Worker | Official path; keeps detect off the UI thread |
| Default model | **Lite** (`pose_landmarker_lite` float16/1) | Live 30 fps headroom on Mac; Full is vendored for A/B |
| Full vs Lite | Lite default; Full lab-only | Lab compare (Nachreview §D) logs version, runtime, lost frames, landmark RMSE, angle deltas on the **same clip**. Full loads only in that cache. **keep_lite** until an annotated Mac clip shows accuracy **and** runtime benefit. Heavy is later-benchmark-only. Cartoon/file-fixture is not MediaPipe accuracy. |
| Assets | `/models/*.task` + `/models/wasm` copied from the pinned npm package | No runtime `latest` CDN |
| Frame sync | `requestVideoFrameCallback` when available, else rAF + `video.currentTime` guard | Overlay must share the video frame |
| Calibration persist | `localStorage` key `bikefit.calibration.v1` (IndexedDB OK later) | Spike-sized; schema versioned |
| Scoring | **None in E0** | Knee value is numeric only. No Ampel |
| Overlay 1€ | Casiez TypeScript (BSD), timestamps | Lab compare only. Raw pose for metrics. Not NintAi 30 Hz. See `POSE_STATUS.md` |
| Ist vs Soll | Separate streams | Never fill missing Ist points from Soll |
| Audio | `audio: false` always | Microphone stays off |
| Synthetic fixture | Dev / VM only (`import.meta.env.DEV` or `VITE_ALLOW_SYNTHETIC=1`) | Not a production test profile |

## Latency / FPS (to measure)

| Environment | Inference (ms) | Overlay lag vs video | FPS | Notes |
| --- | --- | --- | --- | --- |
| Agent VM, no camera | worker init only | synthetic overlay | fixture ~30 | No Mac camera. Synthetic fixture + harness |
| Mac + Chrome + Lite | *TBD* | *TBD* | *TBD* | Gate A must re-measure |
| Mac + Chrome + Full | *TBD* | *TBD* | *TBD* | Gate A must re-measure |

How to measure later:

1. Worker posts `inferenceMs` per `detectForVideo`.
2. Main thread logs `rVFC` timestamp − result timestamp.
3. Capture 30 s side-view trainer footage; report p50/p95.

## Typical joint error (to measure)

No real side-view bike clips on the agent VM. Do **not** treat synthetic drawings as MediaPipe accuracy.

| Joint (camera-near) | Expected issue on side view | VM fixture | Real Mac |
| --- | --- | --- | --- |
| Shoulder / hip | Occlusion by torso | *synthetic only* | Re-measure |
| Knee | Best-case for side view | *synthetic only* | Re-measure |
| Ankle / heel / foot index | Distal, often low visibility | *synthetic only* | Re-measure |
| Elbow / wrist | May leave frame at hoods | *synthetic only* | Re-measure |

Visibility default **0.75** is a filter, not an accuracy claim.

## Gate A evidence gaps (honest)

1. **No camera on the agent VM** — Start may deny; use Synthetic. Live MediaPipe on a real rider is unproven here.
2. **No real rider footage** — joint error and live crank tracking ≥10 revolutions need a Mac + trainer.
3. **Worker is wired** — `WORKER_READY` after INIT. Detect on the cartoon fixture is not an accuracy claim; Ist on VM uses matching synthetic landmarks when MediaPipe returns nothing.
4. **Full vs Lite** — lab compare exists (`npm run pose:compare`, Gate-A **Labor · Lite vs Full**). VM file/synthetic clip keeps **Lite**. Not a Mac bake-off. See `MODEL_COMPARE_STATUS.md`.
5. **Pixel↔bike scale** — mm scale is optional until a known length is marked.
6. **Pedal marker** — ≥10-rev harness is synthetic ImageData. Live lock follows the magenta fixture marker. **LOST** is a first-class status.

Re-measure on a real Mac (Chrome, side view, brake hoods, fixed trainer) before calling Gate A done.
