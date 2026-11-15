import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzeTongue, extractTongueDescriptor, TongueDetector } from './tongue'
import type { Point } from './overlay'
import { buildTongueProfile, scorePersonalTongue } from './tongue-calibration'

const skin = [186, 137, 112]
const dark = [65, 15, 23]
const pink = [223, 83, 104]
function fixture() {
  const width = 100, height = 100
  const data = new Uint8ClampedArray(width * height * 4)
  const image = { width, height, data, colorSpace: 'srgb' } as ImageData
  const face: Point[] = []
  for (const [id, x, y] of [[78, .25, .45], [81, .35, .38], [13, .5, .38], [311, .65, .38],
    [308, .75, .45], [402, .65, .58], [14, .5, .60], [178, .35, .58], [50, .12, .4], [280, .88, .4]]) {
    face[id] = { x, y, z: 0 }
  }
  const paint = (x0: number, y0: number, x1: number, y1: number, color: number[]) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data.set([...color, 255], (y * width + x) * 4)
  }
  paint(0, 0, 100, 100, skin)
  return { image, face, paint }
}

describe('experimental tongue pixel heuristic', () => {
  it('rejects skin-only mouth aperture rather than inferring tongue from opening', () => {
    const { image, face } = fixture()
    expect(analyzeTongue(image, face)).toEqual({ score: 0, valid: true })
  })

  it('rejects a dark red cavity and white teeth', () => {
    const { image, face, paint } = fixture()
    paint(27, 40, 73, 59, dark)
    expect(analyzeTongue(image, face)).toEqual({ score: 0, valid: true })
    paint(35, 40, 65, 48, [245, 242, 230])
    expect(analyzeTongue(image, face)).toEqual({ score: 0, valid: true })
  })

  it('detects a lower central pink mass filling the aperture and protruding below', () => {
    const { image, face, paint } = fixture()
    paint(27, 40, 73, 59, dark)
    paint(39, 48, 61, 70, pink)
    const result = analyzeTongue(image, face)
    expect(result.valid).toBe(true)
    expect(result.score).toBeGreaterThan(.8)
  })

  it('detects a pink mass within the aperture, without needing protrusion', () => {
    const { image, face, paint } = fixture()
    paint(27, 40, 73, 59, dark)
    paint(36, 47, 64, 59, pink)
    expect(analyzeTongue(image, face).score).toBeGreaterThan(.6)
  })

  it.each([
    ['dim exposure', .45, [1, 1, 1]],
    ['warm white balance', .8, [1.12, 1, .75]],
    ['cool white balance', .7, [.8, 1, 1.15]],
  ])('keeps protruding tongue evidence under %s', (_name, exposure, balance) => {
    const { image, face, paint } = fixture()
    paint(27, 40, 73, 59, dark)
    paint(39, 48, 61, 70, [190, 116, 127])
    for (let i = 0; i < image.data.length; i += 4) for (let c = 0; c < 3; c++) {
      image.data[i + c] *= exposure * balance[c]!
    }
    expect(analyzeTongue(image, face).valid).toBe(true)
    expect(analyzeTongue(image, face).score).toBeGreaterThan(.6)
  })

  it.each([
    [.45, [1, 1, 1]], [.8, [1.12, 1, .75]], [.7, [.8, 1, 1.15]],
  ])('rejects skin, cavity and teeth under changed exposure %s', (exposure, balance) => {
    for (const color of [skin, dark, [245, 242, 230]]) {
      const { image, face, paint } = fixture()
      paint(27, 40, 73, 59, color)
      for (let i = 0; i < image.data.length; i += 4) for (let c = 0; c < 3; c++) image.data[i + c] *= exposure * balance[c]!
      expect(analyzeTongue(image, face).score).toBe(0)
    }
  })

  it('finds protrusion even when face landmarks estimate almost closed lips', () => {
    const { image, face, paint } = fixture()
    for (const id of [81, 13, 311]) face[id].y = .445
    for (const id of [402, 14, 178]) face[id].y = .455
    paint(39, 44, 61, 64, pink)
    expect(analyzeTongue(image, face).score).toBeGreaterThan(.6)
  })

  it('rejects a thin red lower lip and a tongue-colored upper lip', () => {
    const { image, face, paint } = fixture()
    paint(34, 57, 66, 60, pink)
    expect(analyzeTongue(image, face).score).toBeLessThan(.45)
    paint(0, 0, 100, 100, skin)
    paint(33, 38, 67, 42, pink)
    expect(analyzeTongue(image, face).score).toBeLessThan(.45)
  })

  it('requires a connected lower-central component, rejecting lipstick and scattered pixels', () => {
    const { image, face, paint } = fixture()
    paint(26, 40, 32, 56, pink)
    paint(67, 40, 73, 56, pink)
    for (let x = 35; x < 65; x += 4) paint(x, 52, x + 1, 53, pink)
    expect(analyzeTongue(image, face).score).toBe(0)
  })

  it('uses local skin contrast, not a fixed red-color label', () => {
    const { image, face, paint } = fixture()
    paint(0, 0, 100, 100, pink)
    expect(analyzeTongue(image, face)).toEqual({ score: 0, valid: true })
  })

  it('returns a negative measurement for an observable closed mouth', () => {
    const { image, face } = fixture()
    face[14].y = face[13].y + .01
    expect(analyzeTongue(image, face)).toEqual({ score: 0, valid: true })
  })

  it('leaves absent/invalid/tiny or unobservable mouth observations unknown', () => {
    const { image, face, paint } = fixture()
    expect(analyzeTongue(image, [])).toEqual({ score: 0, valid: false })
    face[13].x = NaN
    expect(analyzeTongue(image, face).valid).toBe(false)
    face[13].x = .5
    face[13].y = Infinity
    expect(analyzeTongue(image, face).valid).toBe(false)
    face[13].y = .38
    paint(0, 0, 100, 100, [10, 8, 7])
    expect(analyzeTongue(image, face).valid).toBe(false)
    expect(analyzeTongue({ ...image, width: 4 } as ImageData, face).valid).toBe(false)
  })
})

