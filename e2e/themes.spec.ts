import { test, expect, devices } from '@playwright/test'

test.use({ defaultBrowserType: 'webkit' })

const storageKey = 'meme-cv-theme-v1'

test('theme page changes the homepage palette, persists selection, and resets without touching calibration', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, '__cameraRequests', { value: 0, writable: true })
    navigator.mediaDevices.getUserMedia = async () => {
      (window as unknown as { __cameraRequests: number }).__cameraRequests++
      throw new DOMException('Denied', 'NotAllowedError')
    }
  })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'graphite')
  await expect(page.locator('.hero-cat-card')).toHaveCSS('background-color', 'rgb(216, 216, 210)')
  await page.evaluate(() => localStorage.setItem('meme-cv-calibration-v1', JSON.stringify({ poses: {}, neutral: { eyesOpen: .7 } })))
  await page.getByRole('link', { name: 'Оформление', exact: true }).click()
  await expect(page).toHaveURL(/\/themes$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Оформление')
  await expect(page.getByRole('radio')).toHaveCount(12)
  await page.getByRole('radio', { name: 'Шалфей', exact: false }).check()
  await expect(page.locator('.hero-cat-card')).toHaveCSS('background-color', 'rgb(186, 201, 174)')
  expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBe('sage')
  await page.reload()
  await expect(page.getByRole('radio', { name: 'Шалфей', exact: false })).toBeChecked()
  await page.getByRole('link', { name: 'Камера', exact: true }).click()
  await expect(page.locator('.hero-cat-card')).toHaveCSS('background-color', 'rgb(186, 201, 174)')
  await page.goto('/themes')
  await page.getByRole('button', { name: 'Сбросить цвет' }).click()
  await expect(page.getByRole('radio', { name: 'Без цвета', exact: false })).toBeChecked()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('meme-cv-calibration-v1')!).neutral.eyesOpen)).toBe(.7)
  expect(await page.evaluate(() => (window as unknown as { __cameraRequests: number }).__cameraRequests)).toBe(0)
})

test('invalid stored palette falls back to neutral and main copy stays plain', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('meme-cv-theme-v1', 'unknown'))
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'graphite')
  expect(await page.locator('main').innerText()).not.toMatch(/—|BETA|LIVE INPUT|Никакой|Несерьёзный|внутреннего кота/)
  await expect(page.locator('.hero-description')).toHaveText('Покажи жест или выражение лица. Рядом появится кот.')
})

test.describe('iPhone palette', () => {
  test('preview supports keyboard navigation and narrow screens', async ({ browser }) => {
  const context = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 })
  const page = await context.newPage()
  await page.goto('/themes/')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const initial = page.getByRole('radio', { name: 'Без цвета', exact: false })
  await initial.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: 'Шалфей', exact: false })).toBeChecked()
  await page.screenshot({ path: 'test-results/iphone-themes.png', fullPage: true, scale: 'css' })
  await context.close()
})

})

test('theme selection still applies when local storage is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError') }
    Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError') }
  })
  await page.goto('/themes')
  await expect(page.getByRole('radio', { name: 'Без цвета', exact: false })).toBeChecked()
  await page.getByRole('radio', { name: 'Голубой', exact: false }).check()
  await expect(page.locator('.hero-cat-card')).toHaveCSS('background-color', 'rgb(181, 201, 218)')
  await expect(page.getByRole('status')).toContainText('Браузер не разрешил сохранить выбор')
})


test('bright palettes apply to the preview and persist on the homepage', async ({ page }) => {
  await page.goto('/themes')
  const palettes = [
    ['Лайм', 'lime', 'rgb(195, 243, 74)'],
    ['Жёлтый', 'yellow', 'rgb(244, 218, 73)'],
    ['Бирюзовый', 'turquoise', 'rgb(67, 217, 207)'],
    ['Розовый', 'pink', 'rgb(241, 138, 194)'],
    ['Синий', 'electric-blue', 'rgb(141, 169, 255)'],
    ['Мятный', 'mint', 'rgb(103, 227, 172)'],
  ]
  for (const [name, id, color] of palettes) {
    await page.getByRole('radio', { name: new RegExp(`^${name} `) }).check()
    await expect(page.locator('html')).toHaveAttribute('data-theme', id)
    await expect(page.locator('.hero-cat-card')).toHaveCSS('background-color', color)
  }
  await page.getByRole('link', { name: 'Камера', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'mint')
  await expect(page.locator('.hero-cat-card')).toHaveCSS('background-color', 'rgb(103, 227, 172)')
})
