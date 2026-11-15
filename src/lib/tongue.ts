import type { Point } from './overlay'
import { scorePersonalTongue, type TongueProfile } from './tongue-calibration'
export type { TongueProfile } from './tongue-calibration'

const mouthIndices = [78, 81, 13, 311, 308, 402, 14, 178]
const skinIndices = [50, 280]
const clamp = (n: number) => Math.max(0, Math.min(1, n))
const valid = (p: Point | undefined): p is Point => !!p && Number.isFinite(p.x) && Number.isFinite(p.y)
  && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1

export interface TongueDiagnostic {
  source: 'heuristic' | 'personal' | 'unavailable'
  /** This frame has a usable descriptor for collecting calibration samples. */
  calibrationReady?: boolean
  reason: string
  score?: number
  /** Source-video crop in pixels. */
  crop?: { x: number; y: number; width: number; height: number }
}

type Analysis = { score: number; valid: boolean; reason: string }

/** Experimental color/shape heuristic, NOT a trained or production tongue model.
 * Points are normalized to this image. Unknown lighting/geometry stays unknown.
 * Red lipstick, food, skin tones and occlusion can still cause errors.
 */
export function analyzeTongue(image: ImageData, face: Point[]): { score: number; valid: boolean } {
  const { score, valid } = analyzeTongueDetailed(image, face)
  return { score, valid }
}

function analyzeTongueDetailed(image: ImageData, face: Point[]): Analysis {
  const unknown = (reason: string): Analysis => ({ score: 0, valid: false, reason })
  if (![...mouthIndices, ...skinIndices].every(i => valid(face[i]))) return unknown('face landmarks missing')
  if (!image || image.width < 8 || image.height < 8 || image.data.length !== image.width * image.height * 4) return unknown('crop too small')
  const pixel = (p: Point) => ({ x: p.x * (image.width - 1), y: p.y * (image.height - 1) })
  const polygon = mouthIndices.map(i => pixel(face[i]))
  const left = pixel(face[78]), right = pixel(face[308])
  const width = Math.hypot(right.x - left.x, right.y - left.y)
  if (width < 6) return unknown('crop too small')
  const ux = (right.x - left.x) / width, uy = (right.y - left.y) / width
  const center = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 }
  const local = (p: { x: number; y: number }) => ({
    x: ((p.x - center.x) * ux + (p.y - center.y) * uy) / width,
    y: (-(p.x - center.x) * uy + (p.y - center.y) * ux) / width,
  })
  const top = local(pixel(face[13])).y, bottom = local(pixel(face[14])).y
  const opening = bottom - top
  if (opening < -.02 || opening > 1) return unknown('invalid mouth geometry')
  const samples: number[][] = []
  for (const i of skinIndices) {
    const p = pixel(face[i])
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = Math.round(p.x) + dx, y = Math.round(p.y) + dy
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue
      const index = (y * image.width + x) * 4
      if (image.data[index + 3] < 200) continue
      samples.push(Array.from(image.data.slice(index, index + 3)))
    }
  }
  if (samples.length < 8) return unknown('mouth unobservable')
  const skin = [0, 1, 2].map(c => samples.reduce((sum, p) => sum + p[c], 0) / samples.length)
  if (skin[0] < 45 || Math.max(...skin) > 250) return unknown('insufficient lighting')
  // Lip landmarks can stay almost closed around a protruding tongue.
  // Decide from a connected protrusion instead of vetoing on jaw opening.
  const skinLight = .2126 * skin[0] + .7152 * skin[1] + .0722 * skin[2]
  const inside = (x: number, y: number) => {
    let result = false
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j]
      if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) result = !result
    }
    return result
  }
  const mask = new Uint8Array(image.width * image.height)
  let aperture = 0, observed = 0
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const p = local({ x, y })
    const inMouth = inside(x, y)
    if (inMouth) aperture++
    const below = Math.abs(p.x) < .27 && p.y >= bottom && p.y < bottom + .30
    if (!inMouth && !below) continue
    const index = (y * image.width + x) * 4
    const [r, g, b, alpha] = image.data.slice(index, index + 4)
    if (alpha < 200) continue
    if (inMouth) observed++
    const luminance = .2126 * r + .7152 * g + .0722 * b
    // Channel ratios relative to cheeks tolerate exposure and per-channel white balance.
    // Tongue pink has more blue relative to green than orange/brown skin.
    const redContrast = (r + 5) / (g + 5) / ((skin[0] + 5) / (skin[1] + 5))
    const pinkContrast = (b + 5) / (g + 5) / ((skin[2] + 5) / (skin[1] + 5))
    const colored = redContrast > 1.06 && pinkContrast > 1.12 && r > g * 1.02
    if (colored && luminance > Math.max(22, skinLight * .38) && r > 35
      && Math.abs(p.x) < .4 && p.y > top + opening * .3) mask[y * image.width + x] = 1
  }
  if (aperture < 6 && opening >= .045) return unknown('crop too small')
  if (observed < aperture * .8) return unknown('mouth unobservable')
  let largest = 0
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue
    const queue = [i]
    mask[i] = 0
    let attached = false
    let minY = Infinity, maxY = -Infinity, belowCount = 0
    for (let q = 0; q < queue.length; q++) {
      const at = queue[q], x = at % image.width, y = Math.floor(at / image.width)
      const p = local({ x, y })
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
      if (p.y > bottom + .06) belowCount++
      // Component must touch the lower central aperture, not just the lip/skin.
      if (Math.abs(p.x) < .22 && p.y >= top + opening * .45
        && p.y < bottom + .09) attached = true
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height) continue
        const next = ny * image.width + nx
        if (mask[next]) { mask[next] = 0; queue.push(next) }
      }
    }
    const substantial = maxY - minY > .10
    const protruding = belowCount >= Math.max(5, width * width * .012)
    if (attached && substantial && (opening >= .045 || protruding)) largest = Math.max(largest, queue.length)
  }
  const score = largest < Math.max(5, aperture * .12) ? 0 : clamp(largest / Math.max(width * width * .055, aperture * .55))
  return { score, valid: true, reason: score > 0 ? 'tongue detected' : 'no tongue' }
}

