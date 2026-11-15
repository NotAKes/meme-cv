import { Icon } from './Icon'
import { HeroCat } from './HeroCat'

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
              {busy ? 'Загрузка…' : 'Начать'} <Icon name="arrow-down" />
            </button>
          )}
          <span className="hero-smallprint">Видео остаётся в браузере.</span>
        </div>
        <div className="hero-bottom"><span>uprosti.tech</span><Icon name="arrow-down" /></div>
      </div>
      <div className="hero-cat-card">
        <div className="hero-cat-art" aria-hidden="true">
          <HeroCat />
        </div>
        <div className="hero-cat-footer"><span>meme.cv</span><Icon name="arrow-up-right" /></div>
      </div>
    </section>
  )
}

export default ReleaseHero
