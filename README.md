# BikeFit Mac — E0 / Gate A

Local Chrome-first bike-fit tech spike for macOS. Live Ist-skeleton later, manual bike calibration, pedal-marker prototype. **No cloud analysis, no accounts, no Ampel / traffic-light scoring in E0.**

This commit is the **scaffold + integration shell**. Camera, pose worker, calibration, and pedal tracking are reserved folders with thin stubs for parallel agents.

## Run

```bash
npm install
npm run vendor:mediapipe
npm run dev
```

- Dev server: **http://127.0.0.1:47321** (`DEV_PORT=47321`, strict)
- Production build: `npm run build` then `npm run preview` (same port)

Reproducible install: `npm install && npm run build` after models are vendored.

## Chrome on Mac

1. Use current Google Chrome (Chromium-based). Safari is out of scope for E0.
2. Camera permission is requested **only after** an explicit Start click.
3. `getUserMedia` must be **video-only** (`audio: false`). The microphone stays off.
4. If Chrome denied the camera: lock icon in the address bar → Site settings → Camera → Allow, then Restart in the app (AC-01 / AC-02 / AC-19).
5. Prefer a side view of a rider on a fixed trainer, camera-near side, road/gravel at the hoods (MVP scenario — not required for this scaffold).

On cloud agent VMs there is typically **no camera**. Use the future synthetic fixture (dev-only). Do not treat that fixture as a production test profile.

## Where models live

| Asset | Path | Pin |
| --- | --- | --- |
| Pose Landmarker Lite (default) | `public/models/pose_landmarker_lite.task` | `float16/1` |
| Pose Landmarker Full | `public/models/pose_landmarker_full.task` | `float16/1` |
| MediaPipe WASM | `public/models/wasm/` | `@mediapipe/tasks-vision@0.10.35` |

Runtime URLs are `/models/...`. **Never fetch `@latest`.** Hashes and source URLs: `public/models/MANIFEST.md` (filled by `npm run vendor:mediapipe`).

## Module boundaries (parallel PRs)

| Folder | Owner | Do not implement from scaffold |
| --- | --- | --- |
| `src/types/**`, `src/config/**`, `src/shell/**`, `src/App.tsx` | integration / scaffold | — |
| `src/camera/**` | camera UI | permission, devices, deny/stop/restart |
| `src/pose/**` | pose worker + Ist overlay | MediaPipe VIDEO worker, frame sync |
| `src/calibration/**` | B/S/G + pixel↔bike + knee number | transform, persistence, flexion |
| `src/pedal/**` | pedal marker | lock, phase, visible lost |

Public exports are listed in each folder’s `MODULE.md`. Keep `index.ts` export names stable. Prefer adding files inside the folder over editing `src/App.tsx` or `src/types/**`.

## Out of scope (E0)

- Ampel / traffic-light scoring and approved test profiles
- Soll IK solver (optional dashed cyan stub may be off-by-default later)
- Accounts, cloud upload, video upload, PDF export
- Inventing missing Ist landmarks from an ideal pose
