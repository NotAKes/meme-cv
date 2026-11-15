import { useState } from 'react'
import type { CSSProperties } from 'react'
import { CatMark } from './CatMark'
import { Icon } from './Icon'
import { ReleaseHero } from './ReleaseHero'
import { defaultTheme, loadTheme, saveTheme, themes } from '../lib/theme'
import type { ThemeId } from '../lib/theme'
import '../App.css'
import './ThemePage.css'

export function ThemePage() {
  const [selected, setSelected] = useState<ThemeId>(loadTheme)
  const [message, setMessage] = useState('')
  function select(id: ThemeId) {
    const persisted = saveTheme(id)
    setSelected(id)
    const name = themes.find(theme => theme.id === id)!.name
    setMessage(persisted ? `${name}. Сохранено.` : `${name}. Браузер не разрешил сохранить выбор.`)
  }

  return <main className="themes-page">
    <a className="skip-link" href="#theme-options">К выбору цвета</a>
    <header className="topbar">
      <a className="brand" href="/"><CatMark className="brand-mark" /><span>meme<span className="brand-dot">.</span>cv</span></a>
      <nav className="site-nav" aria-label="Навигация">
        <a href="/">Камера</a>
        <a href="/themes" aria-current="page">Оформление</a>
        <a href="https://uprosti.tech">uprosti.tech <Icon name="arrow-up-right" /></a>
      </nav>
    </header>
    <section className="theme-picker" aria-labelledby="theme-title">
      <div className="theme-heading"><div><h1 id="theme-title">Оформление</h1><p>Выбери цвет кнопок и панели с котом.</p></div><a className="secondary" href="/">К камере <Icon name="arrow-up-right" /></a></div>
      <fieldset id="theme-options" className="theme-options">
        <legend>Цвет</legend>
        <div className="theme-swatches">
          {themes.map(theme => <label className="theme-option" key={theme.id} style={{ '--swatch': theme.accent } as CSSProperties}>
            <input type="radio" name="theme" value={theme.id} checked={selected === theme.id} onChange={() => select(theme.id)} />
            <span className="theme-swatch" aria-hidden="true"><CatMark /><Icon name="check" className="theme-selected" /></span>
            <span className="theme-option-name">{theme.name}</span>
            <span className="theme-hex">{theme.accent}</span>
          </label>)}
        </div>
      </fieldset>
      <div className="theme-save-row"><p role="status" aria-live="polite">{message || 'Выбор сохраняется в этом браузере.'}</p><button className="text-button" onClick={() => select(defaultTheme)}>Сбросить цвет</button></div>
    </section>
    <section className="theme-preview" aria-labelledby="preview-title">
      <div className="section-heading"><h2 id="preview-title">На главной</h2><span className="mono">Предпросмотр</span></div>
      <ReleaseHero preview onStart={() => { window.location.href = '/#playground' }} busy={false} running={false} />
      <div className="theme-sample-controls panel">
        <label className="small-check"><input type="checkbox" defaultChecked /> С разметкой</label>
        <button className="secondary" type="button" onClick={() => { window.location.href = '/' }}>Открыть главную <Icon name="arrow-up-right" /></button>
      </div>
    </section>
    <footer><a href="https://uprosti.tech">uprosti.tech</a><span>2026</span><a href="/">К камере <Icon name="arrow-up-right" /></a></footer>
  </main>
}
