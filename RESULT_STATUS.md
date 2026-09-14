# RESULT_STATUS — AP-06 Ergebnisvertrag

Status: **on this branch**. After AP-03 analysis, one outcome card wired to ActionDecision (AP-10). JSON / Diagnose / expert under Details.

## BUILD_OK

`npm run build` plus:

- `npm run result:harness` — stub/failed/incomplete, AP-05 payload, wired `max_extension` job → observation, snapshot identity, R2 seat gate preserved
- `npm run flow:harness` — includes `result:*` checks
- `npm run action:harness` — AP-10 unchanged (provisional BDC 50° still no beginner seat)
- `npm run analysis:harness` — job + markerless method

## Outcome card

| kind | Primary action |
| --- | --- |
| adjust | Lokal speichern (Vorher-Stand) |
| keep | Lokal speichern |
| retake | Neu aufnehmen (neues Asset) |
| review | Gespeichertes Video erneut auswerten (gleicher Clip, neue analysisId) |

Secondary **Warum?** always: metrics, method, evidence refs, limits. No millimetre guessing.

Optional L3 path: **Änderung dokumentieren** (not forced on keep/review/retake). See `CHANGE_STATUS.md`.

## Honest analysis

Complete clips wait for the AP-03 job. `measure()` is AP-05 `max_extension.p10.v1`. The mapper (`observationFromAnalysisJob`) never invents BDC or a seat tip. Usable markerless values still render as ActionDecision `review` + `markerless_not_released` until a released profile exists.

Incomplete capture → stub `retake` with a concrete reason. Failed analysis → `failed` / `review` + reanalyze, clip kept. Stub path remains for incomplete clips only (`stub: true`).

Immutable snapshot fields: `captureId`, `analysisId`, `method`, `ActionDecision`, evidence refs. Same object is saved/exported. v1 files without observation stay readable.

Visual QA: `/?outcome` shows the four outcome-card fixtures (stub, incomplete, failed, AP-05 payload).

## Out of this slice

AP-07/08, released ActionDecision `adjust` for `max_extension`, AP-09 accuracy.
