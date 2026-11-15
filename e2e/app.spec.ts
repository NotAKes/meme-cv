import { test, expect } from '@playwright/test'

test('overlay settings and matching mode work before camera starts', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('meme.cv')
  const overlay = page.getByRole('checkbox', { name: 'Показать CV-разметку' })
  await overlay.uncheck()
  await expect(page.getByRole('checkbox', { name: 'Рамки', exact: true })).toBeDisabled()
  await overlay.check()
  await expect(page.getByRole('checkbox', { name: 'Сетка лица' })).toBeEnabled()
  await page.getByRole('button', { name: 'Поза', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Поза', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Сохранить коллаж' })).toBeDisabled()
})

test('camera permission denial has an actionable error', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError') }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Включить камеру' }).click()
  await expect(page.getByRole('status')).toContainText('Нет доступа к камере')
  await expect(page.getByRole('button', { name: 'Включить камеру' })).toBeEnabled()
})

test('real MediaPipe models initialize and process synthetic camera frames', async ({ browser }) => {
  const context = await browser.newContext({ permissions: ['camera'] })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement('canvas')
      canvas.width = 640; canvas.height = 480
      const ctx = canvas.getContext('2d')!
      let i = 0
      const timer = setInterval(() => { ctx.fillStyle = i++ % 2 ? '#203040' : '#304050'; ctx.fillRect(0, 0, 640, 480) }, 70)
      const stream = canvas.captureStream(15)
      stream.getTracks()[0].addEventListener('ended', () => clearInterval(timer))
      return stream
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Включить камеру' }).click()
  await expect(page.locator('.live-badge')).toBeVisible({ timeout: 60000 })
  await expect(page.locator('.camera-hud')).toContainText('Лицо не найдено', { timeout: 20000 })
  await expect(page.locator('.camera-hud')).toContainText(/[1-9]\d* MS/, { timeout: 20000 })
  await expect(page.locator('.cv-canvas')).toHaveAttribute('width', '640')
  await page.getByRole('checkbox', { name: 'Показать CV-разметку' }).uncheck()
  await page.getByRole('button', { name: 'Остановить' }).click()
  await expect(page.getByRole('button', { name: 'Включить камеру' })).toBeVisible()
  expect(errors).toEqual([])
  await context.close()
})

test('mobile layout fits viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true })
})

test('catalog and visible meme names are removed', async ({ page }) => {
  await page.goto('/')
  await page.locator('.advanced-settings > summary').click()
  await expect(page.getByRole('region', { name: 'Каталог котомемов' })).toHaveCount(0)
  await expect(page.locator('.collection-card')).toHaveCount(0)
  await expect(page.getByText('Кот в недоумении', { exact: true })).toHaveCount(0)
  expect(await page.locator('main').innerText()).not.toContain('—')
})

test('calibration controls expose tongue diagnostics and preserve user settings', async ({ page }) => {
  await page.goto('/')
  await page.locator('.advanced-settings > summary').click()
  await expect(page.getByRole('button', { name: 'Калибровать лицо', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Запомнить мою позу', exact: true })).toHaveCount(0)
  await expect(page.getByText('Распознавание языка экспериментальное.', { exact: false })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Настройка языка' }).getByRole('button', { name: 'Записать шаг 1' })).toBeDisabled()
  await page.evaluate(() => localStorage.setItem('meme-cv-calibration-v1', JSON.stringify({ neutral: { eyesOpen: .6, mouthOpen: .02 }, poses: {} })))
  await page.reload()
  await page.locator('.advanced-settings > summary').click()
  await expect(page.getByRole('button', { name: 'Повторить калибровку лица' })).toBeDisabled()
  await page.getByRole('button', { name: 'Сбросить настройки' }).click()
  await expect(page.getByRole('button', { name: 'Калибровать лицо', exact: true })).toBeDisabled()
})


test('camera access requires an explicit action', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, '__cameraRequests', { value: 0, writable: true })
    navigator.mediaDevices.getUserMedia = async () => {
      (window as unknown as { __cameraRequests: number }).__cameraRequests++
      throw new DOMException('Denied', 'NotAllowedError')
    }
  })
  await page.goto('/')
  await expect(page.locator('.advanced-settings')).not.toHaveAttribute('open')
  await expect(page.locator('.collection-card')).toHaveCount(0)
  expect(await page.evaluate(() => (window as unknown as { __cameraRequests: number }).__cameraRequests)).toBe(0)
  await page.getByRole('button', { name: 'Начать', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Нет доступа к камере')
  expect(await page.evaluate(() => (window as unknown as { __cameraRequests: number }).__cameraRequests)).toBe(1)
})

test('personal tongue wizard collects both negative poses and tongue, persists and resets the profile', async ({ page }) => {
  await page.route('**/src/lib/tracker.ts*', route => route.fulfill({ contentType: 'text/javascript', body: `
    export class Tracker {
      static async create() { return new Tracker() }
      detect() { return { frame: {face:[], pose:[], hands:[]}, features: {mouthOpen:0, eyesOpen:.7} } }
      get tongueObservation() { return Array(107).fill(window.__mouthKind === 'tongue' ? .6 : window.__mouthKind === 'open' ? .22 : .2) }
      get diagnostics() { return {tongue:{source:'heuristic',reason:'no tongue'}, hands:[],handShapes:[]} }
      close() {}
    }
  ` }))
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480
      const ctx = canvas.getContext('2d')!
      const timer = setInterval(() => { ctx.fillStyle = '#303030'; ctx.fillRect(0, 0, 640, 480) }, 65)
      const stream = canvas.captureStream(15)
      stream.getTracks()[0].addEventListener('ended', () => clearInterval(timer))
      return stream
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Включить камеру' }).click()
  await expect(page.locator('.live-badge')).toBeVisible()
  await expect(page.locator('.advanced-settings')).not.toHaveAttribute('open')
  await expect(page.locator('.meme-display .cat-image')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('meme-cv-calibration-v1'))).toBeNull()
  await page.locator('.advanced-settings > summary').click()
  const wizard = page.getByRole('region', { name: 'Настройка языка' })
  for (const [i, kind] of ['closed', 'open', 'tongue'].entries()) {
    await page.evaluate(kind => { (window as unknown as { __mouthKind: string }).__mouthKind = kind }, kind)
    await wizard.getByRole('button', { name: `Записать шаг ${i + 1}` }).click()
    await expect(wizard.getByRole('progressbar')).toBeVisible()
    if (i < 2) await expect(wizard.getByRole('button', { name: `Записать шаг ${i + 2}` })).toBeEnabled({ timeout: 8000 })
    else await expect(wizard.getByText('ПРОФИЛЬ СОХРАНЁН')).toBeVisible({ timeout: 8000 })
  }
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('meme-cv-calibration-v1')!).tongueProfile.version)).toBe(1)
  await page.getByRole('button', { name: 'Остановить' }).click()
  await page.reload()
  await page.locator('.advanced-settings > summary').click()
  await expect(wizard.getByText('ПРОФИЛЬ СОХРАНЁН')).toBeVisible()
  await wizard.getByRole('button', { name: 'Сбросить профиль языка' }).click()
  await expect(wizard.getByText('ЭКСПЕРИМЕНТ', { exact: true })).toBeVisible()
})
