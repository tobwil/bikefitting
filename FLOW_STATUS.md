# FLOW_STATUS — BikeFit Mac P0 / UI-Flow §3

Status: **wired on this branch**. Chrome/Mac local. No accounts. No upload.

## BUILD_OK

`npm run build` (`tsc -b && vite build`) and `npm run lint` (oxlint) succeeded on this branch. Remaining oxlint messages are React Fast Refresh / setState-in-effect warnings, including pre-existing ones in `FitSession.tsx`. No type errors.

## Screens

| # | Step | Route in UI | Implementation |
| --- | --- | --- | --- |
| 1 | Start | `data-flow-step="start"` | Neue Messung / Gespeicherte Messungen |
| 2 | Kamera einrichten | `camera` | Existing `src/camera` panel |
| 3 | Fahrrad kalibrieren B/S/G | `calibrate` | Existing `src/calibration` panel; stage click places marks |
| 4 | Körper / Pedalbezug | `body` | Three live checks + existing pedal panel |
| 5 | Messung | `measure` | Countdown, Ist + Soll slots, ≤3 metric cards, `N von M gültigen Umdrehungen` (M=10) |
| 6 | Ergebnis | `result` | Quality, metrics, prioritized recommendation, local JSON export, remeasure |

Gate A module rail remains under **Gate-A-Labor** (does not replace the product journey).

## Adapters (feature-detect)

`src/flow/adapters.ts` uses `import.meta.glob('../{sessions,metrics,rules,soll}/index.ts')`.

| Concern | Expected folder | If missing |
| --- | --- | --- |
| Sessions | `src/sessions` | `src/flow/stubs/sessions.ts` (`bikefit.sessions.v1`) |
| Metrics | `src/metrics` | `src/flow/stubs/metrics.ts` (knee / hip / torso from Ist) |
| Rules | `src/rules` | `src/flow/stubs/rules.ts` (priority list, marked STUB) |
| Soll | `src/soll` | `src/flow/stubs/soll.ts` (dashed ghost, **not** IK; never fills Ist) |

UI footer on Ergebnis shows `module` / `stub` / `mixed` per adapter.

## Ampel

Default profile `Labor / nicht freigegeben` has `productionEnabled: false`. Metric cards and quality stay **plain** (no traffic-light chrome). Productive Ampel only if `?profile=production`.

## Still

- Chrome on Mac, video-only camera after click
- No accounts, no cloud upload (export is a local JSON download)
- VM: Synthetic fixture + **Demo-Auswertung (Stub)** on the measure step
