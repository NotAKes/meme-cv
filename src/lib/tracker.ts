import { FaceLandmarker, PoseLandmarker, GestureRecognizer, FilesetResolver } from '@mediapipe/tasks-vision'
import type { Features } from './matching'
import type { TrackingFrame } from './overlay'
import { classifyHandGestures } from './hand-gestures'
import type { HandExample, HandDecision } from './hand-gestures'
import { extractCatFeatures, getHandShapeDiagnostics } from './cat-features'
import { TongueDetector } from './tongue'
import { TongueEvidence } from './tongue-evidence'
import type { TongueProfile } from './tongue-calibration'

const base = import.meta.env.BASE_URL
const clamp = (n: number) => Math.max(0, Math.min(1, n))

async function download(path: string, label: string, onProgress: (message: string) => void): Promise<Uint8Array> {
  // Small independently retryable requests survive connections that stall on large files.
  const manifestResponse = await fetch(`${path}.parts/manifest.json`, { cache: 'force-cache', signal: AbortSignal.timeout(20000) })
  if (manifestResponse.ok && manifestResponse.headers.get('content-type')?.includes('application/json')) {
    const manifest: { sizes: number[] } = await manifestResponse.json()
    const parts: Uint8Array<ArrayBuffer>[] = Array(manifest.sizes.length)
    let next = 0, loaded = 0
    const total = manifest.sizes.reduce((sum, size) => sum + size, 0)
    onProgress(`${label}: 0 / ${Math.ceil(total / 1024)} КБ`)
    await Promise.all(Array.from({ length: 6 }, async () => {
      for (;;) {
        const index = next++
        if (index >= parts.length) return
        for (let attempt = 0; ; attempt++) {
          try {
            const response = await fetch(`${path}.parts/${index}`, { cache: 'force-cache', signal: AbortSignal.timeout(20000) })
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            const bytes = new Uint8Array(await response.arrayBuffer())
            if (bytes.length !== manifest.sizes[index]) throw new Error('Incomplete download')
            parts[index] = bytes; loaded += bytes.length
            onProgress(`${label}: ${Math.round(loaded / 1024)} / ${Math.ceil(total / 1024)} КБ`)
            break
          } catch (error) {
            if (attempt >= 4) throw new Error(`${label}: соединение прерывается. Попробуйте другую сеть.`, { cause: error })
          }
        }
      }
    }))
    const compressed = new Blob(parts)
    return new Uint8Array(await new Response(compressed.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer())
  }
  const controller = new AbortController()
  let timeout = setTimeout(() => controller.abort(), 90000)
  const chunks: Uint8Array[] = []
  let received = 0
  try {
    onProgress(`${label}: загрузка…`)
    const response = await fetch(path, { signal: controller.signal, cache: 'force-cache' })
    if (!response.ok) throw new Error(`${label}: HTTP ${response.status}. Обновите страницу и попробуйте снова.`)
    const reader = response.body?.getReader()
    if (!reader) return new Uint8Array(await response.arrayBuffer())
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      clearTimeout(timeout)
      timeout = setTimeout(() => controller.abort(), 90000)
      chunks.push(value); received += value.byteLength
      onProgress(`${label}: ${(received / 1048576).toFixed(1)} МБ`)
    }
    const bytes = new Uint8Array(received)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return bytes
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`${label}: загрузка прервалась. Проверьте соединение и попробуйте снова.`)
    throw error
  } finally { clearTimeout(timeout) }
}

export class Tracker {
  private face: FaceLandmarker
  private pose: PoseLandmarker
  private hands: GestureRecognizer
  private tongue = new TongueDetector()
  private tongueEvidence = new TongueEvidence()
  private handDecisions: HandDecision[] = []
  private handShapes: ReturnType<typeof getHandShapeDiagnostics> = []

  private constructor(face: FaceLandmarker, pose: PoseLandmarker, hands: GestureRecognizer) {
    this.face = face; this.pose = pose; this.hands = hands
  }