/** Roll/scale-normalized mouth appearance, not identity landmarks or persistent pixels.
 * A 5×5 local grid covers the inner mouth polygon AND the central tip region below
 * the lower lip. Cheek-relative chromaticities/luminance retain dark-cavity vs
 * pink-protrusion evidence. Closed mouths are observable calibration negatives.
 */
export function extractTongueDescriptor(image: ImageData, face: Point[]): number[] | undefined {
  if (![...mouthIndices, ...skinIndices].every(i => valid(face[i])) || !image
    || image.width < 8 || image.height < 8 || image.data.length !== image.width * image.height * 4) return undefined
  const pixel = (p: Point) => ({ x: p.x * (image.width - 1), y: p.y * (image.height - 1) })
  const left = pixel(face[78]), right = pixel(face[308])
  const width = Math.hypot(right.x - left.x, right.y - left.y)
  if (width < 6) return undefined
  const ux = (right.x - left.x) / width, uy = (right.y - left.y) / width
  const cx = (left.x + right.x) / 2, cy = (left.y + right.y) / 2
  const local = (p: Point) => {
    const q = pixel(p)
    return { x: ((q.x - cx) * ux + (q.y - cy) * uy) / width,
      y: (-(q.x - cx) * uy + (q.y - cy) * ux) / width }
  }
  const polygon = mouthIndices.map(i => local(face[i]))
  const top = local(face[13]).y, bottom = local(face[14]).y
  const opening = bottom - top
  if (opening < -.02 || opening > 1) return undefined
  const read = (x: number, y: number) => {
    x = Math.round(x); y = Math.round(y)
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) return undefined
    const i = (y * image.width + x) * 4
    return image.data[i + 3] >= 200 ? [image.data[i], image.data[i + 1], image.data[i + 2]] : undefined
  }
  const cheeks: number[][] = []
  for (const i of skinIndices) {
    const p = pixel(face[i])
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
      const rgb = read(p.x + x, p.y + y)
      if (rgb) cheeks.push(rgb)
    }
  }
  if (cheeks.length < 8) return undefined
  const skin = [0, 1, 2].map(c => cheeks.reduce((sum, p) => sum + p[c], 0) / cheeks.length)
  if (skin[0] < 45 || Math.max(...skin) > 250) return undefined
  const chroma = (rgb: number[]) => {
    const sum = Math.max(1, rgb[0] + rgb[1] + rgb[2])
    return [rgb[0] / sum, rgb[1] / sum, (.2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2]) / 255]
  }
  const reference = chroma(skin)
  const inside = (x: number, y: number) => {
    let result = false
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j]
      if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) result = !result
    }
    return result
  }
  const descriptor: number[] = []
  const stats = [0, 0, 0, 0]
  let requested = 0, observed = 0
  const y0 = -.18, span = .92
  for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 5; gx++) {
    const values = [0, 0, 0, 0]
    let count = 0
    // Average nine pixels per cell, rather than aliasing one noisy camera pixel.
    for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
      const x = -.42 + (gx + (sx + .5) / 3) / 5 * .84
      const y = y0 + (gy + (sy + .5) / 3) / 5 * span
      const inRegion = inside(x, y) || (Math.abs(x) < .30 && y >= bottom)
      requested++
      const rgb = read(cx + width * (x * ux - y * uy), cy + width * (x * uy + y * ux))
      if (!rgb) continue
      observed++; count++
      const c = chroma(rgb), max = Math.max(...rgb), min = Math.min(...rgb)
      const saturation = max ? (max - min) / max : 0
      const redHue = max === min ? 0 : max === rgb[0] ? 1 - Math.min(1, Math.abs((rgb[1] - rgb[2]) / (max - min)) / 2) : 0
      values[0] += c[0] - reference[0]
      values[1] += c[1] - reference[1]
      values[2] += c[2] - reference[2]
      values[3] += saturation * .25
      stats[0] += inRegion ? redHue : 0; stats[1] += inRegion ? saturation : 0; stats[2] += inRegion ? max / 255 : 0
      stats[3] += c[2] < .22 ? 1 : 0
    }
    // Prioritize protrusion below the mouth corners; cavity opening alone is weak.
    const weight = y0 + (gy + .5) / 5 * span > .32 ? 1 : .1
    descriptor.push(...values.map(v => count ? weight * v / count : 0))
  }
  if (observed < 20 || observed < requested * .85) return undefined
  // Only mouth-relative shape, never absolute face location, size or identity.
  descriptor.push(...stats.map(v => .1 * v / observed), opening * .05, top * .05, bottom * .05)
  return descriptor
}

