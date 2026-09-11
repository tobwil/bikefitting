# Parallel-agent file ownership

Integration owner (this agent, `main`): scaffold, shared types, wiring, models path, docs.

| Path | Who edits |
| --- | --- |
| `package.json`, `vite.config.ts`, `tsconfig*.json`, `index.html` | scaffold |
| `src/App.tsx`, `src/main.tsx`, `src/index.css`, `src/shell/**` | scaffold |
| `src/types/**`, `src/config/**` | scaffold (contract changes: discuss) |
| `README.md`, `TECH_DECISION.md`, `public/models/**`, `scripts/**` | scaffold |
| `src/camera/**` | camera agent |
| `src/pose/**` | pose agent |
| `src/calibration/**` | calibration agent |
| `src/pedal/**` | pedal agent |

Do not implement Ampel, accounts, cloud upload, or Soll IK in any strand.
