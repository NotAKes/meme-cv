import { useImperativeHandle, useRef, useState } from 'react'
import type { Ref } from 'react'
import { buildTongueProfile } from '../lib/tongue-calibration'
import type { TongueProfile } from '../lib/tongue-calibration'

export interface TongueCalibrationHandle { observe: (descriptor: number[] | undefined, now: number) => void; cancel: () => void }
interface Props { ref: Ref<TongueCalibrationHandle>; enabled: boolean; profile?: TongueProfile; onProfile: (profile: TongueProfile | undefined) => void; onBusy: (busy: boolean) => void }
const instructions = [
  ['Рот закрыт', 'Расслабь лицо и держи рот закрытым.'],
  ['Рот открыт, язык внутри', 'Открой рот, но не высовывай язык. Это важно: открытый рот не должен считаться языком.'],
  ['Покажи язык', 'Высунь язык, чтобы его кончик был хорошо виден. Держи голову примерно как на предыдущих шагах.'],
]

export function TongueCalibration({ ref, enabled, profile, onProfile, onBusy }: Props) {
  const [step, setStep] = useState(0)
  const [progress, setProgress] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const samples = useRef<number[][][]>([[], [], []])
  const capture = useRef<{ start: number; step: number; samples: number[][] } | null>(null)
  function cancel() { capture.current = null; setProgress(null); onBusy(false) }
  useImperativeHandle(ref, () => ({ cancel, observe(descriptor, now) {
    const active = capture.current
    if (!active) return
    const elapsed = now - active.start
    setProgress(Math.min(100, Math.round(elapsed / 35)))
    if (elapsed >= 900 && descriptor) active.samples.push(descriptor)
    if (elapsed < 3500) return
    cancel()
    if (active.samples.length < 7) { setMessage('Не хватает чётких кадров рта. Приблизься к камере, добавь свет и повтори этот шаг.'); return }
    samples.current[active.step] = active.samples.slice(-20)
    if (active.step < 2) { setStep(active.step + 1); setMessage('Образец записан. Подготовь следующую позу и нажми кнопку.'); return }
    try {
      const next = buildTongueProfile([...samples.current[0], ...samples.current[1]], samples.current[2])
      onProfile(next); setMessage('Настройка сохранена в этом браузере. Проверь: рот открыт без языка: низкий сигнал; высунутый язык: высокий.'); setStep(0)
    } catch { setMessage('Не удалось надёжно отличить язык от открытого рта. Повтори все три шага при ровном освещении, высовывая язык заметнее.'); setStep(0); samples.current = [[], [], []] }
  } }))
  function start() {
    capture.current = { start: performance.now(), step, samples: [] }
    setProgress(0); onBusy(true); setMessage('Удерживай положение 3,5 секунды. Первую секунду можно подготовиться.')
  }
  return <section className="tongue-calibration" aria-label="Настройка языка">
    <div className="control-title"><h3>Калибровка языка</h3><span className="tag">{profile ? 'ПРОФИЛЬ СОХРАНЁН' : 'ЭКСПЕРИМЕНТ'}</span></div>
    <p>Запиши три положения рта. Каждое занимает 3,5 секунды.</p>
    <ol className="tongue-steps">{instructions.map(([title], index) => <li className={step === index ? 'current' : ''} key={title}><span>{index + 1}</span>{title}</li>)}</ol>
    <p className="tongue-instruction"><strong>Шаг {step + 1}. {instructions[step][0]}.</strong> {instructions[step][1]}</p>
    <div className="calibration-actions"><button className="secondary" disabled={!enabled || progress !== null} onClick={start}>{progress !== null ? `Запись · ${progress}%` : `Записать шаг ${step + 1}`}</button>
      {progress !== null && <button className="text-button" onClick={cancel}>Отменить запись</button>}
      {profile && progress === null && <button className="text-button" onClick={() => { onProfile(undefined); samples.current = [[], [], []]; setStep(0); setMessage('Профиль языка удалён. Используется базовый экспериментальный анализ.') }}>Сбросить профиль языка</button>}
    </div>
    {progress !== null && <progress max={100} value={progress} aria-label="Запись образца языка" />}
    <p aria-live="polite">{message}</p>
    <small>Настройка не гарантирует точность: при смене освещения может потребоваться повтор. Закрытие настроек не выключает камеру.</small>
  </section>
}