// Minimal pixel-backed canvas exercises the actual video crop and projection path.
function mockCanvas(image: ImageData) {
  let crop = [0, 0, image.width, image.height]
  const canvas = { width: 0, height: 0, getContext: () => context }
  const context = {
    drawImage: (_video: unknown, x: number, y: number, width: number, height: number) => {
      crop = [x, y, width, height]
    },
    getImageData: () => {
      const data = new Uint8ClampedArray(canvas.width * canvas.height * 4)
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        const sx = Math.min(image.width - 1, Math.floor(crop[0] + (x + .5) * crop[2] / canvas.width))
        const sy = Math.min(image.height - 1, Math.floor(crop[1] + (y + .5) * crop[3] / canvas.height))
        data.set(image.data.slice((sy * image.width + sx) * 4, (sy * image.width + sx) * 4 + 4), (y * canvas.width + x) * 4)
      }
      return { width: canvas.width, height: canvas.height, data } as ImageData
    },
  }
  vi.stubGlobal('document', { createElement: () => canvas })
  return canvas
}

const video = { videoWidth: 100, videoHeight: 100 } as HTMLVideoElement

describe('TongueDetector diagnostics and crop', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('accepts all-zero/omitted confidence fields in direct analysis and video crops', () => {
    for (const confidence of [undefined, 0, .1, NaN]) {
      const { image, face, paint } = fixture()
      paint(27, 40, 73, 59, dark)
      paint(39, 48, 61, 70, pink)
      const landmarks = face.map(p => ({ ...p, visibility: confidence, presence: confidence }))
      expect(analyzeTongue(image, landmarks).score).toBeGreaterThan(.8)
      mockCanvas(image)
      const detector = new TongueDetector()
      expect(detector.detect(video, landmarks)).toBeGreaterThan(.8)
      expect(detector.diagnostics).toMatchObject({ reason: 'tongue detected', score: expect.any(Number) })
      expect(detector.diagnostics.crop!.width).toBeGreaterThan(8)
    }
  })

  it('preserves lower-mouth geometry and cheek samples through a rolled video crop', () => {
    const { image, face, paint } = fixture()
    paint(27, 40, 73, 59, dark)
    paint(39, 48, 61, 70, pink)
    const data = new Uint8ClampedArray(image.data.length)
    for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) {
      data.set(image.data.slice((y * 100 + x) * 4, (y * 100 + x) * 4 + 4), (x * 100 + 99 - y) * 4)
    }
    mockCanvas({ ...image, data })
    const rolled = face.map(p => ({ ...p, x: 1 - p.y, y: p.x, visibility: 0, presence: 0 }))
    expect(new TongueDetector().detect(video, rolled)).toBeGreaterThan(.8)
  })

  it('keeps pixel geometry on non-square video with asymmetric crops', () => {
    const { image, face, paint } = fixture()
    paint(27, 40, 73, 59, dark)
    paint(39, 48, 61, 70, pink)
    const width = 300, height = 120
    const data = new Uint8ClampedArray(width * height * 4)
    for (let i = 0; i < width * height; i++) data.set([...skin, 255], i * 4)
    for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) {
      data.set(image.data.slice((y * 100 + x) * 4, (y * 100 + x) * 4 + 4), ((y + 5) * width + x + 120) * 4)
    }
    mockCanvas({ width, height, data } as ImageData)
    const landmarks = face.map(p => ({ ...p, x: (p.x * 100 + 120) / width, y: (p.y * 100 + 5) / height }))
    const detector = new TongueDetector()
    expect(detector.detect({ videoWidth: width, videoHeight: height } as HTMLVideoElement, landmarks)).toBeGreaterThan(.8)
    expect(detector.diagnostics.reason).toBe('tongue detected')
  })

  it('distinguishes missing landmarks, small crops, unavailable canvas, lighting and negatives', () => {
    const { image, face, paint } = fixture()
    const detector = new TongueDetector()
    expect(detector.detect(video, [])).toBeUndefined()
    expect(detector.diagnostics.reason).toBe('face landmarks missing')
    expect(detector.detect({ videoWidth: 4, videoHeight: 4 } as HTMLVideoElement, face)).toBeUndefined()
    expect(detector.diagnostics.reason).toBe('crop too small')
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) })
    expect(detector.detect(video, face)).toBeUndefined()
    expect(detector.diagnostics.reason).toBe('canvas unavailable')
    mockCanvas(image)
    const working = new TongueDetector()
    expect(working.detect(video, face)).toBe(0)
    expect(working.diagnostics).toMatchObject({ reason: 'no tongue', score: 0 })
    paint(0, 0, 100, 100, [10, 8, 7])
    expect(working.detect(video, face)).toBeUndefined()
    expect(working.diagnostics.reason).toBe('insufficient lighting')
    expect(working.diagnostics.score).toBeUndefined()
    expect(working.detect(video, [])).toBeUndefined()
    expect(working.diagnostics).toEqual({ reason: 'face landmarks missing', source: 'unavailable' })
  })
})


