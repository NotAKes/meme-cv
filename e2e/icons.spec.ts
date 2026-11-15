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
