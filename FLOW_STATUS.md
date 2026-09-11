# FLOW_STATUS — BikeFit Mac P0 / UI-Flow §3

Status: **wired on main**. Chrome/Mac local. No accounts. No upload.

## BUILD_OK

`npm run build` (`tsc -b && vite build`) plus harnesses:

- `npm run metrics:harness`
- `npm run soll:harness`
- `npm run check:rules`
- `npm run sessions:harness`
- `npm run flow:harness`

## Journey

Start → Neue Messung → Kamera → B/S/G → Körper/Pedal → Messung → Ergebnis.

Adapters bind **real** E4–E7 modules (`src/flow/bind*.ts`):

| Concern | Module | Notes |
| --- | --- | --- |
| Metrics | `src/metrics` | Cards from `MetricsReport` (median over valid cycles) |
| Rules | `src/rules` | `decideRule` + `recommendRule` §10.4, no exact mm |
| Soll | `src/soll` | `current_setup` IK; FitSession draws the cyan ghost |
| Sessions | `src/sessions` | IndexedDB/localStorage + flow sidecar |

## Ampel

Default lab profile `productionEnabled: false`. Productive Ampel requires **both** `?profile=production` **and** a shipped rule profile with `productionEnabled: true`. P0 ships none — Ampel stays locked.

## Still

- Chrome on Mac, video-only camera after click
- No accounts, no cloud upload (export is a local JSON download)
- VM: Synthetic fixture + **Demo-Auswertung** on the measure step
