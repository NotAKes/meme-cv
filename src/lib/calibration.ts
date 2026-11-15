import type { Features, Meme } from './matching'
import type { HandExample } from './hand-gestures'
import { buildTongueProfile } from './tongue-calibration'
import type { TongueProfile } from './tongue-calibration'

export interface Calibration { neutral?: Features; poses: Record<string, Features>; fistExamples?: HandExample[]; tongueProfile?: TongueProfile }
export const emptyCalibration = (): Calibration => ({ poses: {} })
const key = 'meme-cv-calibration-v1'
const bounded = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1

export function loadCalibration(): Calibration {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '{}')
    const clean = (input: unknown): Features => input && typeof input === 'object'
      ? Object.fromEntries(Object.entries(input).filter(([, value]) => typeof value === 'number' && bounded(value))) : {}
    const poses: Record<string, Features> = {}
    if (parsed.poses && typeof parsed.poses === 'object') {
      for (const [id, features] of Object.entries(parsed.poses)) poses[id] = clean(features)
    }
    const fistExamples = Array.isArray(parsed.fistExamples) ? parsed.fistExamples.filter((e: unknown) => Array.isArray(e) && e.length === 5 && e.every(v => typeof v === 'number' && bounded(v))).slice(-6) : []
    let tongueProfile: TongueProfile | undefined
    try { if (parsed.tongueProfile?.version === 1) tongueProfile = buildTongueProfile(parsed.tongueProfile.negative, parsed.tongueProfile.positive) } catch { /* An invalid profile must not break the other calibration. */ }
    return { neutral: parsed.neutral ? clean(parsed.neutral) : undefined, poses, fistExamples, tongueProfile }
  } catch { return emptyCalibration() }
}
export function persistCalibration(value: Calibration) { localStorage.setItem(key, JSON.stringify(value)) }

/** Use only face baselines: hands, tongue and expressions must not be zeroed away. */
export function normalizeFace(features: Features, neutral?: Features): Features {
  if (!neutral) return features
  const result = { ...features }
  if (features.eyesOpen !== undefined && (neutral.eyesOpen ?? 0) > .15) {
    result.eyesOpen = Math.min(1, features.eyesOpen / neutral.eyesOpen! * .7)
  }
  for (const key of ['headDown', 'headUp'] as const) {
    if (features[key] !== undefined) result[key] = Math.max(0, features[key]! - (neutral[key] ?? 0))
  }
  if (features.mouthOpen !== undefined) {
    const baseline = Math.min(.3, neutral.mouthOpen ?? 0)
    result.mouthOpen = Math.max(0, Math.min(1, (features.mouthOpen - baseline) / (1 - baseline)))
  }
  return result
}

/** Median suppresses occasional landmark outliers during a short capture. */
export function medianFeatures(samples: Features[]): Features {
  const result: Features = {}
  const keys = new Set(samples.flatMap(sample => Object.keys(sample)))
  for (const key of keys as Set<keyof Features>) {
    const values = samples.map(sample => sample[key]).filter((v): v is number => v !== undefined && bounded(v)).sort((a, b) => a - b)
    if (values.length >= Math.max(3, samples.length * .6)) result[key] = values[Math.floor(values.length / 2)]
  }
  return result
}

export function calibratedMemes(memes: Meme[], calibration: Calibration): Meme[] {
  return memes.map(meme => {
    const pose = calibration.poses[meme.id]
    if (!pose) return meme
    // Keep only this template's annotated dimensions. Capturing shaka must not
    // accidentally add a noisy fist as a second mandatory signature.
    const normalized = normalizeFace(pose, calibration.neutral)
    const annotated = Object.fromEntries(Object.entries(normalized).filter(([key]) => key in meme.features))
    return { ...meme, features: { ...meme.features, ...annotated } }
  })
}
