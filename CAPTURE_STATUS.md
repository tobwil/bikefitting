# CAPTURE_STATUS — AP-02 + AP-04-Basis (L1)

Status: **on this branch**. Beginner path: live setup + timed local recording on one screen. Expert B/S/G flow remains under „Erweiterte Messung“.

## BUILD_OK

`npm run build` plus:

- `npm run capture:harness` — state machine, Gespeichert contract, camera preference, framing copy
- `npm run capture:mounted` — Chrome MediaRecorder of a live canvas/camera stream → persist → playable `<video>`
- existing `flow:harness` / `pose:harness` / `setup:harness` (AP-01 geometry unchanged)

## Product path

1. Start: primary **BikeFit starten**. Secondary text: **Vorhandenes Video** / **Frühere Ergebnisse**. Demo and expert are not equal-weight entry.
2. After camera grant: large live preview. Last successful camera is preferred if still present. Switching a live capture to the Mac webcam needs confirmation.
3. No iPhone in the device list: illustrated Continuity help (near Mac, landscape, rear cam, Continuity on, USB tip). OS permissions stay user actions.
4. Setup + record on the same screen. One framing tip. **Verbunden** only when decoded frames are updating.
5. Primary **40 Sekunden aufnehmen** (10 s preroll, auto end, no microphone). Optional 20 s preroll. No markers, no „Messung starten“.
6. MediaRecorder of the camera stream (not stage screenshot). Pose drop does not stop the recorder. Missing camera / full disk block with concrete copy. Missing leg line: **Ausschnitt korrigieren** / **Trotzdem aufnehmen**.
7. **Gespeichert** only after persist + decode + complete duration. Incomplete clips are never labeled complete.

## Out of this slice

AP-01 R3 geometry, AP-10 decisions, AP-11 starter, full AP-03 offline analysis.