/** CPU processing is restricted to one mouth/cheek crop, at most 192 × 192. */
export class TongueDetector {
  private canvas?: HTMLCanvasElement
  private lastDiagnostic: TongueDiagnostic = { reason: 'not run', source: 'unavailable' }
  private lastObservation?: number[]
  get observation(): number[] | undefined { return this.lastObservation?.slice() }
  get diagnostics(): Readonly<TongueDiagnostic> { return this.lastDiagnostic }

  detect(video: HTMLVideoElement, face: Point[], profile?: TongueProfile): number | undefined {
    this.lastObservation = undefined
    this.lastDiagnostic = { source: 'unavailable', reason: 'face landmarks missing' }
    if (![...mouthIndices, ...skinIndices].every(i => valid(face[i]))) return undefined
    this.lastDiagnostic = { source: 'unavailable', reason: 'video unavailable' }
    if (!Number.isFinite(video.videoWidth) || !Number.isFinite(video.videoHeight)
      || video.videoWidth <= 0 || video.videoHeight <= 0) return undefined
    const points = [...mouthIndices, ...skinIndices].map(i => ({
      x: face[i].x * video.videoWidth, y: face[i].y * video.videoHeight,
    }))
    // Pixel-space distance preserves padding under head roll and non-square video.
    // Include the protrusion region in any direction, not only image-down.
    const mouthWidth = Math.hypot((face[308].x - face[78].x) * video.videoWidth,
      (face[308].y - face[78].y) * video.videoHeight)
    // Fixed local descriptor grid reaches .74 mouth-widths below the corners,
    // including when the lips are closed during negative calibration.
    const padding = mouthWidth * .8
    const x = Math.max(0, Math.min(...points.map(p => p.x)) - padding)
    const y = Math.max(0, Math.min(...points.map(p => p.y)) - padding)
    const width = Math.min(video.videoWidth, Math.max(...points.map(p => p.x)) + padding) - x
    const height = Math.min(video.videoHeight, Math.max(...points.map(p => p.y)) + padding) - y
    const crop = { x, y, width, height }
    this.lastDiagnostic = { source: 'unavailable', reason: 'crop too small', crop }
    if (width < 8 || height < 8 || mouthWidth < 6) return undefined
    this.lastDiagnostic = { source: 'unavailable', reason: 'canvas unavailable', crop }
    try {
      this.canvas ??= document.createElement('canvas')
      const scale = Math.min(1, 192 / Math.max(width, height))
      this.canvas.width = Math.max(1, Math.round(width * scale))
      this.canvas.height = Math.max(1, Math.round(height * scale))
      const ctx = this.canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return undefined
      ctx.drawImage(video, x, y, width, height, 0, 0, this.canvas.width, this.canvas.height)
      const image = ctx.getImageData(0, 0, this.canvas.width, this.canvas.height)
      const landmarks = face.map(p => ({ ...p,
          // drawImage maps pixel edges; analyzeTongue uses pixel-center coordinates.
          // Source-frame edge points sample the nearest border pixel.
          x: clamp(((p.x * video.videoWidth - x) / width * this.canvas!.width - .5) / (this.canvas!.width - 1)),
          y: clamp(((p.y * video.videoHeight - y) / height * this.canvas!.height - .5) / (this.canvas!.height - 1)),
        }))
      this.lastObservation = extractTongueDescriptor(image, landmarks)
      if (profile) {
        const score = this.lastObservation && scorePersonalTongue(this.lastObservation, profile)
        this.lastDiagnostic = { source: score === undefined ? 'unavailable' : 'personal',
          reason: score === undefined ? 'personal calibration unavailable or out of distribution' : score >= .5 ? 'tongue detected' : 'no tongue',
          calibrationReady: !!this.lastObservation, ...(score === undefined ? {} : { score }), crop }
        return score
      }
      const result = analyzeTongueDetailed(image, landmarks)
      this.lastDiagnostic = { source: result.valid ? 'heuristic' : 'unavailable', calibrationReady: !!this.lastObservation, reason: result.reason, ...(result.valid ? { score: result.score } : {}), crop }
      return result.valid ? result.score : undefined
    } catch { return undefined }
  }
}
