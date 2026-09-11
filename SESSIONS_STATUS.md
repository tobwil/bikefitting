# Sessions — E7 status

Local structured measurement sessions. **No Ampel / traffic-light scoring. No video or cloud upload.**

Dev server: `npm run dev` → **http://127.0.0.1:47321**.

## Store

| Backend | When |
| --- | --- |
| IndexedDB db `bikefit-sessions`, store `sessions` | Preferred |
| localStorage key `bikefit.sessions.v1` | Fallback if IndexedDB is missing or unusable |
| In-memory | Last resort (this tab only). Export JSON to keep a copy. |

Schema version: **1** (`SESSION_SCHEMA_VERSION`). Each record stores bike, camera-near side, hand position, calibration version, numeric metrics, quality descriptors, timestamps, and schema version.

## VM checklist

| Check | VM result | How |
| --- | --- | --- |
| Save session | Pass | Rail → Sessions → bike / side / hands → **Save session**. |
| Before/after same conditions | Pass | Two saves with the same bike/side/hands/calibration → Before + After → comparable, numeric Δ only. |
| Restricted comparison | Pass | Change bike or hand position on the second save → banner **Comparison restricted**. |
| Export Markdown + JSON | Pass | **Export JSON** / **Export MD** / **Export all JSON** are local downloads. No video payload. |
| Import schema validation | Pass | Valid envelope imports. Corrupt JSON / wrong schema / NaN metrics rejected. |
| Delete / clear all | Pass | **Delete** removes one row. **Clear all** wipes the store (confirm). |
| Sessions harness | Pass | **Sessions harness** in the rail, or `npm run sessions:harness`. |
| Ampel | Out of scope | Quality is descriptive (visibility, engine, frame sync, pedal status). No green/yellow/red. |

## Files

- `src/types/session.ts` — contract
- `src/sessions/**` — schema, IndexedDB/localStorage, compare, export/import, panel, harness

## Out of scope

- Ampel / approved test profiles / Soll IK
- Accounts, cloud, video upload, PDF
