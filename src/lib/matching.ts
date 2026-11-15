import { cats } from '../data/cats';

/** Normalized measurements: 0 means absent/closed/down, 1 means fully present/open/up. */
export type Features = Partial<
  Record<
    'mouthOpen' | 'eyesOpen' | 'headDown' | 'headUp' | 'smile' | 'browRaise'
    | 'leftHandUp' | 'rightHandUp' | 'handsNearFace' | 'fist' | 'callMe' | 'fingersTogether' | 'tongueOut',
    number
  >
>;

export type MatchMode = 'combined' | 'face' | 'pose';

export interface Meme {
  id: string;
  title: string;
  caption: string;
  color: string;
  features: Features;
  image: string;
  instruction: string;
  annotationNote: string;
  source: { origin: string; rights: string };
  requiredFeatures?: (keyof Features)[];
}

type FeatureKey = keyof Features;
const faceKeys: FeatureKey[] = ['mouthOpen', 'eyesOpen', 'headDown', 'headUp', 'tongueOut'];
const poseKeys: FeatureKey[] = ['leftHandUp', 'rightHandUp', 'handsNearFace', 'fist', 'callMe', 'fingersTogether'];
const allKeys: FeatureKey[] = [...faceKeys, ...poseKeys];
const smoothingKeys: FeatureKey[] = [...allKeys, 'smile', 'browRaise'];
const minimumObservations = 2;
const gestureKeys: FeatureKey[] = ['fist', 'callMe', 'fingersTogether'];
const signatureKeys: FeatureKey[] = [...gestureKeys, 'tongueOut'];
const featureWeights: Partial<Record<FeatureKey, number>> = {
  mouthOpen: 3, eyesOpen: 1, headDown: 0.7, headUp: 0.7,
  leftHandUp: 0.5, rightHandUp: 0.5, handsNearFace: 0.5,
  fist: 5, callMe: 5, fingersTogether: 5, tongueOut: 5,
};

/** Manually annotated human approximations of the supplied cat images. */
export const memes: Meme[] = cats;

/** Ignore absent/nonfinite values and clamp finite measurements to their normalized range. */
function normalized(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : undefined;
}

function mirroredKey(key: FeatureKey): FeatureKey {
  if (key === 'leftHandUp') return 'rightHandUp';
  if (key === 'rightHandUp') return 'leftHandUp';
  return key;
}

/**
 * Weighted RMS distance with coverage and contradictory-signature penalties.
 * Unknown observations/annotations are never interpreted as zero. Required
 * tongue signatures must be observed at >= .45; hand signs at >= .6. One comparison is sufficient,
 * while ordinary candidates need two. Requirements apply only in their mode.
 * A global hand swap handles camera mirroring. Stable ties retain template order.
 */