describe('personal mouth descriptors', () => {
  afterEach(() => vi.unstubAllGlobals())
  const sample = (kind: 'closed' | 'open' | 'tongue') => {
    const f = fixture()
    if (kind === 'closed') {
      for (const id of [81, 13, 311]) f.face[id].y = .445
      for (const id of [402, 14, 178]) f.face[id].y = .455
    } else {
      f.paint(27, 40, 73, 59, dark)
      if (kind === 'tongue') f.paint(36, 48, 64, 72, pink)
    }
    return f
  }

  it('distinguishes tongue from explicitly trained OPEN-cavity and closed negatives', () => {
    const descriptor = (kind: 'closed' | 'open' | 'tongue') => {
      const { image, face } = sample(kind)
      return extractTongueDescriptor(image, face)!
    }
    const closed = descriptor('closed'), open = descriptor('open'), tongue = descriptor('tongue')
    const closedFrame = sample('closed')
    mockCanvas(closedFrame.image)
    const detector = new TongueDetector()
    detector.detect(video, closedFrame.face)
    expect(detector.observation).toBeDefined()
    expect(detector.diagnostics.calibrationReady).toBe(true)
    expect(closed.every(Number.isFinite)).toBe(true)
    expect(closed.length).toBe(107)
    const profile = buildTongueProfile([closed, open, open, open, open, closed], Array.from({ length: 6 }, () => tongue))
    expect(scorePersonalTongue(tongue, profile)).toBeGreaterThan(.8)
    expect(scorePersonalTongue(open, profile)).toBeLessThan(.3)
    expect(scorePersonalTongue(closed, profile)).toBeLessThan(.5)
  })

  it('exposes fresh video observations, supports profiles, and never falls back on OOD', () => {
    const f = sample('tongue')
    mockCanvas(f.image)
    const detector = new TongueDetector()
    detector.detect(video, f.face)
    const positive = detector.observation!
    expect(positive).toBeDefined()
    const altered = detector.observation!
    altered[0] = 999
    expect(detector.observation![0]).not.toBe(999)
    const negative = positive.map(v => v - .15)
    const profile = buildTongueProfile(Array(5).fill(negative), Array(5).fill(positive))
    expect(detector.detect(video, f.face, profile)).toBeCloseTo(1)
    expect(detector.diagnostics).toMatchObject({ source: 'personal', calibrationReady: true })
    const foreign = buildTongueProfile(Array(5).fill(negative.map(v => v + 2)), Array(5).fill(positive.map(v => v + 2)))
    expect(detector.detect(video, f.face, foreign)).toBeUndefined()
    expect(detector.diagnostics.source).toBe('unavailable')
    detector.detect(video, [])
    expect(detector.observation).toBeUndefined()
  })

  it('does not collect descriptors from invalid geometry, transparent pixels or dark lighting', () => {
    const { image, face, paint } = fixture()
    expect(extractTongueDescriptor(image, [])).toBeUndefined()
    image.data.fill(0)
    expect(extractTongueDescriptor(image, face)).toBeUndefined()
    paint(0, 0, 100, 100, [10, 8, 7])
    expect(extractTongueDescriptor(image, face)).toBeUndefined()
  })
})
