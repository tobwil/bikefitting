# MediaPipe model manifest (E0)

Package: `@mediapipe/tasks-vision@0.10.35`
WASM copied from `node_modules/@mediapipe/tasks-vision/wasm` → `public/models/wasm/`.
Model URLs use **float16/1**, not `latest`.

| File | Source | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `pose_landmarker_lite.task` | https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task | 5777746 | `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a` |
| `pose_landmarker_full.task` | https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task | 9398198 | `5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1` |

### WASM

| File | Source | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `wasm/vision_wasm_internal.js` | npm @mediapipe/tasks-vision@0.10.35 | 322044 | `e7fd9858e8e8f221d9b96eddc11f8e077f263e0b7bbd79d3cbe882b134274f8c` |
| `wasm/vision_wasm_internal.wasm` | npm @mediapipe/tasks-vision@0.10.35 | 11153617 | `6a5c64584c2ab61c763b6e204afbdbc7ce1caf7f5216187322bca8df94f646bc` |
| `wasm/vision_wasm_module_internal.js` | npm @mediapipe/tasks-vision@0.10.35 | 322082 | `1f1d6215324a1fe62f6742d49a3db911170987ca18ad8c1b75f1a1c82acf2b44` |
| `wasm/vision_wasm_module_internal.wasm` | npm @mediapipe/tasks-vision@0.10.35 | 11153641 | `617b8e0248dbd27e9d7ece4218004eae4cefb499196d1bb4fa0e3fef21708756` |
| `wasm/vision_wasm_nosimd_internal.js` | npm @mediapipe/tasks-vision@0.10.35 | 321847 | `438d1fe8ff7f4d946025bc211c291543c037d8a3785ed4eee60f1f521b236296` |
| `wasm/vision_wasm_nosimd_internal.wasm` | npm @mediapipe/tasks-vision@0.10.35 | 10481398 | `8a3092d34c79d3f57e6ba8592105e8a90f6b07c27891ffecd14cca428bfd3e31` |

Regenerate: `npm run vendor:mediapipe`.
