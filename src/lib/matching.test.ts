import { describe, expect, it } from 'vitest';
import { MatchStabilizer, memes, rankMemes, smoothFeatures } from './matching';
import type { Features, Meme } from './matching';

function template(id: string): Features {
  return { ...memes.find((meme) => meme.id === id)!.features };
}

describe('cat records and rankMemes', () => {
  it('provides exactly eight annotated cats in the supplied order', () => {
    expect(memes.map(({ id }) => id)).toEqual([
      'confused-cat', 'lululu-cat', 'loading-cat', 'fist-cat',
      'salad-cat', 'screaming-cat', 'call-me-cat', 'shy-cat',
    ]);
    for (const meme of memes) {
      expect(meme.image).toBe(`memes/${meme.id}.webp`);
      expect(meme.instruction.length).toBeGreaterThan(0);
      expect(meme.annotationNote.length).toBeGreaterThan(0);
      expect(meme.source).toEqual({ origin: 'user attachment', rights: 'unknown' });
    }
    expect(memes.find(({ id }) => id === 'lululu-cat')!.annotationNote).toContain('язык');
  });

  it('ranks every exact combined self match first with zero distance', () => {
    for (const meme of memes) {
      const ranked = rankMemes(meme.features, 'combined');
      expect(ranked[0]?.meme.id).toBe(meme.id);
      expect(ranked[0]?.distance).toBe(0);
      expect(ranked.every((item, i) => i === 0 || item.distance >= ranked[i - 1]!.distance)).toBe(true);
    }
  });

  it('uses a global hand swap, including when only one hand is observed', () => {
    const normal = template('fist-cat');
    const mirrored = { ...normal, leftHandUp: normal.rightHandUp, rightHandUp: normal.leftHandUp };
    for (const mode of ['combined', 'pose'] as const) {
      expect(rankMemes(mirrored, mode)).toEqual(rankMemes(normal, mode));
      expect(rankMemes(mirrored, mode)[0]?.meme.id).toBe('fist-cat');
      expect(rankMemes(mirrored, mode)[0]?.distance).toBe(0);
    }
  });

  it('never treats unknown template hands or missing observations as zero', () => {
    expect(template('lululu-cat').leftHandUp).toBeUndefined();
    expect(template('fist-cat').rightHandUp).toBeUndefined();
    expect(rankMemes({ leftHandUp: 0, rightHandUp: 0 }, 'pose').map(({ meme }) => meme.id))
      .toEqual(['confused-cat']);
    const partial = { mouthOpen: 0.25, eyesOpen: 0.5, tongueOut: 1 };
    const distance = (features: Features) => rankMemes(features, 'face', [{ ...memes.find(m => m.id === 'lululu-cat')!, requiredFeatures: [] }])
      .find(({ meme }) => meme.id === 'lululu-cat')!.distance;
    expect(distance(partial)).toBeCloseTo(0.12 * 2 / 5);
    expect(distance({ ...partial, headDown: 1, headUp: 1 })).toBeGreaterThan(distance(partial));
  });

  it('adds 0.12 times missing expected coverage, not missing unknown annotations', () => {
    const full = template('lululu-cat');
    const score = (features: Features) => rankMemes(features, 'combined', [{ ...memes.find(m => m.id === 'lululu-cat')!, requiredFeatures: [] }])
      .find(({ meme }) => meme.id === 'lululu-cat')!.distance;
    expect(score(full)).toBe(0);
    expect(score({ mouthOpen: full.mouthOpen, eyesOpen: full.eyesOpen, tongueOut: full.tongueOut })).toBeCloseTo(0.12 * 2 / 5);
    expect(score({ ...full, leftHandUp: 1, rightHandUp: 1 })).toBe(0);
  });

  it('excludes missing or weak required gestures in pose/combined but never in face mode', () => {
    for (const [id, gesture] of [
      ['fist-cat', 'fist'], ['call-me-cat', 'callMe'], ['shy-cat', 'fingersTogether'],
    ] as const) {
      const full = template(id);
      const missing = { ...full, [gesture]: undefined };
      for (const mode of ['pose', 'combined'] as const) {
        expect(rankMemes(missing, mode).some(({ meme }) => meme.id === id)).toBe(false);
        const observedZero = rankMemes({ ...full, [gesture]: 0 }, mode).find(({ meme }) => meme.id === id);
        expect(observedZero).toBeUndefined();
        expect(rankMemes({ ...full, [gesture]: 0.44 }, mode).some(({ meme }) => meme.id === id)).toBe(false);
        expect(rankMemes({ ...full, [gesture]: 0.59 }, mode).some(({ meme }) => meme.id === id)).toBe(false);
        expect(rankMemes({ ...full, [gesture]: 0.6 }, mode).some(({ meme }) => meme.id === id)).toBe(true);
      }
      expect(rankMemes(missing, 'face').some(({ meme }) => meme.id === id)).toBe(true);
      expect(rankMemes({ ...full, [gesture]: NaN }, 'combined').some(({ meme }) => meme.id === id)).toBe(false);
    }
  });

  it('ignores smile and brow raise and requires two comparable applicable features', () => {
    expect(rankMemes({}, 'combined')).toEqual([]);
    expect(rankMemes({ mouthOpen: 1 }, 'face')).toEqual([]);
    expect(rankMemes({ smile: 1, browRaise: 1 }, 'face')).toEqual([]);
    expect(rankMemes({ mouthOpen: 1, eyesOpen: NaN, headDown: Infinity }, 'face')).toEqual([]);
    expect(rankMemes({ leftHandUp: 1, rightHandUp: 1 }, 'face')).toEqual([]);
    expect(rankMemes({ mouthOpen: 1, eyesOpen: 1 }, 'pose')).toEqual([]);
    // A required positive signature alone is sufficient, unlike ordinary features.
    expect(rankMemes({ fist: 1 }, 'pose')[0]?.meme.id).toBe('fist-cat');
    const input = template('screaming-cat');
    expect(rankMemes({ ...input, smile: 1, browRaise: 0 }, 'combined')).toEqual(rankMemes(input, 'combined'));
    expect(rankMemes({ ...input, leftHandUp: 1, fist: 1 }, 'face')).toEqual(rankMemes(input, 'face'));
    const hands = template('shy-cat');
    expect(rankMemes({ ...hands, mouthOpen: 1, eyesOpen: 0 }, 'pose')).toEqual(rankMemes(hands, 'pose'));
  });

  it.each([
    ['fist-cat', { fist: 0.7 }],
    ['call-me-cat', { callMe: 0.75 }],
    ['shy-cat', { fingersTogether: 0.7 }],
  ] as const)('recognizes realistic %s without shoulder or hand-height observations', (id, gesture) => {
    const neutralFace = { mouthOpen: 0.03, eyesOpen: 0.8, headDown: 0, headUp: 0 };
    expect(rankMemes({ ...neutralFace, ...gesture }, 'combined')[0]?.meme.id).toBe(id);
    expect(rankMemes(gesture, 'pose')[0]?.meme.id).toBe(id);
    expect(rankMemes(gesture, 'combined')[0]?.meme.id).toBe(id);
    // Face conflict must not outweigh a strong, explicit gesture.
    expect(rankMemes({ mouthOpen: 0.7, eyesOpen: 0.8, headUp: 0, ...gesture }, 'combined')[0]?.meme.id).toBe(id);
  });

  it('selects call-me purely from a confident hand, independent of mouth, tongue and arm height', () => {
    for (const face of [{}, { mouthOpen: 0, tongueOut: 0, eyesOpen: .72, handsNearFace: .28 },
      { mouthOpen: 1, tongueOut: 1, eyesOpen: 0, headDown: 1, leftHandUp: 0 }]) {
      for (const mode of ['combined', 'pose'] as const) {
        const ranked = rankMemes({ ...face, callMe: .8, fist: .04 }, mode);
        expect(ranked[0].meme.id).toBe('call-me-cat');
        expect(ranked[0].distance).toBeCloseTo(.08);
      }
    }
    // Old raw screenshot scores are ambiguous: do not turn them into a positive
    // simply by lowering the threshold. Fix upstream detection instead.
    const screenshots = [
      { mouthOpen: 0, eyesOpen: .72, fist: .27, callMe: .45 },
      { mouthOpen: 0, eyesOpen: .72, fist: .04, callMe: .21 },
    ];
    for (const input of screenshots) {
      expect(rankMemes(input, 'combined').some(({ meme }) => ['fist-cat', 'call-me-cat'].includes(meme.id))).toBe(false);
    }
  });

  it('recognizes an open mouth without requiring a raised head', () => {
    for (const mouthOpen of [0.65, 0.7]) {
      for (const mode of ['face', 'combined'] as const) {
        expect(rankMemes({ mouthOpen, eyesOpen: 0.8, headDown: 0, headUp: 0 }, mode)[0]?.meme.id)
          .toBe('screaming-cat');
      }
    }
  });

  it('requires tongue for lululu but not for the call-me gesture', () => {
    for (const mode of ['face', 'combined'] as const) {
      expect(rankMemes({ tongueOut: 0.7 }, mode)[0]?.meme.id).toBe('lululu-cat');
      for (const tongueOut of [undefined, NaN, 0, 0.44]) {
        expect(rankMemes({ ...template('lululu-cat'), tongueOut }, mode)
          .some(({ meme }) => meme.id === 'lululu-cat')).toBe(false);
      }
    }
    expect(rankMemes({ callMe: 0.75 }, 'combined')[0]?.meme.id).toBe('call-me-cat');
    expect(template('call-me-cat').tongueOut).toBe(0.7);
  });

  it('selects a neutral cat when signatures are absent or explicitly inactive', () => {
    for (const gestures of [{}, { fist: 0, callMe: 0, fingersTogether: 0, tongueOut: 0 }]) {
      const ranked = rankMemes({ mouthOpen: 0.03, eyesOpen: 0.8, headDown: 0, headUp: 0, ...gestures }, 'combined');
      expect(ranked[0]?.meme.id).toBe('confused-cat');
      expect(ranked.map(({ meme }) => meme.id)).not.toContain('lululu-cat');
      expect(ranked.map(({ meme }) => meme.id)).not.toContain('fist-cat');
      expect(ranked.map(({ meme }) => meme.id)).not.toContain('call-me-cat');
      expect(ranked.map(({ meme }) => meme.id)).not.toContain('shy-cat');
    }
  });

  it('supports calibrated templates, weighted scoring, and explicit signature penalties', () => {
    const base = memes[0]!;
    const custom: Meme[] = [
      { ...base, id: 'ordinary', features: { mouthOpen: 0, eyesOpen: 0 } },
      { ...base, id: 'signature', features: { fist: 1 }, requiredFeatures: ['fist'] },
    ];
    const score = (features: Features) => rankMemes(features, 'combined', custom)
      .find(({ meme }) => meme.id === 'ordinary')?.distance;
    expect(score({ mouthOpen: 1, eyesOpen: 0 })).toBeCloseTo(Math.sqrt(3 / 4));
    expect(score({ mouthOpen: 0, eyesOpen: 1 })).toBeCloseTo(0.5);
    expect(score({ mouthOpen: 0, eyesOpen: 0, fist: 0.55 })).toBe(0);
    expect(score({ mouthOpen: 0, eyesOpen: 0, fist: 0.56 })).toBe(0);
    expect(score({ mouthOpen: 0, eyesOpen: 0, fist: 0.7 })).toBe(0.5);
    expect(rankMemes({ fist: 0.7 }, 'pose', custom)[0]?.meme.id).toBe('signature');
    expect(rankMemes({ mouthOpen: 0, eyesOpen: 0 }, 'face', [])).toEqual([]);
  });

  it('clamps finite inputs and keeps scores in 0..1 without mutation', () => {
    const input = Object.freeze({ mouthOpen: 100, eyesOpen: -100, headDown: 20, headUp: 20, fist: 20, callMe: 20, fingersTogether: 20 });
    const ranked = rankMemes(input, 'combined');
    expect(ranked).toEqual(rankMemes({ mouthOpen: 1, eyesOpen: 0, headDown: 1, headUp: 1, fist: 1, callMe: 1, fingersTogether: 1 }, 'combined'));
    expect(ranked.every(({ distance }) => Number.isFinite(distance) && distance >= 0 && distance <= 1)).toBe(true);
    expect(input.mouthOpen).toBe(100);
  });
});

