export const themes = [
  { id: 'graphite', name: 'Без цвета', accent: '#d8d8d2' },
  { id: 'sage', name: 'Шалфей', accent: '#bac9ae' },
  { id: 'blue', name: 'Голубой', accent: '#b5c9da' },
  { id: 'lilac', name: 'Сиреневый', accent: '#c8bbd5' },
  { id: 'sand', name: 'Песочный', accent: '#d8c7a7' },
  { id: 'rose', name: 'Пыльная роза', accent: '#d5b6b6' },
  { id: 'lime', name: 'Лайм', accent: '#c3f34a' },
  { id: 'yellow', name: 'Жёлтый', accent: '#f4da49' },
  { id: 'turquoise', name: 'Бирюзовый', accent: '#43d9cf' },
  { id: 'pink', name: 'Розовый', accent: '#f18ac2' },
  { id: 'electric-blue', name: 'Синий', accent: '#8da9ff' },
  { id: 'mint', name: 'Мятный', accent: '#67e3ac' },
] as const

export type ThemeId = typeof themes[number]['id']
export const themeStorageKey = 'meme-cv-theme-v1'
export const defaultTheme: ThemeId = 'graphite'

export function loadTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(themeStorageKey)
    return themes.find(theme => theme.id === saved)?.id ?? defaultTheme
  } catch { return defaultTheme }
}

export function applyTheme(id: ThemeId) {
  const theme = themes.find(theme => theme.id === id) ?? themes[0]
  document.documentElement.dataset.theme = theme.id
  document.documentElement.style.setProperty('--accent', theme.accent)
}

export function saveTheme(id: ThemeId): boolean {
  applyTheme(id)
  try { localStorage.setItem(themeStorageKey, id); return true } catch { return false }
}
