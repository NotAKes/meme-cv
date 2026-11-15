import type { Features } from './matching'

export interface GestureCategory { categoryName: string; score: number }
export interface HandShape {
  handIndex: number; callMe?: number; indexExtended?: number; middleExtended?: number
  ringExtended?: number; pinkyExtended?: number; thumbSpread?: number
}
export type HandExample = number[]
export interface HandDecision {
  handIndex: number; modelLabel: string; modelScore: number; modelFist: number
  geometryFist: number; personalFist: number; fistSource: string; fist: number; callMe: number
}
const clamp = (n: number) => Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0
const fingerKeys = ['indexExtended', 'middleExtended', 'ringExtended', 'pinkyExtended'] as const

export function handVector(shape: HandShape): HandExample | undefined {
  const values = [...fingerKeys.map(key => shape[key]), shape.thumbSpread]
  return values.every((v): v is number => v !== undefined && Number.isFinite(v)) ? values as number[] : undefined
}

/** Numeric descriptors only; no camera frames are retained. */
export function personalFistScore(shape: HandShape, examples: HandExample[]): number {
  const vector = handVector(shape)
  if (!vector) return 0
  // A personal example must never turn extended fingers or shaka into a fist.
  if (Math.max(...vector.slice(0, 4)) > .7 || (shape.callMe ?? 0) > .65) return 0
  return Math.max(0, ...examples.filter(e => e.length === 5 && e.every(v => Number.isFinite(v) && v >= 0 && v <= 1)).map(example => {
    const rms = Math.sqrt(vector.reduce((sum, v, i) => sum + (v - example[i]) ** 2, 0) / vector.length)
    return clamp(1 - rms / .28)
  }))
}

/** Learned class + independent geometry. 'None' means no known model class,
 * NOT evidence of an open hand; it must not erase a valid geometric fist.
 * Fuse per hand before taking maxima so hands cannot suppress each other.
 */
export function classifyHandGestures(shapes: HandShape[], gestures: GestureCategory[][], examples: HandExample[] = []): { features: Features; hands: HandDecision[] } {
  const hands = shapes.map(shape => {
    const categories = (gestures[shape.handIndex] ?? []).filter(c => Number.isFinite(c.score))
    const top = [...categories].sort((a, b) => b.score - a.score)[0]
    const modelFist = clamp(categories.find(c => c.categoryName === 'Closed_Fist')?.score ?? 0)
    const extensions = fingerKeys.map(key => shape[key]).filter((v): v is number => v !== undefined && Number.isFinite(v))
    let geometryFist = 0
    if (extensions.length >= 3) {
      const sorted = extensions.map(clamp).sort((a, b) => a - b)
      // Require every observed finger curled, but don't multiply four uncertain scores.
      const mean = sorted.reduce((sum, v) => sum + v, 0) / sorted.length
      geometryFist = Math.min(clamp((.7 - mean) / .45), clamp((.8 - sorted.at(-1)!) / .5))
    }
    let personalFist = personalFistScore(shape, examples)
    let callMe = clamp(shape.callMe ?? 0)
    // A thumb-up hand has four curled fingers too; discriminate with learned
    // evidence and thumb spread. Unknown classes must not disable fallback.
    const specificContradiction = top && ['Open_Palm', 'Thumb_Up', 'Thumb_Down', 'Pointing_Up', 'Victory', 'ILoveYou'].includes(top.categoryName) && top.score >= .7
    if (specificContradiction) { geometryFist = 0; personalFist = 0; callMe = 0 }
    if ((shape.thumbSpread ?? 0) > .7 && top?.categoryName !== 'Closed_Fist') geometryFist *= .35
    if (callMe >= .65) { geometryFist = 0; personalFist = 0 }
    let fist = Math.max(modelFist, geometryFist, personalFist)
    if (top?.categoryName === 'Closed_Fist' && top.score >= .6 && callMe < .8) callMe = 0
    if (callMe >= .65 && modelFist < .85) fist = 0
    const fistSource = fist === 0 ? 'none' : personalFist > Math.max(modelFist, geometryFist) ? 'personal' : geometryFist > modelFist ? 'geometry' : 'model'
    return { handIndex: shape.handIndex, modelLabel: top?.categoryName ?? 'unavailable', modelScore: clamp(top?.score ?? 0), modelFist, geometryFist, personalFist, fistSource, fist, callMe }
  })
  return { features: hands.length ? { fist: Math.max(...hands.map(h => h.fist)), callMe: Math.max(...hands.map(h => h.callMe)) } : {}, hands }
}
