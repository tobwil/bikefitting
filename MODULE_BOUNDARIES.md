# Parallel-agent file ownership

Integration owner (`main`): shared types, models path, docs, and **App/shell wiring**.

| Path | Who edits |
| --- | --- |
| `package.json`, `vite.config.ts`, `tsconfig*.json`, `index.html` | scaffold |
| `src/App.tsx`, `src/main.tsx`, `src/index.css`, `src/shell/**` | integration (wiring) |
| `src/types/**`, `src/config/**` | scaffold (contract changes: discuss) |
| `README.md`, `TECH_DECISION.md`, `GATE_A.md`, `public/models/**`, `scripts/**` | integration / scaffold |
| `src/camera/**` | camera module (keep public exports) |
| `src/pose/**` | pose module (keep public exports) |
| `src/calibration/**` | calibration module (keep public exports) |
| `src/pedal/**` | pedal module (keep public exports) |

Do not implement Ampel, accounts, cloud upload, or Soll IK in any strand.
