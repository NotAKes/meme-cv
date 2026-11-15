import { useEffect, useRef, useState } from 'react'
import { Tracker } from './lib/tracker'
import { drawOverlay } from './lib/overlay'
import type { OverlayOptions } from './lib/overlay'
import { memes, rankMemes, smoothFeatures, MatchStabilizer } from './lib/matching'
import { handVector } from './lib/hand-gestures'
import type { HandExample, HandDecision } from './lib/hand-gestures'
import type { Features, MatchMode } from './lib/matching'
import { ReleaseHero } from './components/ReleaseHero'
import { CatMark } from './components/CatMark'
import { Icon } from './components/Icon'
import { TongueCalibration } from './components/TongueCalibration'
import type { TongueCalibrationHandle } from './components/TongueCalibration'
import { MemeArt } from './components/MemeArt'
import { loadImages } from './lib/image-store'
import { calibratedMemes, emptyCalibration, loadCalibration, medianFeatures, normalizeFace, persistCalibration } from './lib/calibration'
import './App.css'

const defaultOverlay: OverlayOptions = { enabled: true, boxes: true, face: true, mesh: false, pose: true, hands: true }
const featureLabels: Partial<Record<keyof Features, string>> = { mouthOpen: 'Рот', eyesOpen: 'Глаза', headDown: 'Голова вниз', headUp: 'Голова вверх', leftHandUp: 'Левая рука', rightHandUp: 'Правая рука', handsNearFace: 'Руки у лица', fist: 'Кулак', callMe: 'Жест 🤙', fingersTogether: 'Жест 👉👈', tongueOut: 'Язык' }
type Status = 'idle' | 'loading' | 'running' | 'error'
function tongueReasonLabel(reason: string) {
  const labels: Record<string, string> = {
    'not run': 'анализ ещё не запущен', 'face landmarks missing': 'не хватает точек лица',
    'video unavailable': 'видеокадр недоступен', 'crop too small': 'область рта слишком мала. подойди ближе',
    'canvas unavailable': 'не удалось прочитать пиксели камеры', 'insufficient lighting': 'недостаточное или слишком яркое освещение',
    'mouth unobservable': 'область рта плохо видна', 'invalid mouth geometry': 'не удалось определить контур рта',
    'personal calibration unavailable or out of distribution': 'положение или свет изменились. повтори настройку',
    'no tongue': 'анализ выполнен, язык не найден', 'tongue detected': 'найден признак языка',
  }
  return labels[reason] ?? reason
}