  static async create(onProgress: (message: string) => void): Promise<Tracker> {
    onProgress('Загружаем движок компьютерного зрения…')
    const files = await FilesetResolver.forVisionTasks(`${base}wasm`)
    let wasmUrl: string | undefined
    let face: FaceLandmarker | undefined
    let pose: PoseLandmarker | undefined
    let hands: GestureRecognizer | undefined
    try {
      const wasm = await download(files.wasmBinaryPath, 'Движок', onProgress)
      wasmUrl = URL.createObjectURL(new Blob([wasm as Uint8Array<ArrayBuffer>], { type: 'application/wasm' }))
      files.wasmBinaryPath = wasmUrl
      const faceModel = await download(`${base}models/face_landmarker.task`, 'Модель лица', onProgress)
      onProgress('Запускаем модель лица…')
      face = await FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetBuffer: faceModel, delegate: 'CPU' },
        runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
      })
      const poseModel = await download(`${base}models/pose_landmarker_lite.task`, 'Модель позы', onProgress)
      onProgress('Запускаем модель позы…')
      pose = await PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetBuffer: poseModel, delegate: 'CPU' },
        runningMode: 'VIDEO', numPoses: 1,
      })
      const handModel = await download(`${base}models/gesture_recognizer.task`, 'Модель жестов', onProgress)
      onProgress('Запускаем модель жестов…')
      hands = await GestureRecognizer.createFromOptions(files, {
        baseOptions: { modelAssetBuffer: handModel, delegate: 'CPU' },
        runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: .35, minHandPresenceConfidence: .35, minTrackingConfidence: .35,
        cannedGesturesClassifierOptions: { maxResults: 8, scoreThreshold: 0 },
      })
      return new Tracker(face, pose, hands)
    } catch (error) {
      face?.close(); pose?.close(); hands?.close()
      throw error
    } finally { if (wasmUrl) URL.revokeObjectURL(wasmUrl) }
  }

  detect(video: HTMLVideoElement, now: number, fistExamples: HandExample[] = [], tongueProfile?: TongueProfile): { frame: TrackingFrame; features: Features } {
    const face = this.face.detectForVideo(video, now)
    const pose = this.pose.detectForVideo(video, now)
    const hands = this.hands.recognizeForVideo(video, now)
    const frame: TrackingFrame = { face: face.faceLandmarks[0] ?? [], pose: pose.landmarks[0] ?? [], hands: hands.landmarks }
    const features: Features = extractCatFeatures(frame, video.videoWidth / video.videoHeight, hands.worldLandmarks)
    this.handShapes = getHandShapeDiagnostics(frame, video.videoWidth / video.videoHeight, hands.worldLandmarks)
    const decision = classifyHandGestures(this.handShapes, hands.gestures, fistExamples)
    this.handDecisions = decision.hands
    // Replace raw heuristics with the per-hand model/geometry/personal fusion.
    delete features.fist; delete features.callMe
    Object.assign(features, decision.features)
    const scores = new Map(face.faceBlendshapes[0]?.categories.map(c => [c.categoryName, c.score]))
    if (frame.face.length && scores.size) {
      if (scores.has('jawOpen')) features.mouthOpen = clamp(((scores.get('jawOpen') ?? 0) - .02) / .55)
      const eyes = ['Left', 'Right'].flatMap(side => {
        const blink = scores.get(`eyeBlink${side}`), wide = scores.get(`eyeWide${side}`)
        return blink !== undefined && wide !== undefined ? [clamp(.65 * (1 - blink) + .35 * wide)] : []
      })
      if (eyes.length) features.eyesOpen = eyes.reduce((a, b) => a + b, 0) / eyes.length
      features.smile = ((scores.get('mouthSmileLeft') ?? 0) + (scores.get('mouthSmileRight') ?? 0)) / 2
      features.browRaise = clamp((scores.get('browInnerUp') ?? 0) + ((scores.get('browOuterUpLeft') ?? 0) + (scores.get('browOuterUpRight') ?? 0)) / 2)
    }
    const p = frame.pose
    const visible = (index: number) => p[index] && (p[index].visibility ?? 0) >= 0.5
    if (visible(11) && visible(12)) {
      const scale = Math.max(Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y), 0.08)
      if (visible(15)) features.leftHandUp = clamp(0.5 + (p[11].y - p[15].y) / scale)
      if (visible(16)) features.rightHandUp = clamp(0.5 + (p[12].y - p[16].y) / scale)
      const nose = frame.face[1]
      const distances = [15, 16].filter(visible).map(i => nose ? Math.hypot(p[i].x - nose.x, p[i].y - nose.y) : Infinity)
      if (nose && distances.length) features.handsNearFace = Math.max(features.handsNearFace ?? 0, clamp(1 - Math.min(...distances) / scale))
    }
    const matrix = face.facialTransformationMatrixes[0]?.data
    if (matrix?.length === 16 && matrix.every(Number.isFinite)) {
      // MediaPipe column-major canonical-face rotation; positive x pitch looks down.
      // atan2 removes scale and tolerates yaw; geometric pitch remains the fallback.
      const pitch = Math.atan2(matrix[6], Math.hypot(matrix[4], matrix[5]))
      features.headDown = clamp((pitch - .08) / .55)
      features.headUp = clamp((-pitch - .08) / .55)
    }
    const tongue = this.tongueEvidence.update(this.tongue.detect(video, frame.face, tongueProfile), now)
    if (tongue !== undefined) features.tongueOut = tongue
    return { frame, features }
  }

  get tongueObservation() { return this.tongue.observation }

  get diagnostics() { return { tongue: this.tongue.diagnostics, hands: this.handDecisions, handShapes: this.handShapes } }

  close() { this.face.close(); this.pose.close(); this.hands.close() }
}
