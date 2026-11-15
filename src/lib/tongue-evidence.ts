/** Confirms repeated visual evidence, bridges brief misses, never invents missing observations. */
export class TongueEvidence {
  private recent: { score: number; at: number }[] = []
  private confirmedAt = -Infinity
  private negatives = 0
  private last = -Infinity

  update(score: number | undefined, now: number): number | undefined {
    if (score === undefined || !Number.isFinite(score) || !Number.isFinite(now)) {
      this.reset()
      return undefined
    }
    if (now < this.last || now - this.last > 500) this.reset()
    this.last = now
    score = Math.max(0, Math.min(1, score))
    this.recent = [...this.recent.filter(sample => now - sample.at <= 300), { score, at: now }].slice(-4)
    const positive = this.recent.filter(sample => sample.score >= .6)
    this.negatives = score < .2 ? this.negatives + 1 : 0
    if (positive.length >= 2 && score >= .6) this.confirmedAt = now
    if (this.negatives >= 3) this.confirmedAt = -Infinity
    if (now - this.confirmedAt <= 450) return Math.max(.65, score)
    // An isolated positive cannot select a tongue card.
    return Math.min(.4, score)
  }

  private reset() {
    this.recent = []; this.confirmedAt = -Infinity; this.negatives = 0; this.last = -Infinity
  }
}
