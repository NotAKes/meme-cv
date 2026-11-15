import { describe, expect, it } from 'vitest'
import fixture from './fixtures/mediapipe-output.json'
import { extractCatFeatures, getHandShapeDiagnostics } from './cat-features'
import type { Point, TrackingFrame } from './overlay'

const point = (x: number, y: number): Point => ({ x, y, z: 0 })
const frame = (): TrackingFrame => ({ face: [], pose: [], hands: [] })
function faceFrame(noseRatio = 0.42): TrackingFrame {
  const result = frame()
  for (const [index, x, y] of [[33, .2, .3], [133, .4, .3], [159, .3, .26], [145, .3, .34],
    [362, .6, .3], [263, .8, .3], [386, .7, .26], [374, .7, .34],
    [1, .5, .3 + .5 * noseRatio], [152, .5, .8]]) result.face[index] = point(x, y)
  return result
}
function hand(kind: 'open' | 'fist' | 'callMe' | 'index', offset = 0): Point[] {
  const result = Array.from({ length: 21 }, () => point(offset, .8))
  for (const [finger, mcp, x] of [[0, 5, -.07], [1, 9, 0], [2, 13, .05], [3, 17, .1]]) {
    const extended = kind === 'open' || (kind === 'callMe' && finger === 3) || (kind === 'index' && finger === 0)
    result[mcp] = point(offset + x, .6)
    result[mcp + 1] = point(offset + x, .51)
    result[mcp + 2] = { ...point(offset + x, extended ? .44 : .55), z: extended ? 0 : -.035 }
    result[mcp + 3] = { ...point(offset + x, extended ? .38 : .61), z: extended ? 0 : -.02 }
  }
  const extended = kind === 'callMe' || kind === 'open'
  result[1] = point(offset - .07, .75)
  result[2] = point(offset - .13, .7)
  result[3] = point(offset - (extended ? .19 : .09), extended ? .65 : .67)
  result[4] = point(offset - (extended ? .25 : .04), extended ? .60 : .7)
  return result
}

// Rotate both index hands toward the center, well below a hypothetical chin.
function touching(kind: 'open' | 'index' = 'index'): Point[][] {
  const a = hand(kind).map(p => ({ x: .45 - (p.y - .38), y: .8 + (p.x + .07) * 4 / 3, z: p.z }))
  const b = hand(kind).map(p => ({ x: .455 + (p.y - .38), y: .8 + (p.x + .07) * 4 / 3, z: p.z }))
  return [a, b]
}

