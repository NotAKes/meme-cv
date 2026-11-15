# Third-party CV components

## MediaPipe Tasks Vision

`@mediapipe/tasks-vision` supplies the JavaScript API and WASM runtime copied to `public/wasm` during installation. Its npm package declares Apache-2.0. The upstream project is https://github.com/google-ai-edge/mediapipe.

The application runs these components locally. It does not train or claim authorship of the MediaPipe neural networks.

## Model assets

Unmodified, fixed-version Google-hosted task files used by this application. These third-party model assets are separate from the project's MIT-licensed application code. Consult the upstream model documentation for applicable model terms.

| File | Upstream URL | SHA-256 |
|---|---|---|
| `face_landmarker.task` | https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task | `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff` |
| `pose_landmarker_lite.task` | https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task | `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a` |
| `gesture_recognizer.task` | https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task | `97952348cf6a6a4915c2ea1496b4b37ebabc50cbbf80571435643c455f2b0482` |

Documentation:

- https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker
- https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
- https://ai.google.dev/edge/mediapipe/solutions/vision/gesture_recognizer

Gesture Recognizer provides both hand landmarks and the learned `Closed_Fist` class. Shaka/🤙 and 👉👈 use application-specific landmark geometry. Tongue analysis is an application-specific pixel heuristic or personal numeric classifier, not a MediaPipe tongue model.

## Regression fixtures

`src/lib/fixtures/mediapipe-output.json` stores numeric outputs of local MediaPipe inference on upstream samples:

- https://storage.googleapis.com/mediapipe-assets/thumb_up.jpg
- https://storage.googleapis.com/mediapipe-assets/portrait.jpg

`src/lib/fixtures/gesture-model-output.json` stores numeric Gesture Recognizer outputs from:

- https://storage.googleapis.com/mediapipe-assets/fist.jpg
- https://storage.googleapis.com/mediapipe-assets/thumb_up.jpg

These sample photographs themselves are not bundled. The fixtures test model output structure and regression cases, not population-level accuracy.