export default function App() {
  const [cameraReady, setCameraReady] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const artRef = useRef<HTMLDivElement>(null)
  const mouthRef = useRef<HTMLCanvasElement>(null)
  const tongueCalibrationRef = useRef<TongueCalibrationHandle>(null)
  const [tongueCapturing, setTongueCapturing] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const runtime = useRef<{ tracker?: Tracker; stream?: MediaStream; raf: number; generation: number }>({ raf: 0, generation: 0 })
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')
  const [overlay, setOverlay] = useState(defaultOverlay)
  const [mode, setMode] = useState<MatchMode>('combined')
  const [features, setFeatures] = useState<Features>({})
  const [activeId, setActiveId] = useState<string | null>(null)
  const [ranking, setRanking] = useState<ReturnType<typeof rankMemes>>([])
  const [metrics, setMetrics] = useState({ fps: 0, ms: 0, face: false, hands: 0 })
  const [diagnostics, setDiagnostics] = useState<{ tongueReason: string; tongueSource: string; hands: number; decisions: HandDecision[]; shapes: ReturnType<typeof import('./lib/cat-features').getHandShapeDiagnostics> }>({ tongueReason: 'not run', tongueSource: 'unavailable', hands: 0, decisions: [], shapes: [] })
  const [includeOverlay, setIncludeOverlay] = useState(true)
  const [saving, setSaving] = useState(false)
  const [calibration, setCalibration] = useState(loadCalibration)
  const [calibrationMessage, setCalibrationMessage] = useState('')
  const [capturing, setCapturing] = useState<string | null>(null)
  const captureRef = useRef<{ id: string; start: number; samples: Features[]; handSamples: HandExample[] } | null>(null)
  const calibrated = calibratedMemes(memes, calibration)
  function commitCalibration(next: typeof calibration) {
    setCalibration(next)
    try { persistCalibration(next) } catch { setCalibrationMessage('Настройки действуют до закрытия страницы. Браузер не разрешил их сохранить.') }
  }
  function capturePose(id: string) {
    captureRef.current = { id, start: performance.now(), samples: [], handSamples: [] }
    setCapturing(id); setCalibrationMessage('Держи позу 3 секунды. При настройке лица смотри прямо и расслабь лицо.')
  }
  function processCapture(raw: Features, now: number, shapes: ReturnType<typeof import('./lib/cat-features').getHandShapeDiagnostics>) {
    const capture = captureRef.current
    if (!capture) return
    // Give the user time to release the mouse and actually make the gesture.
    if (now - capture.start < 800) return
    capture.samples.push(raw)
    if (capture.id === 'fist-cat') {
      const vectors = shapes.map(shape => ({ shape, vector: handVector(shape) }))
        .filter((entry): entry is { shape: typeof shapes[number]; vector: HandExample } => !!entry.vector)
        .filter(({ shape, vector }) => Math.max(...vector.slice(0, 4)) < .7 && (shape.callMe ?? 0) < .65)
        .sort((a, b) => a.vector.slice(0, 4).reduce((s, v) => s + v, 0) - b.vector.slice(0, 4).reduce((s, v) => s + v, 0))
      if (vectors[0]) capture.handSamples.push(vectors[0].vector)
    }
    if (now - capture.start < 3000) return
    captureRef.current = null; setCapturing(null)
    const target = medianFeatures(capture.samples)
    const meme = memes.find(m => m.id === capture.id)
    const handOnly = meme?.requiredFeatures?.some(key => ['fist', 'callMe', 'fingersTogether'].includes(key))
    if (capture.samples.length < 5 || (!handOnly && (target.eyesOpen === undefined || target.mouthOpen === undefined))) {
      setCalibrationMessage('Не удалось записать лицо. Добавь свет и повтори.'); return
    }
    const current = optionsRef.current.calibration
    if (capture.id === 'fist-cat') {
      if (capture.handSamples.length < Math.max(5, capture.samples.length * .6)) {
        setCalibrationMessage('Не удалось записать кулак. Покажи кисть целиком и согни четыре пальца.'); return
      }
      const example = Array.from({ length: 5 }, (_, i) => capture.handSamples.map(v => v[i]).sort((a, b) => a - b)[Math.floor(capture.handSamples.length / 2)])
      const spread = capture.handSamples.reduce((sum, v) => sum + Math.sqrt(v.reduce((s, x, i) => s + (x - example[i]) ** 2, 0) / 5), 0) / capture.handSamples.length
      if (spread > .14) { setCalibrationMessage('Рука двигалась во время записи. Повтори, держа кулак неподвижно.'); return }
      commitCalibration({ ...current, fistExamples: [...(current.fistExamples ?? []), example].slice(-6), poses: { ...current.poses, [capture.id]: { ...target, fist: 1 } } })
      setCalibrationMessage('Образец кулака сохранён. Можно записать ещё один ракурс.'); return
    }
    const missing = meme?.requiredFeatures?.find(key => (target[key] ?? 0) < (['fist', 'callMe', 'fingersTogether'].includes(key) ? .6 : .45))
    if (missing) { setCalibrationMessage(`Не удалось записать признак «${featureLabels[missing] ?? missing}». Попробуй ещё раз.`); return }
    commitCalibration(capture.id === 'neutral' ? { ...current, neutral: target } : { ...current, poses: { ...current.poses, [capture.id]: target } })
    setCalibrationMessage(capture.id === 'neutral' ? 'Образец лица сохранён.' : 'Поза сохранена.')
  }
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})
  const urlsRef = useRef<Record<string, string>>({})
  useEffect(() => {
    let cancelled = false
    loadImages().then(images => {
      if (cancelled) return
      const urls = Object.fromEntries(Object.entries(images).map(([id, blob]) => [id, URL.createObjectURL(blob)]))
      urlsRef.current = urls; setImageUrls(urls)
    }).catch(() => { /* Bundled images remain available. */ })
    return () => { cancelled = true; Object.values(urlsRef.current).forEach(URL.revokeObjectURL); urlsRef.current = {} }
  }, [])

  const optionsRef = useRef({ overlay, mode, calibration, calibrated })
  useEffect(() => { optionsRef.current = { overlay, mode, calibration, calibrated } }, [overlay, mode, calibration, calibrated])
  const active = memes.find(m => m.id === activeId)

  function release() {
    setCameraReady(false)
    const r = runtime.current
    r.generation++
    captureRef.current = null
    tongueCalibrationRef.current?.cancel()
    cancelAnimationFrame(r.raf)
    r.stream?.getTracks().forEach(track => track.stop())
    r.stream = undefined
    r.tracker?.close()
    r.tracker = undefined
    if (videoRef.current) videoRef.current.srcObject = null
    const canvas = canvasRef.current
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
  }
  useEffect(() => () => release(), [])

  function stop() {
    release(); setCapturing(null); setStatus('idle'); setActiveId(null); setFeatures({}); setRanking([])
    setDiagnostics({ tongueReason: 'not run', tongueSource: 'unavailable', hands: 0, decisions: [], shapes: [] })
    const mouth = mouthRef.current; mouth?.getContext('2d')?.clearRect(0, 0, mouth.width, mouth.height)
    setMetrics({ fps: 0, ms: 0, face: false, hands: 0 })
  }

  async function start() {
    release()
    const generation = runtime.current.generation
    const valid = () => generation === runtime.current.generation
    setStatus('loading'); setMessage('Запрашиваем доступ к камере…')
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Камера доступна только на localhost или по HTTPS.')
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
      if (!valid()) { stream.getTracks().forEach(t => t.stop()); return }
      runtime.current.stream = stream
      const video = videoRef.current!
      video.srcObject = stream
      await video.play()
      if (valid()) setCameraReady(true)
      if (!valid()) return
      const tracker = await Tracker.create(text => { if (valid()) setMessage(text) })
      if (!valid()) { tracker.close(); return }
      runtime.current.tracker = tracker
      setStatus('running')
      let lastVideoTime = -1
      let lastDetection = 0
      let lastUi = 0
      let previous: Features = {}
      let selected: string | null = null
      let lastMode = optionsRef.current.mode
      const stabilizer = new MatchStabilizer()
      const tick = (now: number) => {
        if (!valid()) return
        try {
          if (video.readyState >= 2 && video.currentTime !== lastVideoTime && now - lastDetection >= 65) {
            const interval = now - lastDetection
            lastDetection = now
            lastVideoTime = video.currentTime
            const began = performance.now()
            const result = tracker.detect(video, now, optionsRef.current.calibration.fistExamples, optionsRef.current.calibration.tongueProfile)
            tongueCalibrationRef.current?.observe(tracker.tongueObservation, now)
            processCapture(result.features, now, tracker.diagnostics.handShapes)
            previous = smoothFeatures(previous, normalizeFace(result.features, optionsRef.current.calibration.neutral), .5)
            const canvas = canvasRef.current!
            if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
              canvas.width = video.videoWidth; canvas.height = video.videoHeight
            }
            drawOverlay(canvas, result.frame, optionsRef.current.overlay)
            if (lastMode !== optionsRef.current.mode) { stabilizer.reset(); selected = null; lastMode = optionsRef.current.mode }
            const ranked = rankMemes(previous, lastMode, optionsRef.current.calibrated)
            const current = ranked.find(r => r.meme.id === selected)
            const best = ranked[0]
            const candidate = best && best.distance < 0.65
              ? current && current.distance - best.distance < 0.015 ? current.meme.id : best.meme.id
              : null
            selected = stabilizer.update(candidate, now)
            if (now - lastUi > 100) {
              setFeatures(previous); setRanking(ranked); setActiveId(selected)
              const tongue = tracker.diagnostics.tongue
              setDiagnostics({ tongueReason: tongue.reason, tongueSource: tongue.source, hands: result.frame.hands.length, decisions: tracker.diagnostics.hands, shapes: tracker.diagnostics.handShapes })
              const preview = mouthRef.current
              const context = preview?.getContext('2d')
              if (preview && context) {
                context.clearRect(0, 0, preview.width, preview.height)
                if (tongue.crop) {
                  const { x, y, width, height } = tongue.crop
                  const scale = Math.min(preview.width / width, preview.height / height)
                  context.drawImage(video, x, y, width, height, (preview.width - width * scale) / 2, (preview.height - height * scale) / 2, width * scale, height * scale)
                }
              }
              setMetrics({ fps: Math.round(1000 / interval), ms: Math.round(performance.now() - began), face: result.frame.face.length > 0, hands: result.frame.hands.length })
              lastUi = now
            }
          }
          runtime.current.raf = requestAnimationFrame(tick)
        } catch (error) { fail(error) }
      }
      runtime.current.raf = requestAnimationFrame(tick)
    } catch (error) { if (valid()) fail(error) }
  }

  function fail(error: unknown) {
    release(); setCapturing(null); setStatus('error'); setFeatures({}); setRanking([]); setActiveId(null)
    const name = error instanceof Error ? error.name : ''
    setMessage(name === 'NotAllowedError' ? 'Нет доступа к камере. Разреши его в настройках браузера.' : name === 'NotFoundError' ? 'Камера не найдена. Проверь подключение.' : error instanceof Error ? error.message : 'Не удалось запустить распознавание.')
  }

  async function saveCollage() {
    const video = videoRef.current
    const catImage = artRef.current?.querySelector('img')
    if (!video || !active || status !== 'running') return
    if (!catImage?.complete || !catImage.naturalWidth) { setMessage('Не удалось загрузить картинку для коллажа.'); return }
    setSaving(true)
    try {
      const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 560
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#10151d'; ctx.fillRect(0, 0, 1200, 560)
      ctx.save(); ctx.translate(620, 24); ctx.scale(-1, 1)
      ctx.drawImage(video, 0, 0, 600, 450)
      if (includeOverlay && canvasRef.current) ctx.drawImage(canvasRef.current, 0, 0, 600, 450)
      ctx.restore()
      const scale = Math.min(540 / catImage.naturalWidth, 405 / catImage.naturalHeight)
      const width = catImage.naturalWidth * scale, height = catImage.naturalHeight * scale
      ctx.drawImage(catImage, 640 + (540 - width) / 2, 24 + (405 - height) / 2, width, height)
      ctx.fillStyle = '#e8edf4'; ctx.font = 'bold 24px sans-serif'; ctx.fillText('meme.cv', 650, 465)
      ctx.font = '16px monospace'; ctx.fillStyle = '#94a3b8'; ctx.fillText('meme.cv', 24, 530)
      const link = document.createElement('a'); link.download = `meme-cv-${Date.now()}.png`; link.href = canvas.toDataURL('image/png'); link.click()
    } catch { setMessage('Не удалось сохранить коллаж. Попробуй ещё раз.') }
    finally { setSaving(false) }
  }

  const busy = status === 'loading'
  return <main>
    <a className="skip-link" href="#playground">Перейти к камере</a>
    <header className="topbar"><a className="brand" href="/"><CatMark className="brand-mark" /><span>meme<span className="brand-dot">.</span>cv</span></a><nav className="site-nav" aria-label="Навигация"><a href="#playground">Камера</a><a href="/themes">Оформление</a><a href="https://uprosti.tech">uprosti.tech <Icon name="arrow-up-right" /></a></nav></header>
    <ReleaseHero onStart={() => { void start(); document.getElementById('playground')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }) }} busy={busy} running={status === 'running'} />
    <section className="section-kicker" id="playground"><div><h2>Камера</h2></div><p>Покажи лицо и руки в кадре.</p></section>
    <div className="workspace">
      <section className="panel camera-panel"><div className="panel-heading"><h2><span className="dot" /> Твоя камера</h2><span className="mono">{cameraReady ? 'Включена' : busy ? 'Подключение' : 'Выключена'}</span></div>
        <div className="camera-stage">
          <video ref={videoRef} muted playsInline className={cameraReady ? 'visible' : ''} />
          <canvas ref={canvasRef} className="cv-canvas" aria-label="Разметка лица и рук" />
          {status !== 'running' && <div className={`camera-placeholder${cameraReady ? ' camera-loading' : ''}`}><div className="viewfinder"><Icon name="plus" /></div><h3>{busy ? 'Загрузка моделей' : status === 'error' ? 'Не получилось подключиться' : 'Камера выключена'}</h3><p role="status">{busy || status === 'error' ? message : 'Видео обрабатывается в браузере.'}</p>{!busy && <button className="primary" onClick={start}><Icon name="arrow-up-right" /> Включить камеру</button>}</div>}
          {status === 'running' && <><span className="live-badge"><i /> Камера включена</span><div className="camera-hud"><span>{metrics.face ? 'Лицо найдено' : 'Лицо не найдено'}. Рук в кадре: {metrics.hands}</span><span>{metrics.fps} кадров/с · {metrics.ms} мс</span></div></>}
        </div>
        <div className="camera-footer"><span>{status === 'running' ? 'Один человек в кадре' : 'Камера включается по кнопке'}</span>{(busy || status === 'running') && <button className="text-button" onClick={stop}>{busy ? 'Отмена' : <><Icon name="stop" /> Остановить</>}</button>}</div>
      </section>
      <section className="panel result-panel"><div className="panel-heading"><h2>Результат</h2></div>
        <div className="meme-display" ref={artRef}>{active ? <MemeArt meme={active} imageUrl={imageUrls[active.id]} /> : <div className="result-placeholder"><CatMark className="result-cat-mark" /><p>{status === 'running' ? 'Покажи мимику или жест' : 'Включи камеру'}</p></div>}</div>
        <div className="export-row"><button className="secondary" disabled={!active || saving || status !== 'running'} onClick={saveCollage}>{saving ? 'Сохраняем…' : <><Icon name="arrow-down" /> Сохранить коллаж</>}</button><label className="small-check"><input type="checkbox" checked={includeOverlay} onChange={e => setIncludeOverlay(e.target.checked)} /> С разметкой</label></div>
      </section>
    </div>
    <section className="panel controls"><div className="control-group"><div className="control-title"><h2>Разметка</h2><label className="switch"><input aria-label="Показать CV-разметку" type="checkbox" checked={overlay.enabled} onChange={e => setOverlay({ ...overlay, enabled: e.target.checked })} /><span /></label></div><p>Выбери, что показать поверх видео.</p><div className="layer-options">{([['boxes', 'Рамки'], ['face', 'Мимика'], ['pose', 'Руки'], ['hands', 'Пальцы'], ['mesh', 'Сетка лица']] as const).map(([key, label]) => <label key={key}><input type="checkbox" disabled={!overlay.enabled} checked={overlay[key]} onChange={e => setOverlay({ ...overlay, [key]: e.target.checked })} />{label}</label>)}</div></div><div className="control-group"><h2>Сравнение</h2><p>По лицу, рукам или вместе.</p><div className="segmented" role="group" aria-label="Режим сравнения">{([['combined', 'Вместе'], ['face', 'Мимика'], ['pose', 'Поза']] as const).map(([value, label]) => <button key={value} aria-pressed={mode === value} className={mode === value ? 'selected' : ''} onClick={() => setMode(value)}>{label}</button>)}</div></div></section>
    {message && status === 'running' && <p role="status" className="notice">{message.startsWith('Не удалось') ? message : ''}</p>}
    <div className="recognition-help"><button className="text-button" onClick={() => { setAdvancedOpen(true); document.getElementById('recognition-settings')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }) }}>Открыть настройки <Icon name="arrow-up-right" /></button></div>
    <details className="advanced-settings" open={advancedOpen} onToggle={e => setAdvancedOpen(e.currentTarget.open)} id="recognition-settings"><summary>Настройки <Icon name="plus" /></summary>
    <section className="panel calibration-panel" aria-label="Калибровка распознавания">
      <div><h2>Калибровка</h2><p>Можно пропустить. Нужна, если распознавание ошибается.</p></div>
      <div className="calibration-actions"><button className="secondary" disabled={status !== 'running' || capturing !== null || tongueCapturing} onClick={() => capturePose('neutral')}>{capturing === 'neutral' ? 'Удерживайте 3 секунды…' : calibration.neutral ? 'Повторить калибровку лица' : 'Калибровать лицо'}</button><button className="text-button" disabled={capturing !== null || tongueCapturing} onClick={() => { commitCalibration(emptyCalibration()); setCalibrationMessage('Калибровка сброшена.') }}>Сбросить настройки</button></div>
      <p aria-live="polite">{calibrationMessage}</p>
      <TongueCalibration ref={tongueCalibrationRef} enabled={status === 'running' && capturing === null} profile={calibration.tongueProfile} onBusy={setTongueCapturing} onProfile={profile => commitCalibration({ ...optionsRef.current.calibration, tongueProfile: profile })} />
      <div className="recognition-diagnostics" aria-label="Диагностика жестов и языка"><div><canvas ref={mouthRef} width={256} height={160} aria-label="Область анализа языка" /><span>Область рта. Видна только тебе.</span></div><div><p><strong>Кисти:</strong> {status !== 'running' ? 'камера выключена' : diagnostics.hands ? `обнаружено ${diagnostics.hands}` : 'не найдены. покажи кисть целиком'}</p><p><strong>Язык:</strong> {tongueReasonLabel(diagnostics.tongueReason)}. {diagnostics.tongueSource === 'personal' ? 'персональная настройка' : diagnostics.tongueSource === 'heuristic' ? 'базовая эвристика' : 'нет наблюдения'}</p><p>0: признак не найден. Нет данных: область не видна.</p>
        {diagnostics.decisions.map(hand => <p key={hand.handIndex}><strong>Кисть {hand.handIndex + 1}, модель:</strong> {hand.modelLabel} / {hand.modelScore.toFixed(2)}; кулак модели: {hand.modelFist.toFixed(2)}; геометрия: {hand.geometryFist.toFixed(2)}; мой образец: {hand.personalFist.toFixed(2)}; итог кулака: {hand.fist.toFixed(2)} ({hand.fistSource}); 🤙: {hand.callMe.toFixed(2)}</p>)}
        {!!diagnostics.shapes.length && <details className="finger-diagnostics"><summary>Положение пальцев</summary>{diagnostics.shapes.map(hand => <p key={hand.handIndex}>Кисть {hand.handIndex + 1}: большой палец отведён {hand.thumbSpread?.toFixed(2) ?? 'нет данных'}; мизинец выпрямлен {hand.pinkyExtended?.toFixed(2) ?? 'нет данных'}; указательный выпрямлен {hand.indexExtended?.toFixed(2) ?? 'нет данных'}; средний {hand.middleExtended?.toFixed(2) ?? 'нет данных'}; безымянный {hand.ringExtended?.toFixed(2) ?? 'нет данных'}</p>)}</details>}
        </div></div>
      <p className="tongue-warning">Распознавание языка экспериментальное и может ошибаться. При смене света настройку можно повторить.</p>
    </section>
    <section className="details-grid"><div><div className="section-heading"><h2>Другие варианты</h2></div><div className="alternatives">{(ranking.length ? ranking.filter(r => r.meme.id !== activeId).slice(0, 3).map(r => r.meme) : memes.slice(0, 3)).map(meme => <article className="mini-meme" key={meme.id}><MemeArt meme={meme} imageUrl={imageUrls[meme.id]} /></article>)}</div></div><div className="signals"><div className="section-heading"><h2>Сигналы</h2><span className="mono">От 0 до 1</span></div>{Object.entries(featureLabels).map(([key, label]) => { const value = features[key as keyof Features]; return <div className="signal" key={key}><span>{label}</span><div className="track"><div style={{ width: `${(value ?? 0) * 100}%` }} /></div><code>{value === undefined ? 'нет данных' : value.toFixed(2)}</code></div> })}</div></section>
    </details>
    <footer><a href="https://uprosti.tech">uprosti.tech</a><span>2026</span><a href="#playground">К камере <Icon name="arrow-up-right" /></a></footer>
  </main>
}
