import { describe, expect, it } from 'vitest'
import { buildTongueProfile, scorePersonalTongue, type TongueProfile } from './tongue-calibration'

const samples = (v: number) => Array.from({ length: 8 }, (_, i) => [v + i * .001, v - i * .001, v])

describe('personal tongue calibration', () => {
  it('scores learned classes and rejects observations far from BOTH training sets', () => {
    const profile = buildTongueProfile(samples(.2), samples(.5))
    expect(scorePersonalTongue([.2, .2, .2], profile)).toBeLessThan(.05)
    expect(scorePersonalTongue([.5, .5, .5], profile)).toBeGreaterThan(.95)
    expect(scorePersonalTongue([3, -2, 4], profile)).toBeUndefined()
    expect(scorePersonalTongue([NaN, .2, .2], profile)).toBeUndefined()
    expect(scorePersonalTongue([.2], profile)).toBeUndefined()
  })

  it('keeps open and closed mouth negatives separate instead of averaging their appearance', () => {
    const closed = Array.from({ length: 6 }, () => [0, 0, 0])
    const open = Array.from({ length: 6 }, () => [.4, .4, .4])
    const tongue = Array.from({ length: 6 }, () => [.8, .8, .8])
    const profile = buildTongueProfile([...closed, ...open], tongue)
    expect(scorePersonalTongue(open[0], profile)).toBe(0)
    expect(scorePersonalTongue(closed[0], profile)).toBe(0)
    expect(scorePersonalTongue(tongue[0], profile)).toBe(1)
  })

  it('requires enough finite consistent samples and genuinely separated classes', () => {
    expect(() => buildTongueProfile(samples(.2).slice(0, 4), samples(.5))).toThrow(/at least 5/)
    expect(() => buildTongueProfile(samples(.2), samples(.2))).toThrow(/too similar/)
    expect(() => buildTongueProfile(samples(.2), samples(.21))).toThrow(/too similar/)
    const noisy = Array.from({ length: 8 }, (_, i) => [i % 2 ? .9 : -.9])
    expect(() => buildTongueProfile(noisy, noisy.map(row => [row[0] + .1]))).toThrow(/too similar/)
    expect(() => buildTongueProfile(samples(.2), [[NaN], ...samples(.5)])).toThrow(/Invalid/)
    expect(() => buildTongueProfile(samples(.2), [[1], ...samples(.5)])).toThrow(/Invalid/)
  })

  it('retains at most 40 detached samples per class and round-trips plain JSON', () => {
    const negative = Array.from({ length: 60 }, () => [.2, .2, .2])
    const positive = Array.from({ length: 60 }, () => [.5, .5, .5])
    const profile = buildTongueProfile(negative, positive)
    expect(profile.negative).toHaveLength(40)
    expect(profile.positive).toHaveLength(40)
    negative[59][0] = 100
    expect(profile.negative[39][0]).toBe(.2)
    const restored = JSON.parse(JSON.stringify(profile)) as TongueProfile
    expect(restored).toEqual(profile)
    expect(scorePersonalTongue([.5, .5, .5], restored)).toBe(1)
    expect(scorePersonalTongue([.5, .5, .5], { ...restored, version: 2 } as unknown as TongueProfile)).toBeUndefined()
    expect(scorePersonalTongue([.5, .5, .5], { version: 1 } as TongueProfile)).toBeUndefined()
  })
})
