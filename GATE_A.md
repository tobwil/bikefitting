# Gate A — internal VM checklist

Dev server: `npm run dev` → **http://127.0.0.1:47321** (`DEV_PORT=47321`).

This agent VM has **no Mac camera**. Use **Synthetic** for live overlay / pedal lock. Real Chrome-on-macOS camera is still required before calling Gate A done.

| Check | VM result | How |
| --- | --- | --- |
| Camera Start / Stop / Restart | **Pass** (synthetic path) | Rail → **Synthetic** → Stop → Restart. Live `Start` has no webcam on this VM (deny/unavailable is expected). |
| Pose `WORKER_READY` | **Pass** | Pose rail heading / Worker readout after INIT (MediaPipe module WASM fileset). |
| Overlay frame-synced | **Pass on fixture** | `rvfc` (`requestVideoFrameCallback`). Cartoon fixture uses matching synthetic Ist when MediaPipe returns nothing. Real rider Ist still needs a Mac camera. |
| Overlay 1€ compare | **Pass (harness)** | Lab toggle / `?overlayFilter=1`. Timestamp 1€ (Casiez BSD). Metrics stay raw. Delay / BDC-shift notes in `POSE_STATUS.md`. |
| Calibration save / load | **Pass** | **Fixture B/S/G** (auto on synthetic) → Save → Clear → Load. Key `bikefit.calibration.v1`. Knee flexion numeric only. |
| Pedal ≥10 revolutions | **Pass** (synthetic) | **≥10 rev harness**: 11 revs locked + LOST case. Live magenta marker also tracks on the fixture. |
| Lite vs Full lab compare | **Pass** (synthetic + file fixture) | Gate-A **Labor · Lite vs Full** or `npm run pose:compare`. Decision note has accuracy + runtime. Full not product-default. |

## MAC_TEST_STILL_NEEDED

- Real webcam permission in current Google Chrome on macOS (lock icon → Camera → Allow, then Restart)
- Side-view rider on a fixed trainer; MediaPipe Lite vs Full latency / joint stability
- Overlay lag vs live camera (`rVFC` timestamp − result timestamp)
- Pedal marker lock across ≥10 real crank revolutions
