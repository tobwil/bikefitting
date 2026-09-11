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
| `src/pose/**` | pose module (keep public exports) |
| `src/calibration/**` | calibration module (keep public exports) |
| `src/pedal/**` | pedal module (keep public exports) |
| `src/metrics/**` | metrics module (keep public exports) |
| `src/soll/**`, `src/types/soll.ts` | soll module (E5 `current_setup` only) |
| `src/rules/**` | rules / E6 (keep public exports) |
| `src/sessions/**` | sessions module (keep public exports) |

Do not implement accounts, cloud upload, or P1 `adjustment_simulation`.

**Ampel:** only via `src/rules`. Productive traffic-light scoring requires `productionEnabled: true` (implies `status: approved` plus reviewer). P0 ships `provisional` / `nutzerziel` / `test_only` with `productionEnabled: false`. The UI-Flow default lab profile is locked.
