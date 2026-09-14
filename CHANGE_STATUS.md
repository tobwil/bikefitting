# CHANGE_STATUS — L3 Änderungs-/Vergleichsschleife

Status: **on this branch**. After AP-10 ActionDecision + L2 Ergebnis, beginners can document a seat-height change, recapture with the same camera preference, and compare like-for-like observations. Local only.

## BUILD_OK

`npm run build` plus:

- `npm run change:harness` — document A → capture B same method; incompatible setup/method is not „besser“; small delta → „Keine sichere Veränderung messbar“; R2 seat gate preserved
- `npm run result:harness` — AP-06 outcome card unchanged
- `npm run action:harness` — AP-10 R2 still green
- `npm run flow:harness` — includes `change:*` checks

## Loop

1. Ergebnis with `adjust` (released) or an optional **Änderung dokumentieren** path on `keep`/`review`. `retake` keeps „Neu aufnehmen“ — no forced adjust.
2. Form asks only seat higher/lower plus optional old/new notes. Then **Erneut aufnehmen und vergleichen** with the previous camera preference.
3. Compatible before/after uses the **same metric and method**. Delta inside the predeclared ±3° repeatability band → **Keine sichere Veränderung messbar**. Product copy never says „verbessert“.
4. Reaching a target band is labeled as not a comfort or injury claim.
5. The **new** result stores `changeLink`: previous result/capture/analysis ↔ documented change ↔ new capture/analysis, plus method/profile/setup/camera/lens flags. Camera or lens change is not a body improvement. Previous results stay immutable.

## Gates kept

- AP-10: `provisional` / `markerless_not_released` still yield no beginner seat tips.
- First released seat-height direction only when a released matching profile exists; otherwise honest review/keep.
- No millimetre guessing, no AP-07/08.

Visual QA: `/?change` shows the document form plus comparable / camera-mismatch / method-mismatch fixtures.
