# BikeFit Mac — P0

Local Chrome bike-fit on a Mac. One product journey, on this device only.

**Neue Messung → Kamera → Kalibrierung → Körper → Messung → Ergebnis.**

Beginner L1 (this branch): **BikeFit starten → Einrichten + 40 s aufnehmen → Gespeichert.** Expert calibration remains under **Erweiterte Messung**. See `CAPTURE_STATUS.md`.

## Next delivery: usable without expert help

The September 14 self-test did not complete successfully without assistance. The current release is not yet approved for unattended beginner use. Camera/pose timestamp recovery guards, ankle visibility checks, and capability-based camera zoom support have been added; they do not replace a simpler product journey.

- [Maßnahmenplan: Einrichten → Aufnehmen → Auswerten](docs/AMATEUR_MVP_PLAN_2026-09-14.md)
- [Development packages AP-00–AP-09, dependencies and acceptance criteria](docs/ENTWICKLUNGSPAKETE_2026-09-14.md)

The proposed recording-first flow, marker-free observation method, and optional Luna explanation are planned work, not shipped functionality. The local-only behavior below still describes the running product.

## What works

- **Ist + Soll** — live pose (gold) and a cyan `current_setup` ghost on the calibrated bike
- **Metrics** — sagittal knee / torso / elbow over valid crank cycles (numeric, or unavailable)
- **Provisional rules** — §10.4 recommendation copy (direction only). Ampel stays locked on shipped profiles
- **Sessions** — save locally (IndexedDB, localStorage fallback)
- **Export** — local JSON and Markdown download. No upload
- **Plane scale** — user-measured reference + independent check. No wheel-diameter default. No “Sattel genau x mm”
- **Foot diagnosis** — heel + toe overlay over the cycle. Occlusion locks that metric. No new cards or recs yet
- **Local file** — video replay with media timestamps, pause/seek (resets trackers), or a still as a static check. Default: no upload

## Out of scope

- **No productive Ampel** without `productionEnabled` **and** fachliche Freigabe. P0 ships none. `?profile=production` alone is not enough
- **No cloud, accounts, or upload** (video stays on the machine)
- **No adjustment simulation (P1)** — Soll is `current_setup` only; B/S/G are not moved
- **No exact millimetre saddle advice** — recommendations are directional, then remeasure. Plane scale is user-measured and independently checked; it does not unlock “Sattel genau x mm”

Default lab profile: `productionEnabled: false`. See `FLOW_STATUS.md` and `RULES_STATUS.md`.

## Run

Testers: double-click **BikeFit starten** after the one-time setup in [docs/TESTER.md](docs/TESTER.md). No terminal or port on each run. Always **http://127.0.0.1:47321** (never `localhost`).

```bash
npm run setup:local    # once: install, build, Desktop starter
npm run start:local    # later / after reboot; reuses a running BikeFit server
```

Developers:

```bash
npm install
npm run dev
```

- Local origin is **http://127.0.0.1:47321** (`DEV_PORT=47321`, `--strictPort`, host `127.0.0.1`). The app redirects `localhost` to that origin so saved sessions stay findable.
- If something else already owns the port, the starter says so and does not kill it.
- Production build: `npm run build` then `npm run preview` (same origin)
- MediaPipe models are already vendored under `public/models/**` (`npm run vendor:mediapipe` if you need to refresh)

Chrome on a Mac is the target. Camera permission is requested only after an explicit **Start** click. `getUserMedia` is **video-only** — the microphone stays off. Prefer a side view on a trainer, camera-near side, hoods.

On a VM without a camera, use **Synthetic**, then **Fixture B/S/G**. Safari is out of scope.

## Product journey

1. **Start** — **BikeFit starten** (primary), **Vorhandenes Video** / **Frühere Ergebnisse**, or **Erweiterte Messung** / Demo (not equal-weight).
2. **Einrichten + Aufnahme** — live preview, Continuity help if no iPhone, **40 Sekunden aufnehmen**. Saved clip is local; **Gespeichert** after decode.
3. Expert: **Kamera / Datei** — click-to-start camera (`audio: false`) or a local file. Status: „Kamera wird geöffnet“ / „Person erkannt“. Datei bleibt lokal.
3. **Fahrrad kalibrieren** — B → S → G on the stage, Standbild ohne Fahrer.
4. **Körper / Pedalbezug** — guided three-check capture; „Pedalmarker auswählen“.
5. **Messung** — countdown with audio start/end, Ist + aktuelles Setup, abort/retry, `N von M gültigen Umdrehungen`.
6. **Ergebnis** — quality, metrics, prioritized recommendation, local JSON + Markdown export, remeasure.

**No productive Ampel** unless the profile has `productionEnabled` (`?profile=production`). Default is lab. The flag lives under **Diagnose**, not in the main copy. See `FLOW_STATUS.md`.

Gate-A-Labor (footer on Start) still mounts the module rails in parallel. It is an escape hatch, not the product.

## Checks

`npm run build` plus `metrics:harness` / `soll:harness` / `check:rules` / `sessions:harness` / `flow:harness` / `file:harness` / `pose:harness` / `pose:compare` / `scale:harness`.

Lab-only **1€-Overlay** compare (Diagnose or `?overlayFilter=1`) uses the Casiez TypeScript filter (BSD). It does not change metrics. See `POSE_STATUS.md`.

Lab **Lite vs Full** compare (`npm run pose:compare`, Gate-A **Labor · Lite vs Full**) does not change the product Lite default and does not add YOLO.
