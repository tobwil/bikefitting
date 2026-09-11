# FLOW_STATUS — BikeFit Mac P0 / UI-Flow §3

Status: **wired on main**, plus **PR4 Bedienung** (UX only). Chrome/Mac local. No accounts. No upload.

## BUILD_OK

`npm run build` (`tsc -b && vite build`) plus harnesses:

- `npm run metrics:harness`
- `npm run soll:harness`
- `npm run check:rules`
- `npm run sessions:harness`
- `npm run flow:harness`

## Journey

Start → two actions (**Mit Kamera messen** / **Demo ausprobieren**) with explanation → Kamera → B/S/G → Körper/Pedal → Messung → Ergebnis.

Adapters bind **real** E4–E7 modules (`src/flow/bind*.ts`):

| Concern | Module | Notes |
| --- | --- | --- |
| Metrics | `src/metrics` | Cards from `MetricsReport` (median over valid cycles) |
| Rules | `src/rules` | `decideRule` + `recommendRule` §10.4, no exact mm |
| Soll | `src/soll` | `current_setup` IK via `estimateBodyModel`; label is **Aktuelles Setup**, not ideal fit |
| Sessions | `src/sessions` | IndexedDB/localStorage + flow sidecar |

## PR4 Bedienung (UX)

1. Start explains the steps, then two clear actions. Demo starts an example capture without saying Synthetic/Fixture.
2. Narrow windows (~640×740): compact numbered step pills; **primary action + status sit above the preview**.
3. Status copy: „Kamera wird geöffnet“, „Person erkannt“, „Pedalmarker auswählen“, German camera errors with **Erneut versuchen**.
4. Production German. Worker / Adapter / STUB / Harness / `productionEnabled` live under **Diagnose**.
5. Countdown audio start/end (Web Audio, no microphone). **Abbrechen** / **Erneut versuchen**.
6. Ghost label = estimated current setup. One flow-level ghost compute per pose/pedal/calibration tick. Runtime loop optimization deferred.

Not in this PR: Messdaten contracts, video remount/marker seed, MeasurementResult schema.

## Ampel

Default lab profile `productionEnabled: false`. Productive Ampel requires **both** `?profile=production` **and** a shipped rule profile with `productionEnabled: true`. P0 ships none — Ampel stays locked. The flag is shown in Diagnose, not in the main copy.

## Still

- Chrome on Mac, video-only camera after click
- No accounts, no cloud upload (export is a local JSON **and** Markdown download)
- VM: Demo path + **Beispiel auswerten** waits for live E4 cycles (not stub numbers)
