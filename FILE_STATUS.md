# FILE_STATUS — local file / video replay

Status: **local file is a third capture source** (`camera` | `synthetic` | `file`) behind the same pose / calib / metrics contract.

## What shipped

- Local picker (video or still). Object URL only. **Default: no upload.**
- Video uses the **media clock** (`currentTime`), not wall time. Pause holds the same media timestamp — no extra frames.
- Seek / rewind / restart reset pedal unwrap, metrics aggregators, and in-flight capture cycles so a scrub cannot mint fake revolutions.
- Frame step is a small media seek (not a tracker reset).
- Crop + rotation are an explicit `SourceTransform`. Pose runs in the working frame; landmarks map back to original pixels. Overlay crop rect is original-space.
- Single images are a **static check** (`staticCheck: true`): no countdown, no multi-cycle measurement.
- Frozen result stores `source: "file"`, pixel size, media time range, transform, `upload: false`.
- Regression fixture: `src/file/fixture.ts` + `fixtures/file-replay/RIGHTS.md` (generated crank clip, no rider recording).

## Harness

`npm run file:harness` — classify, static guard, same-clip reproducibility, pause hold, seek reset vs fake cycles, point round-trip, result parse.

## Do not break

P1 detect worker / `imageGeneration`, grip pending, still-review pan/zoom (`viewTransform.ts`). Those paths are unchanged except `DetectSource` now allows `'file'`.

## Ampel / cloud

Unchanged. Productive Ampel still requires `productionEnabled`. No cloud coach, no accounts.