describe('smoothFeatures', () => {
  it('smooths the new face and gesture features while retaining tracker compatibility', () => {
    const current: Features = { eyesOpen: 1, headDown: 1, headUp: 1, fist: 1, callMe: 1, fingersTogether: 1, tongueOut: 1, smile: 1, browRaise: 1 };
    const previous: Features = { eyesOpen: 0, headDown: 0, headUp: 0, fist: 0, callMe: 0, fingersTogether: 0, tongueOut: 0, smile: 0, browRaise: 0 };
    expect(smoothFeatures(previous, current, 0.5)).toEqual({ eyesOpen: 0.5, headDown: 0.5, headUp: 0.5, fist: 0.5, callMe: 0.5, fingersTogether: 0.5, tongueOut: 0.5, smile: 0.5, browRaise: 0.5 });
  });

  it('smooths existing observations, initializes new ones, and leaves inputs alone', () => {
    const previous = Object.freeze({ smile: 0, browRaise: 0.5 });
    const current = Object.freeze({ smile: 1, mouthOpen: 0.8 });
    expect(smoothFeatures(previous, current, 0.25)).toEqual({ smile: 0.25, mouthOpen: 0.8 });
    expect(previous).toEqual({ smile: 0, browRaise: 0.5 });
    expect(current.smile).toBe(1);
    expect(smoothFeatures({ smile: 0 }, { smile: 1 }).smile).toBeCloseTo(0.35);
  });

  it('removes stale and nonfinite measurements rather than carrying them forward', () => {
    expect(smoothFeatures(template('lululu-cat'), {})).toEqual({});
    expect(smoothFeatures(template('lululu-cat'), { smile: undefined, mouthOpen: NaN, browRaise: Infinity })).toEqual({});
  });

  it('bounds measurements and alpha and handles invalid previous measurements', () => {
    expect(smoothFeatures({ smile: -5 }, { smile: 20 }, 2)).toEqual({ smile: 1 });
    expect(smoothFeatures({ smile: 0 }, { smile: 1 }, -1)).toEqual({ smile: 0 });
    expect(smoothFeatures({ smile: NaN }, { smile: 0.8 }, 0)).toEqual({ smile: 0.8 });
    expect(smoothFeatures({ smile: 0 }, { smile: 1 }, NaN).smile).toBeCloseTo(0.35);
  });
});

