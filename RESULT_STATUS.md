# RESULT_STATUS — AP-06 Ergebnisvertrag

Status: **on this branch**. After analysis, one outcome card wired to ActionDecision (AP-10). JSON / Diagnose / expert under Details.

## BUILD_OK

`npm run build` plus:

- `npm run result:harness` — stub/failed/incomplete, AP-05 payload shape, snapshot identity, R2 seat gate preserved
- `npm run flow:harness` — includes `result:*` checks
- `npm run action:harness` — AP-10 unchanged (provisional BDC 50° still no beginner seat)

## Outcome card

| kind | Primary action |
| --- | --- |
| adjust | Lokal speichern (Vorher-Stand) |
| keep | Lokal speichern |
| retake | Neu aufnehmen (neues Asset) |
| review | Gespeichertes Video erneut auswerten (gleicher Clip, neue analysisId) |

Secondary **Warum?** always: metrics, method, evidence refs, limits. No millimetre guessing.

## Honest analysis

If AP-05 is not merged, a stub observation (`stub: true`, `status: incomplete|retake|failed`) is accepted. It never reports a usable knee value and never emits `kind: adjust`. Incomplete capture → retake with a concrete reason. Failed analysis → review + reanalyze, clip kept.

Immutable snapshot fields: `captureId`, `analysisId`, `method`, `ActionDecision`, evidence refs. Same object is saved/exported. v1 files without observation stay readable.

Visual QA: `/?outcome` shows the four outcome-card fixtures (stub, incomplete, failed, AP-05 payload).

## Out of this slice

MediaRecorder (already L1), AP-11 starter, AP-05 numeric method, AP-03 decoder.
