import { Icon } from './Icon'

type ReleaseHeroProps = {
  onStart: () => void
  busy: boolean
  running: boolean
}

/** Camera access is requested only by the explicit start button. */
export function ReleaseHero({ onStart, busy, running }: ReleaseHeroProps) {
  return (
    <section className="release-hero" aria-labelledby="release-title">
      <div className="hero-copy">
        <div className="eyebrow">Котомемы</div>
        <h1 id="release-title" className="release-title">meme.cv</h1>
        <p className="hero-description">Покажи жест или выражение лица. Рядом появится кот.</p>
        <div className="hero-action-row">
          {running ? (
            <a className="primary hero-cta" href="#playground">Камера <Icon name="arrow-up-right" /></a>
          ) : (
            <button className="primary hero-cta" onClick={onStart} disabled={busy}>
              {busy ? 'Загрузка…' : 'Начать'} <Icon name="arrow-up-right" />
            </button>
          )}
          <span className="hero-smallprint">Видео остаётся в браузере.</span>
        </div>
        <div className="hero-bottom"><span>uprosti.tech</span><Icon name="arrow-down" /></div>
      </div>
      <div className="hero-cat-card">
        <div className="hero-cat-heading"><span>Кот</span><Icon name="asterisk" className="hero-card-star" /></div>
        <div className="hero-cat-art" aria-hidden="true">
          <svg viewBox="0 0 460 430" fill="none" className="hero-cat-svg">
            <g className="cat-orbit" stroke="currentColor" strokeWidth="1.2" opacity=".38">
              <ellipse cx="230" cy="216" rx="198" ry="158" transform="rotate(-28 230 216)" strokeDasharray="3 7" />
              <path d="M42 113V89h24m328 0h24v24M42 319v24h24m328 0h24v-24" strokeDasharray="none" />
              <path d="M230 41v20m-10-10h20M31 216h20m358 0h20M230 371v20m-10-10h20" />
            </g>
            <g className="hero-cat-face" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M111 190 99 76l100 69c22-5 42-5 64 0l99-69-11 114c39 109-23 166-120 166S72 299 111 190Z" fill="var(--accent)" />
              <path d="m117 112 9 62 44-18m174-44-9 62-44-18" strokeWidth="2.5" />
              <path d="M133 222c5-29 29-40 58-29 18 6 29 23 26 43-27 23-63 22-84-14Zm110 14c-3-20 8-37 26-43 29-11 53 0 58 29-21 36-57 37-84 14Z" fill="var(--paper)" />
              <g className="cat-pupils" fill="currentColor" stroke="none"><ellipse cx="179" cy="220" rx="9" ry="21" /><ellipse cx="280" cy="220" rx="9" ry="21" /></g>
              <path d="m217 270 13 10 13-10h-26Z" fill="currentColor" />
              <path d="M230 281v14m0 0c-10 15-24 11-28 3m28-3c10 15 24 11 28 3M143 271l-80-13m81 32-83 12m254-31 80-13m-81 32 83 12" />
              <path d="m205 156 5 17m20-20v17m25-14-5 17" strokeWidth="3" />
            </g>
            <g transform="translate(352 328) rotate(12)" stroke="currentColor" strokeWidth="1.5"><circle r="31" fill="var(--paper)" /><path d="m-10 3 7 7 15-18" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></g>
          </svg>
        </div>
        <div className="hero-cat-footer"><span>meme.cv</span><Icon name="arrow-up-right" /></div>
      </div>
    </section>
  )
}

export default ReleaseHero