export function rankMemes(
  features: Features,
  mode: MatchMode,
  templates: Meme[] = memes,
): { meme: Meme; distance: number }[] {
  const keys = mode === 'face' ? faceKeys : mode === 'pose' ? poseKeys : allKeys;
  const observations = keys.flatMap((key) => {
    const value = normalized(features[key]);
    return value === undefined ? [] : [{ key, value }];
  });

  return templates.flatMap((meme) => {
    const distanceFor = (mirror: boolean): number | undefined => {
      // Hand-sign memes are selected by the hand sign itself. Face expression,
      // tongue visibility, shoulder tracking and distance to the face do not
      // veto a confident gesture in combined/pose modes.
      const handSignature = mode === 'face' ? undefined
        : [...(meme.requiredFeatures ?? []), ...gestureKeys.filter(key => (normalized(meme.features[key]) ?? 0) >= .45)].find(key => gestureKeys.includes(key))
      if (handSignature) {
        const signal = normalized(features[handSignature])
        if (signal === undefined || signal < .6) return undefined
        const expected = normalized(meme.features[handSignature]) ?? 1
        return Math.min(.4, Math.abs(signal - expected) * .4)
      }
      // A confirmed tongue observation should not lose to unrelated eye/head targets.
      // Hand-sign fast path above retains priority when both are visible.
      if (mode !== 'pose' && meme.requiredFeatures?.includes('tongueOut')) {
        const tongue = normalized(features.tongueOut)
        if (tongue === undefined || tongue < .6) return undefined
        return Math.min(.18, Math.abs(1 - tongue) * .4)
          + (mode === 'combined' && gestureKeys.some(key => (normalized(features[key]) ?? 0) >= .6) ? .5 : 0)
      }
      // Gesture annotations are signatures, not optional neutral pose targets.
      // Tongue remains optional unless explicitly required (e.g. lululu).
      const required = new Set([
        ...(meme.requiredFeatures ?? []),
        ...gestureKeys.filter((key) => (normalized(meme.features[key]) ?? 0) >= 0.45),
      ]);
      const applicableRequired = [...required].filter((key) => keys.includes(key));
      if (applicableRequired.some((key) => {
        const value = normalized(features[mirror ? mirroredKey(key) : key]);
        return value === undefined || value < 0.45;
      })) return undefined;

      const hasRequiredSignature = applicableRequired.some((key) =>
        signatureKeys.includes(key) && normalized(meme.features[key]) !== undefined);
      const expectedCount = keys.filter((key) => normalized(meme.features[key]) !== undefined).length;
      let sum = 0;
      let weight = 0;
      let count = 0;
      for (const { key, value } of observations) {
        const expected = normalized(meme.features[mirror ? mirroredKey(key) : key]);
        if (expected === undefined) continue;
        const importance = featureWeights[key] ?? 1;
        sum += importance * (value - expected) ** 2;
        weight += importance;
        count += 1;
      }
      if (count < (hasRequiredSignature ? 1 : minimumObservations)) return undefined;
      // Positive evidence must not disappear simply because a neutral template
      // leaves that signature unknown. This is not an assumed zero comparison.
      const contradictionPenalty = observations.some(({ key, value }) =>
        signatureKeys.includes(key) && value > (gestureKeys.includes(key) ? .6 : .55)
        && (normalized(meme.features[key]) ?? 0) < 0.45) ? 0.5 : 0;
      return Math.min(1, Math.sqrt(sum / weight)
        + 0.12 * (expectedCount - count) / expectedCount + contradictionPenalty);
    };
    const distances = [distanceFor(false), distanceFor(true)].filter(
      (value): value is number => value !== undefined,
    );
    return distances.length === 0 ? [] : [{ meme, distance: Math.min(...distances) }];
  }).sort((a, b) => a.distance - b.distance);
}

/**
 * Exponential smoothing of current finite observations only; missing values are
 * removed immediately instead of retaining stale landmarks. Alpha defaults to
 * 0.35 and is clamped to 0..1 (nonfinite alpha uses the default). Pure function.
 */
export function smoothFeatures(
  previous: Features,
  current: Features,
  alpha = 0.35,
): Features {
  const weight = normalized(alpha) ?? 0.35;
  const result: Features = {};
  for (const key of smoothingKeys) {
    const next = normalized(current[key]);
    if (next === undefined) continue;
    const last = normalized(previous[key]);
    result[key] = last === undefined ? next : last + weight * (next - last);
  }
  return result;
}

/**
 * Temporal hysteresis only: callers select a candidate (and any improvement
 * threshold). The first candidate is immediate; a replacement must remain the
 * candidate for 350 ms. Supply monotonic timestamps in milliseconds. Null clears
 * all state, including pending replacements. No timers or external side effects.
 */
export class MatchStabilizer {
  private active: string | null = null;
  private pending: string | null = null;
  private pendingSince = 0;

  update(candidateId: string | null, now: number): string | null {
    if (candidateId === null) {
      this.reset();
      return null;
    }
    if (!Number.isFinite(now)) return this.active;
    if (this.active === null) {
      this.active = candidateId;
    } else if (candidateId === this.active) {
      this.pending = null;
    } else if (candidateId !== this.pending || now < this.pendingSince) {
      this.pending = candidateId;
      this.pendingSince = now;
    } else if (now - this.pendingSince >= 350) {
      this.active = candidateId;
      this.pending = null;
    }
    return this.active;
  }

  reset(): void {
    this.active = null;
    this.pending = null;
    this.pendingSince = 0;
  }
}
