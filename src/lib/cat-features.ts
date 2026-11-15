import type { Features } from './matching'
import type { Point, TrackingFrame } from './overlay'

const clamp = (value: number) => Math.max(0, Math.min(1, value))
// Face/hand models do not provide meaningful visibility or presence scores.
const valid = (point: Point | undefined): point is Point => !!point
  && Number.isFinite(point.x) && Number.isFinite(point.y)
const epsilon = 1e-6

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length
const safeAspect = (aspect: number) => Number.isFinite(aspect) && aspect > 0 ? aspect : 4 / 3

// Use metric 3D when available. Normalized x and z both use image-width
// units, so scale them by aspect before measuring image-space 3D distances.
function analyzeHands(frame: TrackingFrame, aspect: number, worldHands?: Point[][]) {
  const distance = (a: Point, b: Point) => Math.hypot((a.x - b.x) * aspect, a.y - b.y)
  return frame.hands.flatMap((hand, handIndex) => {
    if (![0, 5, 9, 17].every(i => valid(hand[i]))) return []
    const palm = (distance(hand[0], hand[9]) + distance(hand[5], hand[17])) / 2
    if (palm <= epsilon) return []
    const world = worldHands?.[handIndex]
    const metricValid = (p: Point | undefined): p is Point => valid(p) && Number.isFinite(p.z)
    const useWorld = world && [0, 5, 9, 17].every(i => metricValid(world[i]))
    const points = (useWorld ? world : hand).map(p => p && ({ ...p,
      x: p.x * (useWorld ? 1 : aspect), z: p.z * (useWorld ? 1 : aspect) }))
    const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
    const metricPalm = (dist(points[0], points[9]) + dist(points[5], points[17])) / 2
    const finger = (ids: number[]) => {
      if (!ids.every(i => metricValid(points[i]))) return undefined
      const [mcp, pip, dip, tip] = ids.map(i => points[i])
      const segments = [dist(mcp, pip), dist(pip, dip), dist(dip, tip)]
      const length = segments.reduce((a, b) => a + b, 0)
      if (Math.min(...segments) < epsilon || length < epsilon) return undefined
      const straightness = (a: Point, b: Point, c: Point) => {
        const dot = (a.x - b.x) * (c.x - b.x) + (a.y - b.y) * (c.y - b.y) + (a.z - b.z) * (c.z - b.z)
        const angle = Math.acos(Math.max(-1, Math.min(1, dot / (dist(a, b) * dist(c, b)))))
        return clamp((angle - Math.PI * .35) / (Math.PI * .55))
      }
      const angles = (straightness(mcp, pip, dip) + straightness(pip, dip, tip)) / 2
      const reach = clamp((dist(mcp, tip) / length - .4) / .5)
      if (!(metricPalm > epsilon)) return undefined
      // Angles alone overestimate long fingers curled back toward the palm.
      // Absolute reach and distance away from the wrist disambiguate that case,
      // independent of which way the hand points in the image.
      const palmReach = clamp((dist(mcp, tip) / metricPalm - .25) / .65)
      const outward = clamp((dist(points[0], tip) / Math.max(epsilon, dist(points[0], mcp)) - .85) / .65)
      const extended = Math.min(.7 * angles + .3 * reach, palmReach, outward)
      return { extended, folded: clamp((.85 - extended) / .65) }
    }
    const fingers = [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]].map(finger)
    const thumbSpread = metricValid(points[4]) && metricPalm > epsilon
      ? clamp((dist(points[4], points[5]) / metricPalm - .35) / .55) : undefined
    const central = fingers.slice(0, 3).flatMap(f => f ? [f.folded] : [])
    // A soft weakest-link score preserves moderate evidence without multiplying
    // several uncertain probabilities. Index curl rejects rock-on; central curl
    // rejects an open palm; pinky reach rejects thumbs-up and a fist.
    const callMe = thumbSpread !== undefined && fingers[3] && central.length >= 2
      ? clamp((Math.min(thumbSpread, fingers[3].extended, mean(central),
        fingers[0]?.folded ?? mean(central)) - .15) / .65) : undefined
    return [{ handIndex, hand, palm, fingers, thumbSpread, callMe }]
  })
}

/** Per-hand scores in [0, 1]; unavailable geometry stays undefined. No confidence/visibility gate. */
export function getHandShapeDiagnostics(frame: TrackingFrame, aspectRatio = 4 / 3, worldHands?: Point[][]) {
  return analyzeHands(frame, safeAspect(aspectRatio), worldHands).map(h => ({
    handIndex: h.handIndex,
    indexExtended: h.fingers[0]?.extended,
    middleExtended: h.fingers[1]?.extended,
    ringExtended: h.fingers[2]?.extended,
    pinkyExtended: h.fingers[3]?.extended,
    thumbSpread: h.thumbSpread,
    callMe: h.callMe,
  }))
}

