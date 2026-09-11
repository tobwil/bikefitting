# CAMERA_SETUP_STATUS — Review PR2 (Aufträge 3, 5, 7, 8)

Status: **on this branch**. Camera / Stage remount, pedal click-seed, calibration binding, pose freshness. Metrics/rules contracts from PR1 are unchanged.

## BUILD_OK

`npm run build` (`tsc -b && vite build`) plus:

- `npm run setup:harness`
- existing `flow` / `metrics` / `soll` / `rules` / `sessions` harnesses

## 3 — Remount video after Start

- Stream binds to the **actual** `<video>` via Stage callback refs (`attachVideo`). Re-runs on mount **and** stream identity change.
- Ready = `play()` succeeded + `readyState >= HAVE_CURRENT_DATA` + width/height ≥ 2. `cameraReady` / Weiter use that, not merely `srcObject`.
- Failed `play()` is a visible banner on Stage and Camera rail.
- **When the camera stops:** leaving the journey to **Start** (flow), explicit Stop / Restart / device change, FitProvider unmount. Stage unmount only detaches `srcObject`; tracks stop on the leave/stop policy above.
- Acceptance path: Start → Synthetic → … → Start → Neue Messung, three times, no reload.

## 5 — Pedal marker clickable

- Body step is mode **Pedalmarker auswählen**. Stage clicks call `seedAt` (any colour, not magenta-only). B/S/G clicks stay on the calibrate step.
- Selection pixel, status, and **Erneut wählen** after LOST. Auto-magenta seed is disabled while this mode is on or after a user seed.

## 7 — Calibration tied to camera/geometry

- Binding stores `source`, `deviceId`, resolution, `setupId`. Camera or geometry change wipes marks.
- Weiter requires transform, in-bounds marks, non-degenerate triangle. Identical B/S/G is blocked.
- **Fixture B/S/G** only while the active source is the synthetic demo.
- **Standbild halten / lösen** freezes a still at source resolution; clicks still map through `clientToVideoPixel` on the video element.

## 8 — Pose loss / worker errors

- Miss / timeout: pose goes stale then **lost** (`400 ms` / `900 ms`). Body checks need a live frame.
- Worker INIT timeout (15 s) and runtime fail streak → error copy + **Worker erneut starten**.
- Stream swap bumps a session id; stale worker FRAME/MISS/ERROR replies are dropped.

## Tests

`src/setup/harness.ts` — setup id, identical/degenerate/OOB marks, source mismatch, pose freshness, session discard, playable predicate.

VM: Synthetic. Real Continuity Camera still needs a Mac.
