# Gate A — internal VM checklist

Dev server: `npm run dev` → **http://127.0.0.1:47321** (`DEV_PORT=47321`).

This agent VM has **no Mac camera**. Use **Synthetic** for live overlay / pedal lock. Real Chrome-on-macOS camera is still required before calling Gate A done.

| Check | VM result | How |
| --- | --- | --- |
| Camera Start / Stop / Restart | Pass (synthetic path) | Rail → Start (may deny without a device) → **Synthetic** → Stop → Restart |
| Pose `WORKER_READY` | Pass if worker + `/models` load | Pose rail heading / Worker readout |
| Overlay frame-synced | Partial | `rvfc` when `requestVideoFrameCallback` exists, else `rAF` + `currentTime` guard. Synthetic Ist is drawn on the same loop. Real MediaPipe Ist needs a rider on a Mac. |
| Calibration save / load | Pass | Place or **Fixture B/S/G** → Save → Clear → Load. Key `bikefit.calibration.v1` |
| Pedal ≥10 revolutions | Pass (synthetic) | **≥10 rev harness** (ImageData circle, no camera). Live magenta marker also tracks on the fixture. **LOST** is a harness case and a live badge. |

## MAC_TEST_STILL_NEEDED

- Real webcam permission in current Google Chrome on macOS (lock icon → Camera → Allow, then Restart)
- Side-view rider on a fixed trainer; MediaPipe Lite vs Full latency / joint stability
- Overlay lag vs live camera (`rVFC` timestamp − result timestamp)
- Pedal marker lock across ≥10 real crank revolutions
