import { useState } from 'react'
import type { Meme } from '../lib/matching'

/** Uses the actual supplied image, never silently substitutes unrelated artwork. */
export function MemeArt({ meme, imageUrl }: { meme: Meme; imageUrl?: string }) {
  const src = imageUrl ?? `${import.meta.env.BASE_URL}${meme.image}`
  const [failed, setFailed] = useState<string | null>(null)
  if (failed === src) return <div className="missing-cat" role="img" aria-label="Изображение недоступно"><span aria-hidden="true">🐈</span><p>Не удалось загрузить картинку</p></div>
  return <img className="cat-image" src={src} alt={meme.title} onError={() => setFailed(src)} />
}
