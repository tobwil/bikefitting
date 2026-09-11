# SOLL_STATUS — E5 P0 `current_setup`

Mode implemented: **`current_setup` only**. `adjustment_simulation` is P1 and returns `insufficient_input` / `mode_unsupported` (no fake bike setup).

Solver statuses: `feasible` | `infeasible` | `insufficient_input` | `timeout`, each with reason codes.

| Constraint | Behaviour |
| --- | --- |
| Constant segment lengths | 2-link IK; if a target is out of reach the solver does **not** stretch bones |
| Pedal on crank circle | Ankle/pedal is `B + R ∠ phase` (0° = TDC, same convention as the pedal module) |
| Hand at G | Wrist is the calibrated hoods/grip mark |
| Hip vs S | Hip stays inside the calibrated offset box around S — S is never moved |
| Phase lost | Full-body ghost hidden; Ist overlay/metrics stay as they are |
| Ist vs Soll | Independent streams. Measuring from Ist copies **lengths only**, never Ist joints |

On `infeasible` the UI shows **Zielbereich mit diesem Setup nicht erreichbar** and leaves B/S/G unchanged.

No Ampel, no cloud, no accounts.

## Demo with synthetic phase (VM-safe)

```bash
npm install
npm run dev   # http://127.0.0.1:47321
```

1. Rail → **Synthetic** (fixture paints B/S/G and a magenta pedal).
2. Default **Pedal phase**: once the marker is `locked`, a **dashed cyan** Soll ghost overlays the Ist skeleton. Toggle **Corridor** for the hip box + translucent band.
3. **Synthetic phase** (demo without relying on the lock):
   - Click **Synthetic phase**. Play animates 80 rpm; drag the slider to scrub 0–1.
   - **Reset track** in the pedal rail until **LOST**.
   - With phase source still **Synthetic**, the ghost keeps moving (phase is injected).
   - Switch back to **Pedal phase** → ghost hides (`insufficient_input` / `phase_lost`). Ist numbers remain.
4. **Infeasible demo:** drag **Segment scale** down (~0.28×). Ghost disappears; German copy appears. B/S/G do not jump. Reset scale to 1.00.
5. **Soll harness** in the Soll rail: fixture feasible, synthetic phase, LOST hides ghost, short limbs infeasible, P1 mode rejected.

Placeholders are marked **estimated**. **Measure from Ist** freezes lengths/hip offset from the current Ist frame (synthetic Ist works on the VM).
