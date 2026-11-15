import { describe, expect, it } from 'vitest'
import fixture from './fixtures/mediapipe-output.json'
import { extractCatFeatures } from './cat-features'

describe('real MediaPipe inference outputs, not hand-authored points', () => {
  it('processes real image/world hand points whose unsupported visibility defaults to zero', () => {
    const { hand } = fixture
    expect(hand.landmarks[0][0].visibility).toBe(0)
    expect(hand.worldLandmarks[0][0].visibility).toBe(0)
    const features = extractCatFeatures({ face: [], hands: hand.landmarks, pose: [] }, hand.aspect, hand.worldLandmarks)
    expect(features.fist).toBeDefined()
    expect(features.callMe).toBeDefined()
    expect(features.fingersTogether).toBeDefined()
    expect(Object.values(features).every(Number.isFinite)).toBe(true)
  })
  it('processes real face points whose unsupported visibility defaults to zero', () => {
    const { face } = fixture
    expect(face.landmarks[0].visibility).toBe(0)
    const features = extractCatFeatures({ face: face.landmarks, hands: [], pose: [] }, face.aspect)
    expect(features.eyesOpen).toBeGreaterThan(0)
    expect(features.headDown).toBeDefined()
    expect(features.headUp).toBeDefined()
  })
})
