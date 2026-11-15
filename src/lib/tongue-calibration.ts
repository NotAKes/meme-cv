/** Compact, local-only descriptors; never contains camera pixels or face identity data. */
export interface TongueProfile {
  version: 1
  negative: number[][]
  positive: number[][]
}

const rms = (a: number[], b: number[]) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / a.length)
const centroid = (samples: number[][]) => samples[0].map((_, i) => samples.reduce((s, row) => s + row[i], 0) / samples.length)
const validSamples = (samples: number[][], dimension: number) => Array.isArray(samples)
  && samples.length >= 5 && samples.length <= 40
  && samples.every(row => Array.isArray(row) && row.length === dimension && Array.from(row).every(Number.isFinite))

function geometry(profile: TongueProfile) {
  if (!profile || profile.version !== 1 || !Array.isArray(profile.negative) || !Array.isArray(profile.positive)) return undefined
  const dimension = profile.negative[0]?.length
  if (!dimension || dimension > 512 || !validSamples(profile.negative, dimension) || !validSamples(profile.positive, dimension)) return undefined
  const negative = centroid(profile.negative), positive = centroid(profile.positive)
  const spread = (samples: number[][], center: number[]) => Math.sqrt(samples.reduce((s, row) => s + rms(row, center) ** 2, 0) / samples.length)
  const within = Math.max(spread(profile.negative, negative), spread(profile.positive, positive))
  const gap = rms(negative, positive)
  if (!Number.isFinite(gap) || gap <= Math.max(.025, within * 1.5)) return undefined
  return { negative, positive, within, gap, dimension }
}

/** Throws a user-displayable error if calibration is insufficient or inseparable.
 * Negatives must include BOTH a closed mouth and an open mouth without tongue.
 * Keep at most the latest 40 observations per class; callers may serialize as JSON.
 */
export function buildTongueProfile(negative: number[][], positive: number[][]): TongueProfile {
  if (!Array.isArray(negative) || !Array.isArray(positive) || negative.length < 5 || positive.length < 5) {
    throw new Error('Capture at least 5 clear samples each: closed AND open mouth without tongue, then tongue out.')
  }
  // Validate even discarded samples, rather than silently accepting corrupt input.
  const dimension = negative[0]?.length
  if (!dimension || dimension > 512 || [...negative, ...positive].some(row => !Array.isArray(row)
    || row.length !== dimension || !Array.from(row).every(Number.isFinite))) throw new Error('Invalid tongue calibration samples.')
  const profile: TongueProfile = { version: 1, negative: negative.slice(-40).map(row => [...row]), positive: positive.slice(-40).map(row => [...row]) }
  if (!geometry(profile)) throw new Error('Tongue samples look too similar. Retry in steady lighting, including open-mouth negatives and a clearly protruding tongue.')
  return profile
}

/** Local-neighborhood score in [0,1], retaining separate closed/open negative poses. Unknown/malformed/out-of-distribution stays undefined.
 * Never substitute a global heuristic when a personal profile is present.
 */
export function scorePersonalTongue(descriptor: number[], profile: TongueProfile): number | undefined {
  const model = geometry(profile)
  if (!model || !Array.isArray(descriptor) || descriptor.length !== model.dimension || !Array.from(descriptor).every(Number.isFinite)) return undefined
  const nearest = Math.min(...[...profile.negative, ...profile.positive].map(row => rms(descriptor, row)))
  if (nearest > Math.max(.045, model.gap * .75, model.within * 2)) return undefined
  const distance = (samples: number[][]) => {
    const nearest = samples.map(row => rms(descriptor, row)).sort((a, b) => a - b).slice(0, 3)
    return nearest.reduce((sum, value) => sum + value, 0) / nearest.length
  }
  const dn = distance(profile.negative), dp = distance(profile.positive)
  return dn + dp > 0 ? dn / (dn + dp) : undefined
}
