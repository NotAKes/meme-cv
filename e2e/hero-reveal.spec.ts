import { test, expect } from '@playwright/test'

const viewports = [
  { width: 1440, height: 900 }, { width: 1440, height: 720 },
  { width: 1024, height: 768 }, { width: 390, height: 844 },
  { width: 390, height: 667 }, { width: 768, height: 1024 },
  { width: 844, height: 390 },
]
for (const viewport of viewports) {
  test(`entry fills screen ${viewport.width}x${viewport.height}, including mounted resize`, async ({ page }) => {
    await page.goto('/')
    await page.setViewportSize(viewport)
    const boxes = await page.locator('.release-hero, .hero-copy, .hero-cat-card, .workspace').evaluateAll(els => els.map(el => {
      const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, height: b.height, width: b.width }
    }))
    expect(boxes[0].height).toBeGreaterThanOrEqual(viewport.height)
    if (viewport.height >= 667) expect(boxes[0].height).toBeCloseTo(viewport.height, 0)
    expect(boxes[3].top).toBe(boxes[0].bottom)
    expect(boxes[3].top).toBeGreaterThanOrEqual(viewport.height)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    for (const selector of ['.hero-copy', '.hero-cat-card']) {
      expect(await page.locator(selector).evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true)
    }
    const targets = await page.locator('.site-nav a, .hero-cta').evaluateAll(els => els.map(el => el.getBoundingClientRect().height))
    expect(targets.every(height => height >= 44)).toBe(true)
  })
}

test('reveal is once-only, excludes media, and reveals keyboard/hash targets immediately', async ({ page }) => {
  await page.goto('/')
  const group = page.locator('.control-group > [data-reveal]').first()
  await expect(group).toHaveClass(/reveal-pending/)
  expect(await page.locator('.reveal-pending').evaluateAll(els => els.some(el => el.querySelector('video,canvas')))).toBe(false)
  await group.scrollIntoViewIfNeeded()
  await expect(group).not.toHaveClass(/reveal-pending/)
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }))
  await expect(group).not.toHaveClass(/reveal-pending/)
  await page.reload()
  await page.getByRole('checkbox', { name: 'Показать CV-разметку' }).focus()
  await expect(group).toHaveCSS('opacity', '1')
  await expect(group).toHaveCSS('transition-duration', '0s')
  await page.goto('/#playground')
  await expect(page.locator('.workspace .reveal-pending')).toHaveCount(0)
})

for (const fallback of ['reduce', 'noIO'] as const) {
  test(`${fallback}: all content remains visible`, async ({ page }) => {
    if (fallback === 'reduce') await page.emulateMedia({ reducedMotion: 'reduce' })
    else await page.addInitScript(() => { delete (window as unknown as { IntersectionObserver?: unknown }).IntersectionObserver })
    await page.goto('/')
    await expect(page.locator('.reveal-pending')).toHaveCount(0)
    await expect(page.locator('.control-group > [data-reveal]').first()).toHaveCSS('opacity', '1')
  })
}

test('200% text grows the hero without clipping or exposing workspace', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 667 })
  await page.goto('/')
  await page.addStyleTag({ content: 'html { font-size: 30px } .release-hero a { font-size: 1rem }' })
  expect(await page.locator('.hero-copy').evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true)
  const hero = await page.locator('.release-hero').boundingBox()
  const workspace = await page.locator('.workspace').boundingBox()
  expect(workspace!.y).toBe(hero!.height)
  expect(workspace!.y).toBeGreaterThanOrEqual(667)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
