# ANALYSIS_STATUS — AP-03 L2 (Auto-Analyse-Auftrag)

Status: **on this branch**. After a confirmed local **Gespeichert** clip, a local analysis job starts by itself. No extra „Analysieren“ click on the beginner path.

## BUILD_OK

`npm run build` plus:

- `npm run analysis:harness` — job lifecycle `queued → decoding → pose → selecting_segment → measuring → done`, fail → retry **same bytes**, duplicate-seek drop, auto-segment, AP-05 adapter contract
- existing `capture:harness` (L1 store unchanged)

## Product path

1. Complete save (persist + decode + duration) still comes from L1 capture store.
2. UI: **Aufnahme wird ausgewertet**, clip preview, progress from **posed/planned frames** (not a clock).
3. Failure: **Analyse erneut versuchen** reuses `captureId` + `contentHash` from the store. Camera is not dumped to empty idle.
4. Mount / dismount / stillstand are split from a contiguous pedaling span. No mandatory manual trim.
5. Incomplete clips are not auto-enqueued.

## Latency targets (instrumented, not claimed)

| Gate | Target |
| --- | --- |
| Median (standard 40 s clip) | ≤ 60 s |
| p95 | ≤ 120 s |
| Hardware | Mac named in AP-09 |

This package records `elapsedMs` per job. It does **not** publish median/p95. No simulated progress. No fabricated Mac numbers.

## Decoder

HTMLVideo seek fallback. Delivered `currentTime` is checked; duplicates are dropped. `frameAccurate: false` — the browser is not claimed to be frame-accurate. Target sampling 30 fps; a 40 s clip is fully planned (~1201 times) and is **not** silently cut to live metrics `maxFrames: 900`.

## AP-05 interface (merge point)

AP-03 owns decode / pose / segment. AP-05 owns markerless numbers.

```ts
// src/analysis/metricsAdapter.ts
measure(request: AnalysisMetricsRequest): Promise<AnalysisMetricsResponse>
```

`AnalysisMetricsRequest` carries `jobId`, `captureId`, `inputHash`, selected span, excluded spans, and compact pose samples **inside the selected span only**.

Default adapter `ap05.pending` returns `status: 'not_implemented'`, `observation: null`. Register a real adapter with `createAnalysisController({ metrics })`.

Do not require pedal markers or B/S/G. Do not emit ActionDecision `adjust` (AP-10 release gate).

## Out of this slice

AP-06 result screen, AP-07/08, AP-11 starter, released ActionDecision `adjust`, markerless `max_extension.p10.v1` numbers (AP-05).
