# FLOW_STATUS — BikeFit Mac P0 / UI-Flow §3 + Review P1–P3

Status: **wired on main + P1 measurement contracts + immutable Ergebnisdatensatz**. Chrome/Mac local. No accounts. No upload.

## BUILD_OK

`npm run build` (`tsc -b && vite build`) plus harnesses:

- `npm run metrics:harness`
- `npm run soll:harness`
- `npm run check:rules`
- `npm run sessions:harness`
- `npm run flow:harness`
- `npm run setup:harness` — camera remount / calibration binding / pose freshness (PR2)

## Journey

Start → Neue Messung → Kamera → B/S/G → Körper/Pedal → Messung → Ergebnis.

Adapters bind **real** E4–E7 modules (`src/flow/bind*.ts`):

| Concern | Module | Notes |
| --- | --- | --- |
| Metrics | `src/metrics` | Cards copy `method`, `unit`, `usableCycles` from `MetricResult`. Knee card is BDC, not cycle-mean. |
| Capture | `createMeasurementCapture` | `ready / countdown / recording / finished / aborted`. Countdown is real seconds. Aggregator opens empty after countdown. |
| Quality | `bindMetrics.quality` | Tracking quality ≠ per-metric quality. Missing required BDC knee → `Qualität unzureichend`, never „Qualität ausreichend“. |
| Rules | `src/rules` | `decideRule` gets BDC usable cycles, not pedal revs. Method mismatch / missing BDC → descriptive only. |
| Soll | `src/soll` | `current_setup` IK; FitSession draws the cyan ghost |
| Sessions | `src/sessions` | IndexedDB/localStorage + aligned flow sidecar; export carries `measurementId` + matching n |

## Ergebnisdatensatz (Auftrag 4)

On recording end `finish()` writes one immutable `MeasurementResult`:

time range · capture/evaluation/productRelease · profile · rule versions · calibration snapshot · method · metrics · quality · recommendations.

**Display / save / export / openSaved read only that object.** Live calibration after finish is ignored. Remeasure starts a new dataset (new id).

PR1 freeze: `consumeFrozenReport` uses `metrics.freeze()` / `metrics.frozen` when present, otherwise snapshots the capture report.

## Demo (Auftrag 9)

`provenance.evaluation` (`standard` | `demo`) is carried through UI, sidecar, session store, JSON, and Markdown. It is **not** quality and **not** product release (`p0`). Exported files are identifiable as demo without the browser (`demo: true`, `evaluation: "demo"`).

## Ampel

Default lab profile `productionEnabled: false`. Productive Ampel requires **both** `?profile=production` **and** a shipped rule profile with `productionEnabled: true`. P0 ships none — Ampel stays locked.

## Still

- Chrome on Mac, video-only camera after click
- No accounts, no cloud upload (export is a local JSON **and** Markdown download)
- VM: Synthetic fixture + **Demo-Auswertung** waits for live E4 cycles (not stub numbers)
- Storage write failures (Quota, IndexedDB) surface as `Speichern fehlgeschlagen…` on Start and Ergebnis
