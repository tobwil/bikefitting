# Sessions — E7 status

Local structured measurement sessions. **No Ampel / traffic-light scoring. No video or cloud upload.**

Dev server: `npm run dev` → **http://127.0.0.1:47321**.

## Store

| Backend | When |
| --- | --- |
| IndexedDB db `bikefit-sessions`, store `sessions` | Preferred |
| localStorage key `bikefit.sessions.v1` | Fallback if IndexedDB is missing or unusable |
| Flow sidecar `bikefit.flow-sessions.v1` | Full `MeasurementResult` mirror for the product journey |
| In-memory | Last resort (this tab only). Export JSON to keep a copy. |

Schema version: **2** (`SESSION_SCHEMA_VERSION`). v1 rows still parse and migrate in memory (`result: null`). Each record stores bike, camera-near side, hand position, calibration version, numeric metrics, quality descriptors, timestamps, schema version, and optional immutable `result` (including frozen crank-phase stills when present).

## Migration / align (PR3)

The product journey used to keep a **sidecar** (`bikefit.flow-sessions.v1`) that could shadow the E7 backend. `alignSessionStores` now **merges** both on list:

1. Load backend rows (v1 → v2, `result` null if the lab panel saved them).
2. Load sidecar rows (legacy flat `SavedSession` hydrates into a full result).
3. Same id → keep the richer / newer row.
4. Write-back the merged set to the backend (source of truth) and rewrite the sidecar as a full-result mirror.
5. Write failures are **shown in the UI** (`Speichern fehlgeschlagen…`) — Datenhaltung from the Bedienung table.

`openSaved` loads the stored `result` (including `source` and calibration `binding`). Resave / export do not pick up the live calibration.

## VM checklist

| Check | VM result | How |
| --- | --- | --- |
| Save session | Pass | Rail → Sessions → bike / side / hands → **Save session**. |
| Before/after same conditions | Pass | Two saves with the same bike/side/hands/calibration → Before + After → comparable, numeric Δ only. |
| Restricted comparison | Pass | Change bike or hand position on the second save → banner **Comparison restricted**. |
| Export Markdown + JSON | Pass | **Export JSON** / **Export MD** / **Export all JSON** are local downloads. No video payload. Demo rows say **Demo-Auswertung**. |
| Import schema validation | Pass | Valid envelope imports. v1 envelopes migrate. Corrupt JSON / wrong schema / NaN metrics rejected. |
| Delete / clear all | Pass | **Delete** removes one row. **Clear all** wipes the store (confirm). |
| Sessions harness | Pass | **Sessions harness** in the rail, or `npm run sessions:harness`. |
| Ampel | Out of scope | Quality is descriptive (visibility, engine, frame sync, pedal status). No green/yellow/red. |

## Files

- `src/types/session.ts` — contract (v2 + `result`)
- `src/types/result.ts` — immutable `MeasurementResult`
- `src/sessions/**` — schema, IndexedDB/localStorage, compare, export/import, panel, harness
- `src/flow/sessionAlign.ts` — sidecar ↔ backend merge

## Out of scope

- Ampel / approved test profiles / Soll IK
- Accounts, cloud, video upload, PDF
