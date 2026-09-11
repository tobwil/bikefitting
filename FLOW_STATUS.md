# FLOW_STATUS — BikeFit Mac P0 / UI-Flow §3 + Review P1–P4

Status: **wired on main + P1 measurement contracts + immutable Ergebnisdatensatz + PR4 Bedienung**. Chrome/Mac local. No accounts. No upload.

## BUILD_OK

`npm run build` (`tsc -b && vite build`) plus harnesses:

- `npm run metrics:harness`
- `npm run soll:harness`
- `npm run check:rules`
- `npm run sessions:harness`
- `npm run flow:harness`
- `npm run setup:harness` — camera remount / calibration binding / pose freshness (PR2)
- `npm run pose:harness` — INIT/session race, MISS ≠ timeout
- `npm run calib:harness` — auto B/S/G propose → confirm → apply (P2)
- `npm run file:harness` — local file source, media clock, seek reset, result provenance

## Journey

Start → three actions (**Mit Kamera messen** / **Datei öffnen** / **Demo ausprobieren**) with explanation → Kamera oder lokale Datei → B/S/G → Körper/Pedal → Messung → Ergebnis.

Adapters bind **real** E4–E7 modules (`src/flow/bind*.ts`):

| Concern | Module | Notes |
| --- | --- | --- |
| Metrics | `src/metrics` | Cards copy `method`, `unit`, `usableCycles` from `MetricResult`. Knee card is BDC, not cycle-mean. |
| Capture | `createMeasurementCapture` | `ready / countdown / recording / finished / aborted`. Countdown is real seconds. Aggregator opens empty after countdown. |
| Quality | `bindMetrics.quality` | Tracking quality ≠ per-metric quality. Missing required BDC knee → `Qualität unzureichend`, never „Qualität ausreichend“. |
| Rules | `src/rules` | `decideRule` gets BDC usable cycles, not pedal revs. Method mismatch / missing BDC → descriptive only. |
| Soll | `src/soll` | `current_setup` IK via `estimateBodyModel`; label is **Aktuelles Setup**, not ideal fit |
| Sessions | `src/sessions` | IndexedDB/localStorage + aligned flow sidecar; export carries `measurementId` + matching n |

## Ergebnisdatensatz (Auftrag 4)

On recording end `finish()` writes one immutable `MeasurementResult`:

time range · capture/evaluation/productRelease · profile · rule versions · calibration snapshot · method · metrics · quality · recommendations.

**Display / save / export / openSaved read only that object.** Live calibration after finish is ignored. Remeasure starts a new dataset (new id). `result.source` (`camera` | `synthetic` | `demo`) is frozen on the object. Session parse keeps calibration `binding`. `openSaved` restores the stored result + journey; it does not copy calibration into the live setup.

PR1 freeze: `consumeFrozenReport` uses `metrics.freeze()` / `metrics.frozen` when present, otherwise snapshots the capture report.

## Demo (Auftrag 9)

`provenance.evaluation` (`standard` | `demo`) and frozen `result.source` (`camera` | `synthetic` | `demo`) are carried through UI, sidecar, session store, JSON, and Markdown. They are **not** quality and **not** product release (`p0`). Exported files are identifiable as demo/synthetic without the browser (`demo: true`, `result.source`).

## PR4 Bedienung (UX)

1. Start explains the steps, then two clear actions. Demo starts an example capture without saying Synthetic/Fixture.
2. Narrow windows (~640×740): compact numbered step pills; **primary action + status sit above the preview**.
3. Status copy: „Kamera wird geöffnet“, „Person erkannt“, „Pedalmarker auswählen“, German camera errors with **Erneut versuchen**.
4. Production German. Worker / Adapter / STUB / Harness / `productionEnabled` / method codes (`bottom_dead_center`, `cycle_mean`) live under **Diagnose**. Product cards and quality notes use German only (am tiefsten Pedalpunkt / Mittelwert über den Tretzyklus).
5. Countdown audio start/end (Web Audio, no microphone). **Abbrechen** / **Erneut versuchen**. Step nav locked during a take.
6. Ghost label = estimated current setup. One flow-level ghost compute per pose/pedal/calibration tick.
7. Recording path: `createMeasurementCapture` caches the live report so `push` + extra `snapshot` calls materialize **once per frame** (was ~4× via `snapshot` + `push` internal `snapshot`).

## Ampel

Default lab profile `productionEnabled: false`. Productive Ampel requires **both** `?profile=production` **and** a shipped rule profile with `productionEnabled: true`. P0 ships none — Ampel stays locked. The flag is shown in Diagnose, not in the main copy.

## Still

- Chrome on Mac, video-only camera after click
- No accounts, no cloud upload (export is a local JSON **and** Markdown download)
- VM: Demo path + **Beispiel auswerten** waits for live E4 cycles (not stub numbers)
- Storage write failures (Quota, IndexedDB) surface as `Speichern fehlgeschlagen…` on Start and Ergebnis
