import { test, expect, devices } from '@playwright/test'

test.use({ ...devices['iPhone 13'], defaultBrowserType: 'webkit' })

test('iPhone UI uses SVG paths instead of emoji-capable decoration', async ({ page }) => {
  await page.goto('/')
  const cta = page.getByRole('button', { name: 'Начать', exact: true })
  await expect(cta).toBeVisible()
  await expect(cta.locator('svg[data-icon="arrow-up-right"]')).toHaveAttribute('aria-hidden', 'true')
  await expect(page.locator('.hero-card-star')).toHaveJSProperty('tagName', 'svg')
  await expect(page.locator('.hero-card-star path')).toHaveCount(1)
  await expect(page.getByRole('navigation').getByRole('link', { name: 'uprosti.tech', exact: true }).locator('svg')).toHaveCount(1)
  expect(await page.locator('main').innerText()).not.toMatch(/[↗↘↙↖↓↑→✳＋■]/u)
  const metrics = await page.locator('.ui-icon').evaluateAll(icons => icons.filter(icon => icon.getClientRects().length).map(icon => {
    const box = icon.getBoundingClientRect()
    return { width: box.width, height: box.height }
  }))
  expect(metrics.length).toBeGreaterThan(5)
  expect(metrics.every(box => box.width >= 10 && box.height >= 10 && Math.abs(box.width - box.height) < 1)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.locator('.advanced-settings > summary').click()
  await expect(page.locator('.advanced-settings')).toHaveAttribute('open', '')
  await expect(page.locator('.advanced-settings > summary svg')).toHaveAttribute('data-icon', 'plus')
  await page.screenshot({ path: 'test-results/iphone-icons.png', fullPage: true })
})

test('lime styling ignores legacy palette settings and preserves calibration', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('meme-cv-theme-v1', 'rose')
    localStorage.setItem('meme-cv-calibration-v1', JSON.stringify({ poses: {}, neutral: { eyesOpen: .7 } }))
  })
  await page.goto('/')
  await expect(page.locator('.hero-cat-card')).toHaveCSS('background-color', 'rgb(195, 243, 74)')
  await expect(page.locator('.brand-mark')).toHaveCSS('color', 'rgb(195, 243, 74)')
  await expect(page.getByRole('link', { name: 'Оформление', exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.hero-cat-card')).toHaveCSS('background-color', 'rgb(195, 243, 74)')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('meme-cv-calibration-v1')!).neutral.eyesOpen)).toBe(.7)
})

test('retired theme preview URLs lead to the homepage', async ({ page }) => {
  for (const path of ['/themes', '/themes/', '/themese']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('meme.cv')
    await expect(page.getByRole('radio')).toHaveCount(0)
    await expect(page.locator('.hero-cat-card')).toHaveCSS('background-color', 'rgb(195, 243, 74)')
  }
})
