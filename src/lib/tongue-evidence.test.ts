import { describe, expect, it } from 'vitest'
import { TongueEvidence } from './tongue-evidence'
import { MatchStabilizer, rankMemes, smoothFeatures } from './matching'

describe('temporal tongue evidence', () => {
  it('rejects isolated noise and confirms repeated evidence', () => {
    const evidence = new TongueEvidence()
    expect(evidence.update(.95, 0)).toBeLessThan(.45)
    expect(evidence.update(0, 70)).toBeLessThan(.45)
    expect(evidence.update(.85, 140)).toBeGreaterThan(.6)
    expect(evidence.update(0, 210)).toBeGreaterThan(.6)
    expect(evidence.update(0, 280)).toBeGreaterThan(.6)
    expect(evidence.update(0, 350)).toBe(0)
  })
  it('clears evidence on missing observations, stale frames and clock changes', () => {
    const evidence = new TongueEvidence()
    evidence.update(.9, 0); evidence.update(.9, 70)
    expect(evidence.update(undefined, 140)).toBeUndefined()
    expect(evidence.update(.9, 210)).toBeLessThan(.45)
    expect(evidence.update(.9, 1000)).toBeLessThan(.45)
    expect(evidence.update(.9, 10)).toBeLessThan(.45)
  })
  it('lets intermittent tongue detections survive smoothing and card hysteresis', () => {
    const evidence = new TongueEvidence(), stabilizer = new MatchStabilizer()
    stabilizer.update('confused-cat', 0)
    let features = {}, selected: string | null = null
    for (const [index, score] of [.9, .85, 0, .8, 0, .85, 0, .9, .8, 0].entries()) {
      const now = (index + 1) * 70
      features = smoothFeatures(features, { mouthOpen: .85, eyesOpen: .1, headDown: .8, tongueOut: evidence.update(score, now) }, .5)
      selected = stabilizer.update(rankMemes(features, 'combined')[0]?.meme.id ?? null, now)
    }
    expect(selected).toBe('lululu-cat')
  })
})
