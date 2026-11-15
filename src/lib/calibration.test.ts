import { describe, expect, it } from 'vitest'
import { calibratedMemes, emptyCalibration, medianFeatures, normalizeFace } from './calibration'
import { memes, rankMemes } from './matching'

describe('personal calibration', () => {
  it('normalizes the neutral face without erasing gestures or tongue', () => {
    expect(normalizeFace({ eyesOpen: .5, mouthOpen: .1, headDown: .3, fist: .8, tongueOut: .7 }, { eyesOpen: .5, mouthOpen: .1, headDown: .2 }))
      .toEqual({ eyesOpen: .7, mouthOpen: 0, headDown: .3 - .2, fist: .8, tongueOut: .7 })
    expect(normalizeFace({ mouthOpen: 1 }, { mouthOpen: .2 }).mouthOpen).toBe(1)
    expect(normalizeFace({})).toEqual({})
  })
  it('uses median and rejects frequently missing or invalid observations', () => {
    expect(medianFeatures([{ mouthOpen: .1, fist: 1 }, { mouthOpen: .2 }, { mouthOpen: 1, eyesOpen: NaN }, { mouthOpen: .2 }]))
      .toEqual({ mouthOpen: .2 })
    expect(medianFeatures([])).toEqual({})
  })
  it('does not turn incidental fist noise into an extra required phone gesture', () => {
    const calibration = emptyCalibration()
    calibration.poses['call-me-cat'] = { callMe: .8, fist: .7, tongueOut: 0, mouthOpen: 0, eyesOpen: .7 }
    const templates = calibratedMemes(memes, calibration)
    const phone = templates.find(m => m.id === 'call-me-cat')!
    expect(phone.features.fist).toBeUndefined()
    expect(rankMemes({ callMe: .8, fist: 0, mouthOpen: 0, tongueOut: 0 }, 'combined', templates)[0].meme.id).toBe('call-me-cat')
  })
  it('does not mutate templates and preserves semantic requirements', () => {
    const calibration = emptyCalibration()
    calibration.poses['fist-cat'] = { fist: .65, mouthOpen: .1, eyesOpen: .7 }
    const templates = calibratedMemes(memes, calibration)
    expect(templates.find(m => m.id === 'fist-cat')?.requiredFeatures).toEqual(['fist'])
    expect(memes.find(m => m.id === 'fist-cat')?.features.fist).toBe(1)
    expect(rankMemes({ fist: .65, mouthOpen: .1, eyesOpen: .7 }, 'combined', templates)[0].meme.id).toBe('fist-cat')
  })
})
