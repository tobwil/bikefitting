# BikeFit Mac — E0 / Gate A + E5 Soll P0

Local Chrome-first bike-fit tech spike for macOS. Live Ist skeleton, manual bike calibration, pedal-marker prototype. **No cloud analysis, no accounts, no Ampel / traffic-light scoring in E0.**

## Run

```bash
npm install
npm run vendor:mediapipe   # already vendored on main under public/models/**
npm run dev
```

- Dev server: **http://127.0.0.1:47321** (`DEV_PORT=47321`, strict)
- Production build: `npm run build` then `npm run preview` (same port)

## Flow (P0)

Product journey in `src/flow/**`, wired through `App.tsx` / `src/shell/**`. Existing camera, pose, calibration, and pedal modules stay mounted inside the steps. Gate A labor rail: Start → **Gate-A-Labor**.

1. **Start** — Neue Messung / Gespeicherte Messungen (localStorage, no accounts).
2. **Kamera einrichten** — existing `CameraPanel` (click-to-start, `audio: false`; VM: Synthetic).
3. **Fahrrad kalibrieren** — existing B/S/G `CalibrationPanel`.
4. **Körper / Pedalbezug** — guided three-check capture (side line, hip/knee, pedal marker).
5. **Messung** — countdown, Ist + Soll slots, up to 3 metric cards, cycle progress `N von M gültigen Umdrehungen`.
6. **Ergebnis** — quality, metrics, prioritized recommendation, local JSON export, remeasure.

**No productive Ampel** unless the profile has `productionEnabled` (`?profile=production`). Default is lab. See `FLOW_STATUS.md`.

### Gate A modules (labor)

1. **Camera** — Start / Stop / Restart. On a VM, use **Synthetic**.
2. **Pose** — Worker inits MediaPipe Pose Landmarker (VIDEO). Rail shows `WORKER_READY`.
3. **Calibration** — click the stage to place B / S / G. Save / Load uses `localStorage` key `bikefit.calibration.v1`.
4. **Pedal** — magenta marker lock, angle / phase / revolutions. **≥10 rev harness** is synthetic and VM-safe. **LOST** is visible.
5. **Metrics (E4)** — sagittal knee / trunk / elbow over valid crank cycles. See `METRICS_STATUS.md`.
6. **Soll (E5)** — dashed cyan ghost on the current B/S/G setup. See `SOLL_STATUS.md`. Use **Synthetic phase** on a VM.
7. **Rules (E6)** — versioned JSON profiles in `src/rules/profiles`. Decision states: `within_target` / `borderline` / `outside_target` / `unavailable`. **No productive Ampel** until a profile has `productionEnabled: true`. See `RULES_STATUS.md`.
8. **Sessions (E7)** — local IndexedDB (localStorage fallback). Save, compare, import/export Markdown+JSON. See `SESSIONS_STATUS.md`.

## Chrome on Mac

1. Use current Google Chrome. Safari is out of scope for E0.
2. Camera permission is requested **only after** an explicit Start click.
3. `getUserMedia` is **video-only**. The microphone stays off.
4. If Chrome denied the camera: lock icon → Site settings → Camera → Allow, then Restart.
5. Prefer a side view of a rider on a fixed trainer, camera-near side, hoods.

See `GATE_A.md` for the VM checklist and what still needs a real Mac.

## Where models live

| Asset | Path | Pin |
| --- | --- | --- |
| Pose Landmarker Lite (default) | `public/models/pose_landmarker_lite.task` | `float16/1` |
| Pose Landmarker Full | `public/models/pose_landmarker_full.task` | `float16/1` |
| MediaPipe WASM | `public/models/wasm/` | `@mediapipe/tasks-vision@0.10.35` |

Runtime URLs are `/models/...`. **Never fetch `@latest`.**

## Out of scope (E0 / E5 P0 / E6)

- Approved / production Ampel (E6 ships provisional profiles only — see `RULES_STATUS.md`)
- P1 `adjustment_simulation` (moving S/G). E5 P0 is `current_setup` only — see `SOLL_STATUS.md`
- Accounts, cloud upload, video upload, PDF export
- Inventing missing Ist landmarks from an ideal pose