describe('confirmed tongue matching', () => {
  it('selects tongue with squinting eyes, open mouth and a tilted head', () => {
    const result = rankMemes({ tongueOut: .7, mouthOpen: .9, eyesOpen: .05, headDown: .9, headUp: 0 }, 'combined')
    expect(result[0].meme.id).toBe('lululu-cat')
  })
  it('rejects weak tongue evidence and retains a confident phone gesture', () => {
    expect(rankMemes({ tongueOut: .4, mouthOpen: .3 }, 'face').some(r => r.meme.id === 'lululu-cat')).toBe(false)
    expect(rankMemes({ tongueOut: .7, callMe: 1 }, 'combined')[0].meme.id).toBe('call-me-cat')
  })
})

describe('MatchStabilizer', () => {
  it('accepts the first candidate immediately and delays replacements by 350 ms', () => {
    const stabilizer = new MatchStabilizer();
    expect(stabilizer.update('confused-cat', 0)).toBe('confused-cat');
    expect(stabilizer.update('lululu-cat', 10)).toBe('confused-cat');
    expect(stabilizer.update('lululu-cat', 359)).toBe('confused-cat');
    expect(stabilizer.update('lululu-cat', 360)).toBe('lululu-cat');
  });

  it('requires a continuous candidate and cancels pending changes on a return', () => {
    const stabilizer = new MatchStabilizer();
    stabilizer.update('confused-cat', 0);
    stabilizer.update('lululu-cat', 100);
    stabilizer.update('screaming-cat', 700);
    expect(stabilizer.update('screaming-cat', 1000)).toBe('confused-cat');
    stabilizer.update('confused-cat', 1100);
    expect(stabilizer.update('screaming-cat', 1400)).toBe('confused-cat');
    expect(stabilizer.update('screaming-cat', 2050)).toBe('screaming-cat');
  });

  it('clears active and pending state on null or explicit reset', () => {
    const stabilizer = new MatchStabilizer();
    stabilizer.update('confused-cat', 0);
    stabilizer.update('lululu-cat', 100);
    expect(stabilizer.update(null, 200)).toBeNull();
    expect(stabilizer.update('screaming-cat', 201)).toBe('screaming-cat');
    stabilizer.update('lululu-cat', 300);
    stabilizer.reset();
    expect(stabilizer.update('confused-cat', 301)).toBe('confused-cat');
    expect(stabilizer.update('lululu-cat', 1000)).toBe('confused-cat');
    expect(stabilizer.update('lululu-cat', 1650)).toBe('lululu-cat');
  });

  it('ignores nonfinite timestamps and restarts a pending delay if time regresses', () => {
    const stabilizer = new MatchStabilizer();
    expect(stabilizer.update('lululu-cat', NaN)).toBeNull();
    stabilizer.update('confused-cat', 0);
    stabilizer.update('lululu-cat', 1000);
    expect(stabilizer.update('lululu-cat', Infinity)).toBe('confused-cat');
    expect(stabilizer.update('lululu-cat', 100)).toBe('confused-cat');
    expect(stabilizer.update('lululu-cat', 449)).toBe('confused-cat');
    expect(stabilizer.update('lululu-cat', 450)).toBe('lululu-cat');
  });
});
