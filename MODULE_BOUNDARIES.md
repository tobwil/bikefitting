# Parallel-agent file ownership

Integration owner (`main`): shared types, models path, docs, and **App/shell wiring**.

| Path | Who edits |
| --- | --- |
| `package.json`, `vite.config.ts`, `tsconfig*.json`, `index.html` | scaffold |
| `src/App.tsx`, `src/main.tsx`, `src/index.css`, `src/shell/**` | integration / UI-Flow (wiring) |
| `src/flow/**` | UI-Flow P0 (product journey) |
| `src/types/**`, `src/config/**` | scaffold (contract changes: discuss) |
| `README.md`, `TECH_DECISION.md`, `GATE_A.md`, `RULES_STATUS.md`, `public/models/**`, `scripts/**` | integration / scaffold |
| `src/camera/**` | camera module (keep public exports) |
| `src/pose/**` | pose module (keep public exports). Overlay 1€ lives here; metrics stay raw. Lite/Full compare stays here, not in calib. |
| `src/calibration/**` | calibration module (keep public exports) |
| `src/pedal/**` | pedal module (keep public exports) |
| `src/metrics/**` | metrics module (keep public exports) |
| `src/soll/**`, `src/types/soll.ts` | soll module (E5 `current_setup` only) |
| `src/rules/**` | rules / E6 (keep public exports) |
| `src/file/**` | local file/video replay (keep public exports) |
| `src/capture/**`, `src/types/capture.ts` | beginner live capture (MediaRecorder, Continuity setup, local clip store) |
| `src/analysis/**`, `src/types/analysis.ts` | AP-03 analysis job (decode/pose/segment) + AP-05 markerless `max_extension` (`measure()` adapter) |
| `src/scale/**`, `src/types/scale.ts` | user-defined plane scale (no wheel default, no saddle-mm) |
| `src/foot/**`, `src/types/foot.ts` | heel/toe cycle diagnosis (no new cards/recs) |
| `src/action/**`, `src/types/action.ts` | AP-10 ActionDecision (beginner seat gate; no URL unlock) |
| `src/change/**`, `src/types/change.ts` | L3 documented change + recapture compare (no AP-07/08, no mm) |
| `src/types/observation.ts`, `src/flow/outcome.ts`, `src/flow/analysisStub.ts`, `src/flow/observationFromAnalysis.ts`, `src/flow/components/OutcomeCard.tsx` | AP-06 Ergebnisvertrag (outcome card, observation from AP-03/AP-05 job, snapshot identity) |

Do not implement accounts, cloud upload, or P1 `adjustment_simulation`.

**Ampel:** only via `src/rules`. Productive traffic-light scoring requires `productionEnabled: true` (implies `status: approved` plus reviewer). P0 ships `provisional` / `nutzerziel` / `test_only` with `productionEnabled: false`. The UI-Flow default lab profile is locked.
