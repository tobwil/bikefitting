# POSE_STATUS — Overlay 1€ eval (Product C)

Timestamp-based **One Euro** is a **lab overlay compare** only. Raw pose still feeds metrics, phase stills, and export.

## License

Casiez / Goguey TypeScript 1€ (BSD-3-Clause), npm `1eurofilter@1.3.0`.

- `src/pose/vendor/casiez-oneeurofilter/LICENSE`
- `src/pose/vendor/casiez-oneeurofilter/NOTICE`
- Home: https://gery.casiez.net/1euro/
- Source: https://github.com/casiez/OneEuroFilter/tree/main/typescript

Not a NintAi / fixed-30 Hz port. `OneEuroFilter.filter(value, timestampSec)` updates Hz from dt.

## Lab toggle

Default **off**. Opt-in:

- Diagnose → **1€-Overlay vergleichen (nicht für Metriken)**
- Gate-A-Labor pose rail
- `?overlayFilter=1`

Smoother overlay is **not** a reason to filter metrics or unlock Ampel.

## Reset

Filter state clears on pose loss (≥900 ms or null frame), seek / rewind, camera or file change, worker retry, and toggle-off.

## Side / visibility

Near-side locks after ~160 ms. Locked-side occlusion or a later L/R flip → **not measurable**, `needsNewTake`. No silent chain switch. Missing joints keep raw low visibility — no invented intermediates.

## Delay harness (`npm run pose:harness`)

Irregular timestamps (18–48 ms, not 33.3 Hz). Noisy right-knee series vs overlay:

| Measure | Role |
| --- | --- |
| High-pass RMS (knee °) | Overlay must jitter less than raw |
| Phase delay (ms) | Sliding MSE of filtered vs raw knee. Positive = overlay trails |
| BDC shift (°) | `computeMetricsReport` on filtered vs raw — eval only. Fail if \|Δ\| > 2° |
| Invented visibility | Hidden joints must stay hidden |

If delay or BDC shift looks small on the fixture, that still does **not** ship the filter as a metrics default.

## Out of scope

File replay clock, phase stills, cloud, Ampel. Product cards stay German and ungated.