/** Geometric human approximations, not expression/gesture classifiers. Missing data stays missing. */
export function extractCatFeatures(frame: TrackingFrame, aspectRatio = 4 / 3, worldHands?: Point[][]): Features {
  const features: Features = {}
  const aspect = safeAspect(aspectRatio)
  const distance = (a: Point, b: Point) => Math.hypot((a.x - b.x) * aspect, a.y - b.y)
  const face = frame.face
  const ears: number[] = []
  for (const [outer, inner, top, bottom] of [[33, 133, 159, 145], [362, 263, 386, 374]]) {
    if (![outer, inner, top, bottom].every(i => valid(face[i]))) continue
    const width = distance(face[outer], face[inner])
    if (width > epsilon) ears.push(clamp(distance(face[top], face[bottom]) / width / 0.3))
  }
  if (ears.length) features.eyesOpen = ears.reduce((sum, ear) => sum + ear, 0) / ears.length

  if ([33, 133, 362, 263, 1, 152].every(i => valid(face[i]))) {
    const left = { x: (face[33].x + face[133].x) / 2, y: (face[33].y + face[133].y) / 2 }
    const right = { x: (face[362].x + face[263].x) / 2, y: (face[362].y + face[263].y) / 2 }
    const eyeWidth = distance(left as Point, right as Point)
    if (eyeWidth > epsilon) {
      // Project onto the eye vector's perpendicular to remove image-plane head roll.
      const downX = -(right.y - left.y) / eyeWidth
      const downY = (right.x - left.x) * aspect / eyeWidth
      const project = (point: Point) => (point.x - (left.x + right.x) / 2) * aspect * downX
        + (point.y - (left.y + right.y) / 2) * downY
      const head = project(face[152])
      if (Math.abs(head) > epsilon) {
        // Approximate pitch only: neutral nose/eye-to-chin ratio ~0.42; larger means down.
        const ratio = project(face[1]) / head
        if (Number.isFinite(ratio)) {
          features.headDown = clamp((ratio - 0.45) / 0.3)
          features.headUp = clamp((0.4 - ratio) / 0.3)
        }
      }
    }
  }

  const hands = analyzeHands(frame, aspect, worldHands)
  if (hands.length) {
    const fists = hands.flatMap(({ fingers }) => {
      const folded = fingers.flatMap(f => f ? [f.folded] : []).sort((a, b) => b - a)
      // Three curled fingers alone also occur in pointing and call-me gestures.
      // A visible straight index or pinky must therefore contradict a fist.
      const indexPenalty = fingers[0] ? fingers[0].folded : 1
      return folded.length >= 3 ? [mean(folded.slice(0, 3)) * Math.min(indexPenalty, fingers[3]?.folded ?? 1)] : []
    })
    if (fists.length) features.fist = Math.max(...fists)
    const calls = hands.flatMap(h => h.callMe === undefined ? [] : [h.callMe])
    if (calls.length) features.callMe = Math.max(...calls)
    // Keep fist independent: a noisy, moderate call-me must not suppress it.
    features.fingersTogether = 0
    for (let i = 0; i < hands.length; i++) {
      for (let j = i + 1; j < hands.length; j++) {
        const a = hands[i], b = hands[j]
        if (!a.fingers[0] || !b.fingers[0] || !valid(a.hand[8]) || !valid(b.hand[8])) continue
        const palm = (a.palm + b.palm) / 2
        const proximity = clamp(1 - distance(a.hand[8], b.hand[8]) / (palm * 1.5))
        // Opposing projected index directions distinguish touching indices from
        // two parallel open hands. No chin/face location restriction.
        const direction = (h: Point[]) => [(h[8].x - h[5].x) * aspect, h[8].y - h[5].y]
        const u = direction(a.hand), v = direction(b.hand)
        const lengths = Math.hypot(...u) * Math.hypot(...v)
        if (lengths < epsilon) continue
        const opposition = clamp((.3 - (u[0] * v[0] + u[1] * v[1]) / lengths) / 1.1)
        const shape = mean([a.fingers[0].extended, b.fingers[0].extended])
        features.fingersTogether = Math.max(features.fingersTogether, proximity * shape * opposition)
      }
    }
    // Face-relative proximity also works when shoulders/pose are outside frame.
    if (valid(face[1]) && valid(face[152])) {
      const height = valid(face[10]) ? distance(face[10], face[152]) : distance(face[1], face[152]) * 2
      if (height > epsilon) {
        const distances = hands.map(({ hand }) => {
          const center = { ...hand[0], x: (hand[0].x + hand[5].x + hand[9].x + hand[17].x) / 4,
            y: (hand[0].y + hand[5].y + hand[9].y + hand[17].y) / 4 }
          return Math.min(distance(center, face[1]), distance(hand[0], face[1]))
        })
        features.handsNearFace = clamp(1.4 - Math.min(...distances) / height)
      }
    }
  }
  // Tongue visibility is measured separately from pixels, never mouth geometry.
  return features
}
