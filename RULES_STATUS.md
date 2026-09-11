# RULES_STATUS — E6 Bewertung + Empfehlung

Status: **pipeline shipped, no productive Ampel.** Sample profiles are `provisional` / `nutzerziel` with `productionEnabled: false`.

## What landed

| Piece | Path | Notes |
| --- | --- | --- |
| Schema | `src/types/rules.ts`, `src/rules/schema.ts` | `id`, `status`, `metric`, `method`, `targetDeg`, `outsideMarginDeg`, `productionEnabled`, `sources`, `owner` |
| Profiles (JSON) | `src/rules/profiles/*.v1.json` | Versioned data. No magic numbers in UI. |
| Decision | `src/rules/decide.ts` | profile → valid measurement → enough cycles → compare with uncertainty |
| States | `within_target` \| `borderline` \| `outside_target` \| `unavailable` | Closed interval vs `[target ± outsideMargin]` |
| Ampel gate | `src/rules/display.ts` | Production lamps only if `productionEnabled: true` **and** explicit label |
| Copy | `src/rules/recommend.ts` | Plan §10.4: Beobachtung → mögliche Erklärung → Voraussetzung → nächster Schritt → erneut messen |
| Harness | `src/rules/harness.ts` | Deterministic; no LLM |

## Shipped profiles

| id | status | productionEnabled | targetDeg | outsideMarginDeg |
| --- | --- | --- | --- | --- |
| `knee-flexion-bdc.v1` | `provisional` | **false** | 32 | 7 |
| `knee-flexion-nutzerziel.v1` | `nutzerziel` | **false** | 30 | 5 |

Numbers are placeholders for plumbing. They are **not** fachlich freigegeben.

## Productive Ampel

Allowed only when **all** of these hold:

1. Profile `status === 'approved'`
2. `productionEnabled: true`
3. `reviewedAt` is set
4. UI shows the explicit label `Ampel (produktiv)`

Without Freigabe the UI is **gray** (`Bewertung nicht verfügbar`). The rail checkbox **UI plumbing: labeled provisional colors** may show green/yellow/red only with the label `Provisorische Bewertung — nicht fachlich freigegeben`.

## Recommendation rule

Copy is data on the profile. The engine never emits exact saddle millimetres (`Sattel exakt 17 mm` is rejected at parse and again after fill). Direction only: etwas höher / etwas tiefer, then erneut messen.

## Check

```bash
npm run check:rules
npm run build
```
