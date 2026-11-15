import { describe, expect, it } from 'vitest'
import { classifyHandGestures } from './hand-gestures'
import { rankMemes } from './matching'

describe('learned fist and custom shaka fusion', () => {
  it('replaces ambiguous geometric fist evidence with the learned Closed_Fist class', () => {
    const result = classifyHandGestures([{ handIndex: 0, callMe: .45 }], [[{ categoryName: 'Closed_Fist', score: .92 }]])
    expect(result.features).toEqual({ fist: .92, callMe: 0 })
    expect(rankMemes({ mouthOpen: 0, eyesOpen: .72, ...result.features }, 'combined')[0].meme.id).toBe('fist-cat')
  })
  it('does not require mouth/tongue/shoulders/face distance to match call-me', () => {
    const result = classifyHandGestures([{ handIndex: 0, callMe: .85 }], [[{ categoryName: 'None', score: .9 }]])
    expect(result.features).toEqual({ fist: 0, callMe: .85 })
    for (const mouthOpen of [undefined, 0, 1]) {
      expect(rankMemes({ mouthOpen, tongueOut: 0, ...result.features }, 'combined')[0].meme.id).toBe('call-me-cat')
    }
  })
  it.each(['Open_Palm', 'Thumb_Up', 'Thumb_Down', 'Pointing_Up', 'Victory', 'ILoveYou'])('rejects %s rather than relabeling it as a phone', label => {
    expect(classifyHandGestures([{ handIndex: 0, callMe: .7 }], [[{ categoryName: label, score: .9 }]]).features)
      .toEqual({ fist: 0, callMe: 0 })
  })
  it('does not let a fist on one hand suppress call-me on the other', () => {
    const result = classifyHandGestures([{ handIndex: 0, callMe: .4 }, { handIndex: 1, callMe: .9 }], [
      [{ categoryName: 'Closed_Fist', score: .9 }], [{ categoryName: 'None', score: .9 }],
    ])
    expect(result.features).toEqual({ fist: .9, callMe: .9 })
  })
  it('keeps absent hands unknown and ignores invalid classifier scores', () => {
    expect(classifyHandGestures([], []).features).toEqual({})
    expect(classifyHandGestures([{ handIndex: 0 }], [[{ categoryName: 'Closed_Fist', score: NaN }]]).features)
      .toEqual({ fist: 0, callMe: 0 })
  })
})

describe('real Gesture Recognizer output contract', () => {
  it('distinguishes actual model fist output from actual thumbs-up output', async () => {
    const fixture = await import('./fixtures/gesture-model-output.json')
    for (const record of fixture.default.results) {
      const { getHandShapeDiagnostics } = await import('./cat-features')
      const shapes = getHandShapeDiagnostics({ face: [], pose: [], hands: record.landmarks }, record.aspect, record.worldLandmarks)
      const { features } = classifyHandGestures(shapes, record.gestures)
      expect(features.callMe).toBe(0)
      if (record.name === 'fist') {
        expect(features.fist).toBeGreaterThan(.8)
        expect(rankMemes(features, 'combined')[0].meme.id).toBe('fist-cat')
      } else expect(features.fist).toBe(0)
    }
  })
})

describe('fist fallback when canned classifier returns no Closed_Fist category', () => {
  const curled = { handIndex: 0, indexExtended: .1, middleExtended: .15, ringExtended: .2, pinkyExtended: .15, thumbSpread: .3, callMe: .1 }
  it('does not treat a confident None as a negative fist prediction', () => {
    const result = classifyHandGestures([curled], [[{ categoryName: 'None', score: .99 }]])
    expect(result.hands[0].modelFist).toBe(0)
    expect(result.hands[0].geometryFist).toBeGreaterThan(.8)
    expect(result.hands[0].fistSource).toBe('geometry')
    expect(rankMemes(result.features, 'combined')[0].meme.id).toBe('fist-cat')
  })
  it('still recognizes curled fingers if the model returns no categories', () => {
    expect(classifyHandGestures([curled], [[]]).features.fist).toBeGreaterThan(.8)
  })
  it('does not confuse an open palm or pointing index with a fist', () => {
    expect(classifyHandGestures([{ ...curled, indexExtended: 1, middleExtended: 1, ringExtended: 1, pinkyExtended: 1 }], [[]]).features.fist).toBe(0)
    expect(classifyHandGestures([{ ...curled, indexExtended: 1 }], [[]]).features.fist).toBe(0)
  })
  it('uses personal shape exemplars without ever requiring positive classifier scores', () => {
    const noisy = { ...curled, indexExtended: .55, middleExtended: .5, ringExtended: .55, pinkyExtended: .6 }
    const examples = [[.55, .5, .55, .6, .3]]
    const result = classifyHandGestures([noisy], [[{ categoryName: 'None', score: .99 }]], examples)
    expect(result.hands[0].modelFist).toBe(0)
    expect(result.hands[0].personalFist).toBe(1)
    expect(result.hands[0].fistSource).toBe('personal')
    expect(result.features.fist).toBe(1)
    expect(rankMemes(result.features, 'combined')[0].meme.id).toBe('fist-cat')
    expect(classifyHandGestures([{ ...noisy, indexExtended: 1 }], [[]], examples).features.fist).toBe(0)
    expect(classifyHandGestures([{ ...noisy, callMe: .9 }], [[]], examples).features.fist).toBe(0)
  })
})
