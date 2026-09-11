# BikeFit Mac — P0

Local Chrome bike-fit on a Mac. One product journey, on this device only.

**Neue Messung → Kamera → Kalibrierung → Körper → Messung → Ergebnis.**

## What works

- **Ist + Soll** — live pose (gold) and a cyan `current_setup` ghost on the calibrated bike
- **Metrics** — sagittal knee / torso / elbow over valid crank cycles (numeric, or unavailable)
- **Provisional rules** — §10.4 recommendation copy (direction only). Ampel stays locked on shipped profiles
- **Sessions** — save locally (IndexedDB, localStorage fallback)
- **Export** — local JSON and Markdown download. No upload
- **Local file** — video replay with media timestamps, pause/seek (resets trackers), or a still as a static check. Default: no upload

## Out of scope

- **No productive Ampel** without `productionEnabled` **and** fachliche Freigabe. P0 ships none. `?profile=production` alone is not enough
- **No cloud, accounts, or upload** (video stays on the machine)
- **No adjustment simulation (P1)** — Soll is `current_setup` only; B/S/G are not moved
- **No exact millimetre saddle advice** — recommendations are directional, then remeasure

Default lab profile: `productionEnabled: false`. See `FLOW_STATUS.md` and `RULES_STATUS.md`.

## Run

```bash
npm install
npm run dev
```

- Dev server: **http://127.0.0.1:47321** (`DEV_PORT=47321`, `--strictPort`)
- Production build: `npm run build` then `npm run preview` (same port)
- MediaPipe models are already vendored under `public/models/**` (`npm run vendor:mediapipe` if you need to refresh)

Chrome on a Mac is the target. Camera permission is requested only after an explicit **Start** click. `getUserMedia` is **video-only** — the microphone stays off. Prefer a side view on a trainer, camera-near side, hoods.

On a VM without a camera, use **Synthetic**, then **Fixture B/S/G**. Safari is out of scope.

## Product journey

1. **Start** — **Mit Kamera messen**, **Datei öffnen**, oder **Demo ausprobieren**, plus gespeicherte Messungen (localStorage, no accounts).
2. **Kamera / Datei** — click-to-start camera (`audio: false`) or a local file. Status: „Kamera wird geöffnet“ / „Person erkannt“. Datei bleibt lokal.
3. **Fahrrad kalibrieren** — B → S → G on the stage, Standbild ohne Fahrer.
4. **Körper / Pedalbezug** — guided three-check capture; „Pedalmarker auswählen“.
5. **Messung** — countdown with audio start/end, Ist + aktuelles Setup, abort/retry, `N von M gültigen Umdrehungen`.
6. **Ergebnis** — quality, metrics, prioritized recommendation, local JSON + Markdown export, remeasure.

**No productive Ampel** unless the profile has `productionEnabled` (`?profile=production`). Default is lab. The flag lives under **Diagnose**, not in the main copy. See `FLOW_STATUS.md`.

Gate-A-Labor (footer on Start) still mounts the module rails in parallel. It is an escape hatch, not the product.

## Checks

`npm run build` plus `metrics:harness` / `soll:harness` / `check:rules` / `sessions:harness` / `flow:harness` / `file:harness` / `pose:compare`.
