# File-replay fixture — rights / consent

This folder documents the regression fixture for local file replay (`src/file/fixture.ts`).

## What it is

`bikefit.file-replay.synthetic-crank.v1` is a **generated** crank-phase clip: synthetic pose landmarks + synthetic pedal marker, 1280×720, 30 fps, 80 rpm. It is produced in-process by the file harness. It is **not** a recording of a person, bike, or third-party session.

## Rights

- Copyright: BikeFit Mac project (this repository).
- No rider likeness. No third-party footage.
- Consent: not applicable (no human subject).
- License of this fixture: same as the repository.

## What it is not

Do **not** add clips from NintAi, williamsaether/BikeFit, commercial fit studios, or any rider video whose rights are unclear. If a real side-view clip is added later, put a named consent note here (who recorded, who appears, permission to store a short excerpt) before the bytes land in git.

## Default product rule

Local file import in the app does **not** upload. Object URLs stay in the browser. Results store filename, pixel size, and media time range — never the media bytes.