describe('extractCatFeatures', () => {
  it('preserves unknown measurements, including absent hands and tongue', () => {
    expect(extractCatFeatures(frame())).toEqual({})
    expect(extractCatFeatures(faceFrame())).not.toHaveProperty('fist')
    expect(extractCatFeatures(faceFrame())).not.toHaveProperty('tongue')
  })

  it('ignores visibility/presence for every face, image-hand and world-hand landmark', () => {
    for (const confidence of [undefined, 0, .1, NaN]) {
      for (const kind of ['open', 'fist', 'callMe'] as const) {
        const input = faceFrame(.8)
        input.hands = [hand(kind, .5)]
        const world = [hand(kind)]
        const baseline = extractCatFeatures(input, 1, world)
        const diagnostics = getHandShapeDiagnostics(input, 1, world)
        const confidenceFields = (p: Point) => ({ ...p, visibility: confidence, presence: confidence })
        input.face = input.face.map(confidenceFields)
        input.hands = input.hands.map(h => h.map(confidenceFields))
        expect(extractCatFeatures(input, 1, world.map(h => h.map(confidenceFields)))).toEqual(baseline)
        expect(getHandShapeDiagnostics(input, 1, world.map(h => h.map(confidenceFields)))).toEqual(diagnostics)
        expect(extractCatFeatures(input).eyesOpen).toBeGreaterThan(0)
        expect(extractCatFeatures(input).handsNearFace).toBeGreaterThan(0)
      }
      const input = frame()
      input.hands = touching().map(h => h.map(p => ({ ...p, visibility: confidence, presence: confidence })))
      expect(extractCatFeatures(input).fingersTogether).toBeGreaterThan(.9)
    }
  })

  it('normalizes eyelid distance by eye width and image aspect', () => {
    expect(extractCatFeatures(faceFrame()).eyesOpen).toBeCloseTo(1)
    expect(extractCatFeatures(faceFrame(), 2).eyesOpen).toBeCloseTo(2 / 3)
    const closed = faceFrame()
    closed.face[159].y = closed.face[145].y
    closed.face[386].y = closed.face[374].y
    expect(extractCatFeatures(closed).eyesOpen).toBe(0)
    closed.face[159].x = NaN
    closed.face[386].y = Infinity
    expect(extractCatFeatures(closed).eyesOpen).toBeUndefined()
  })

  it('estimates neutral/up/down pitch and compensates for roll', () => {
    expect(extractCatFeatures(faceFrame())).toMatchObject({ headDown: 0, headUp: 0 })
    expect(extractCatFeatures(faceFrame(.8)).headDown).toBe(1)
    expect(extractCatFeatures(faceFrame(.05)).headUp).toBe(1)
    const original = faceFrame(.6)
    const rolled = { ...original, face: original.face.map(p => point(
      (p.x * (4 / 3) * Math.cos(.7) - p.y * Math.sin(.7)) / (4 / 3),
      p.x * (4 / 3) * Math.sin(.7) + p.y * Math.cos(.7))) }
    expect(extractCatFeatures(rolled).headDown).toBeCloseTo(extractCatFeatures(original).headDown!)
  })

  it('distinguishes folded fingers and call-me from an arbitrary open hand', () => {
    const input = frame()
    input.hands = [hand('open')]
    expect(extractCatFeatures(input)).toEqual({ fist: 0, callMe: 0, fingersTogether: 0 })
    input.hands = [hand('index')]
    expect(extractCatFeatures(input).fist).toBeLessThan(.2)
    input.hands = [hand('fist')]
    expect(extractCatFeatures(input).fist).toBe(1)
    expect(extractCatFeatures(input).callMe).toBeLessThan(.2)
    input.hands = [hand('callMe')]
    expect(extractCatFeatures(input).callMe).toBe(1)
    expect(extractCatFeatures(input).fist).toBe(0)
  })

  it('recognizes a shaka with a sharply bent thumb IP, not a straight thumb chain', () => {
    const input = frame()
    const bent = hand('callMe')
    bent[3] = point(-.24, .64)
    bent[4] = point(-.22, .70)
    input.hands = [bent]
    for (const world of [undefined, [bent]]) {
      expect(extractCatFeatures(input, 1, world).callMe).toBeGreaterThan(.9)
      const [diagnostic] = getHandShapeDiagnostics(input, 1, world)
      expect(diagnostic.thumbSpread).toBeGreaterThan(.9)
      expect(diagnostic.pinkyExtended).toBeGreaterThan(.9)
      expect(diagnostic.indexExtended).toBeLessThan(.2)
      expect(diagnostic.callMe).toBe(extractCatFeatures(input, 1, world).callMe)
    }
  })

  it('retains useful soft call-me evidence with partially folded central fingers', () => {
    const input = frame()
    const partial = hand('callMe')
    for (const mcp of [5, 9, 13]) {
      partial[mcp + 1].y = .50
      partial[mcp + 2] = { ...partial[mcp + 2], y: .49, z: -.035 }
      partial[mcp + 3] = { ...partial[mcp + 3], y: .54, z: -.06 }
    }
    input.hands = [partial]
    const [diagnostic] = getHandShapeDiagnostics(input, 1)
    expect(diagnostic.indexExtended).toBeGreaterThan(.15)
    expect(diagnostic.indexExtended).toBeLessThan(.65)
    expect(diagnostic.callMe).toBeGreaterThan(.65)
  })

  it('rejects open palm, fist, thumbs-up and rock-on with index plus pinky', () => {
    const thumbUp = hand('fist')
    for (const i of [1, 2, 3, 4]) thumbUp[i] = hand('open')[i]
    const rockOn = hand('callMe')
    for (const i of [5, 6, 7, 8]) rockOn[i] = hand('open')[i]
    for (const negative of [hand('open'), hand('fist'), thumbUp, rockOn]) {
      const input = { ...frame(), hands: [negative] }
      expect(extractCatFeatures(input, 1).callMe).toBeLessThan(.15)
      expect(extractCatFeatures(input, 1, [negative]).callMe).toBeLessThan(.15)
    }
    // Actual upstream thumb_up.jpg inference has zero visibility everywhere.
    const input = { ...frame(), hands: fixture.hand.landmarks }
    expect(extractCatFeatures(input, fixture.hand.aspect).callMe).toBeLessThan(.15)
    expect(extractCatFeatures(input, fixture.hand.aspect, fixture.hand.worldLandmarks).callMe).toBeLessThan(.15)
  })

  it('uses reach toward the palm/wrist as well as angles for long down-curled fingers', () => {
    const curled = hand('callMe')
    for (const mcp of [5, 9, 13]) {
      curled[mcp + 1].y = .45
      curled[mcp + 2].y = .62
      curled[mcp + 3].y = .75
    }
    const input = { ...frame(), hands: [curled] }
    const [diagnostic] = getHandShapeDiagnostics(input, 1)
    expect(diagnostic.indexExtended).toBeLessThan(.15)
    expect(diagnostic.middleExtended).toBeLessThan(.15)
    expect(diagnostic.ringExtended).toBeLessThan(.15)
    expect(diagnostic.callMe).toBeGreaterThan(.9)
  })

  it('keeps diagnostics invariant through wrist rolls, mirrors, and 3D rotations', () => {
    const original = hand('callMe')
    original[3] = point(-.24, .64)
    original[4] = point(-.22, .70)
    const baseline = getHandShapeDiagnostics({ ...frame(), hands: [original] }, 1)[0]
    for (const angle of [0, .7, Math.PI, -1.4]) {
      for (const mirror of [1, -1]) {
        const metric = original.map(p => ({
          x: mirror * (p.x * Math.cos(angle) - p.y * Math.sin(angle)),
          y: p.x * Math.sin(angle) + p.y * Math.cos(angle), z: p.z,
        })).map(p => ({ x: p.x * Math.cos(.8) + p.z * Math.sin(.8),
          y: p.y, z: -p.x * Math.sin(.8) + p.z * Math.cos(.8) }))
        const aspect = 1.8
        const image = metric.map(p => ({ x: p.x / aspect + .5, y: p.y, z: p.z / aspect }))
        for (const world of [undefined, [metric]]) {
          const [diagnostic] = getHandShapeDiagnostics({ ...frame(), hands: [image] }, aspect, world)
          for (const key of ['indexExtended', 'middleExtended', 'ringExtended', 'pinkyExtended', 'thumbSpread', 'callMe'] as const) {
            expect(diagnostic[key]).toBeCloseTo(baseline[key]!)
          }
        }
      }
    }
  })

  it('does not suppress the fist fallback using an unrelated hand call-me score', () => {
    const input = { ...frame(), hands: [hand('fist'), hand('callMe')] }
    expect(extractCatFeatures(input, 1)).toMatchObject({ fist: 1, callMe: 1 })
    const diagnostic = getHandShapeDiagnostics(input, 1)
    expect(diagnostic.map(h => h.handIndex)).toEqual([0, 1])
    expect(diagnostic.map(h => h.callMe)).toEqual([0, 1])
  })

  it('keeps fist evidence independent of moderate noisy thumb spread', () => {
    const uncertain = hand('callMe')
    uncertain[4] = point(-.16, .66)
    uncertain[20].y = .45
    const input = { ...frame(), hands: [uncertain] }
    const moderate = extractCatFeatures(input, 1)
    expect(moderate.fist).toBeGreaterThan(0)
    expect(moderate.callMe).toBeGreaterThan(.25)
    expect(moderate.callMe).toBeLessThan(.75)
    uncertain[4] = hand('fist')[4]
    expect(extractCatFeatures(input, 1).fist).toBe(moderate.fist)
  })

  it('detects opposing straight indices without requiring other fingers folded or a chin', () => {
    const input = faceFrame()
    input.hands = touching()
    expect(extractCatFeatures(input).fingersTogether).toBeGreaterThan(.9)
    input.hands = touching('open')
    expect(extractCatFeatures(input).fingersTogether).toBeGreaterThan(.9)
    input.hands[1] = input.hands[1].map(p => ({ ...p, x: p.x + .9 }))
    expect(extractCatFeatures(input).fingersTogether).toBe(0)
    input.hands = [hand('index'), hand('index', .005)]
    expect(extractCatFeatures(input).fingersTogether).toBe(0)
    input.hands = [hand('index')]
    expect(extractCatFeatures(input).fingersTogether).toBe(0)
  })

  it('keeps 3D topology stable for sideways/facing camera hands and world landmarks', () => {
    const rotate = (p: Point) => ({ x: .5 + p.z, y: p.y, z: -p.x })
    for (const kind of ['open', 'fist', 'callMe'] as const) {
      const input = frame()
      input.hands = [hand(kind)]
      const baseline = extractCatFeatures(input, 1)
      input.hands = [input.hands[0].map(rotate)]
      const rotated = extractCatFeatures(input, 1)
      expect(rotated.fist).toBeCloseTo(baseline.fist!)
      expect(rotated.callMe).toBeCloseTo(baseline.callMe!)
      // Even a foreshortened/incorrect image topology must defer to world 3D.
      const metric = [hand(kind).map(p => ({ ...p, x: p.x * .1, y: p.y * .1, z: p.z * .1 }))]
      const withWorld = extractCatFeatures(input, 1, metric)
      expect(withWorld.callMe).toBeCloseTo(baseline.callMe!)
      expect(withWorld.fist).toBeCloseTo(baseline.fist!)
    }
  })

  it('tolerates an occluded finger and three curled fingers', () => {
    const input = frame()
    input.hands = [hand('fist')]
    input.hands[0][12].z = NaN
    expect(extractCatFeatures(input).fist).toBeGreaterThan(.9)
    input.hands[0][12].z = 0
    const extended = hand('index')
    for (const i of [6, 7, 8]) input.hands[0][i] = extended[i]
    expect(extractCatFeatures(input).fist).toBeLessThan(.2)
  })

  it('measures hand-near-face even without shoulders', () => {
    const input = faceFrame()
    input.hands = [hand('open', .5)]
    expect(extractCatFeatures(input).handsNearFace).toBeGreaterThan(.7)
  })

  it('omits invalid/degenerate observations and never emits NaN or unbounded values', () => {
    const input = frame()
    input.face = Array.from({ length: 468 }, () => point(0, 0))
    input.hands = [Array.from({ length: 21 }, () => point(0, 0))]
    expect(extractCatFeatures(input)).toEqual({})
    input.face[33].x = NaN
    input.hands[0][8].y = Infinity
    expect(extractCatFeatures(input, NaN)).toEqual({})
    for (const aspect of [NaN, Infinity, 0, -1, 1, 100]) {
      const visible = faceFrame(.9)
      visible.hands = [hand('callMe'), hand('fist')]
      for (const value of Object.values(extractCatFeatures(visible, aspect))) {
        expect(Number.isFinite(value)).toBe(true)
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(1)
      }
    }
  })
})
