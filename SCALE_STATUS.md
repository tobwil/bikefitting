# SCALE_STATUS — Product F (P3)

Status: **this branch**. User-defined plane scale + heel/toe cycle diagnosis. Later stages stay later.

P2 stabilize (finding 8): stored scale is bound to source identity, original dimensions, and image/setup generation. Load verifies the match. Source change clears the active scale (history refs stay unconfirmed). Identical resolution is not the same image plane. Product mm advice stays off.

Verified: `npm run build` **BUILD_OK**; `scale:harness` 33 (incl. binding/reload); `pose:compare` 23 (incl. pixel identity); flow 71; sessions 30; pose 8.

## BUILD_OK

`npm run build` plus:

- `npm run scale:harness` — no wheel default, independent-length check, S/G ≠ stack/reach, occlusion lock, no length advice without confirmed scale, freeze on result, source binding / reload mismatch, no product mm advice
- existing `flow` / `sessions` / `metrics` / `calib` / `pose` / `file` / `phase` / `soll` / `rules` / `setup` harnesses

## Scale

User-measured reference in the **sagittal image plane**. Stored: unit, points, perspective, uncertainty, independent check, and a **source binding** (`source` + `sourceId` + original WxH + `setupId` + generation). Unbound or mismatched storage is not a current length calibration.

- **No default wheel diameter** (no 62.2 cm / ISO 622).
- Confirm only after a **second known length** in the same plane.
- `transform.pixelsPerMm` stays `null` — image distances are not “saddle exactly x mm”.
- Frame **stack/reach** need their own refs. Existing S/G are bike marks, not those quantities.
- Product mm advice stays off (`productLengthAdvice: false`) even after a checked scale.

## Foot

Heel + toe tip (existing `HEEL` / `FOOT_INDEX` landmarks) as extra diagnosis over the cycle.

- New engine not required.
- Occlusion of heel or toe **locks that foot metric**.
- Without confirmed scale, length claims stay off.
- **No metric cards / recommendations** in this stage.

## Acceptance

| Check | Result |
| --- | --- |
| Independent known length | pass → `checked`; fail → `failed_check` |
| Heel or toe occluded | foot `occluded`, metric locked |
| No confirmed scale | no length advice |
| Ampel | still lab-locked unless `productionEnabled` |

## Limits

- Local only. No cloud, no accounts, no upload.
- No millimetre product promises.
- VM has no real rider clip; harness uses the synthetic fixture landmarks.
- Stack/reach refs can be stored but do not unlock a general length scale.
- Lite distal landmarks (heel/toe) are often weak on a real Mac — re-measure before any card.
