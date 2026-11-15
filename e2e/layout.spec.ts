import { test, expect } from '@playwright/test'

for (const width of [390, 768, 1024, 1280, 1440]) {
  test(`four edge-to-edge squares and rectangular controls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1100 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    const measure = () => page.evaluate(() => {
      const rect = (selector: string) => {
        const { left, right, top, bottom, width, height } = document.querySelector(selector)!.getBoundingClientRect()
        return { left, right, top, bottom, width, height }
      }
      return {
        squares: ['.hero-copy', '.hero-cat-card', '.camera-panel', '.result-panel'].map(rect),
        controls: [rect('.control-group'), rect('.control-group + .control-group')],
        overflow: document.documentElement.scrollWidth - innerWidth,
        rounded: [...document.querySelectorAll('.panel, .hero-copy, .hero-cat-card, button, .segmented, .tongue-calibration, .mini-meme')]
          .filter(el => el.getClientRects().length).filter(el => getComputedStyle(el).borderTopLeftRadius !== '0px').length,
      }
    })
    const layout = await measure()
    const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1)
    expect(layout.overflow).toBeLessThanOrEqual(0)
    expect(layout.rounded).toBe(0)
    const [copy, cat, camera, result] = layout.squares
    near(copy.left, 0); near(copy.top, 0)
    if (width > 800) {
      for (const box of layout.squares) { near(box.width, width / 2); near(box.height, width / 2) }
      near(copy.right, cat.left); near(cat.right, width); near(copy.top, cat.top)
      near(copy.bottom, camera.top); near(cat.bottom, result.top)
      near(camera.right, result.left); near(result.right, width)
    } else {
      for (const box of layout.squares) { near(box.left, 0); near(box.width, width) }
      for (let i = 1; i < 4; i++) near(layout.squares[i].top, layout.squares[i - 1].bottom)
      const targets = await page.locator('.site-nav a, .hero-cta, .camera-placeholder button, .small-check, .layer-options label, .segmented button, .switch').evaluateAll(els => els.map(el => el.getBoundingClientRect().height))
      expect(targets.every(height => height >= 44)).toBe(true)
    }
    for (const [i, box] of layout.controls.entries()) {
      near(box.left, layout.squares[width > 800 ? i : 0].left)
      near(box.width, copy.width)
    }
    await page.locator('.advanced-settings > summary').click()
    expect((await measure()).overflow).toBeLessThanOrEqual(0)
    expect((await measure()).rounded).toBe(0)
    await page.screenshot({ path: `test-results/grid-${width}.png`, fullPage: true })
  })
}

test('mobile enlarged text can grow without clipping camera controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.addStyleTag({ content: '.hero-copy-body, .camera-placeholder { font-size: 200% } .camera-placeholder h3, .camera-placeholder p { font-size: 1em }' })
  const stage = await page.locator('.camera-stage').boundingBox()
  const button = await page.getByRole('button', { name: 'Включить камеру' }).boundingBox()
  expect(button!.y + button!.height).toBeLessThanOrEqual(stage!.y + stage!.height)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

for (const { browser, dpr } of [
  { browser: 'chromium', dpr: 1 },
  { browser: 'chromium', dpr: 1.25 },
  { browser: 'webkit', dpr: 2 },
  { browser: 'webkit', dpr: 3 },
] as const) {
  test.describe(`borderless seams in ${browser} at DPR ${dpr}`, () => {
    for (const width of [1024, 1279, 1440, 1441]) {
      test(`four panels share exact edges at ${width}px`, async ({ playwright }) => {
        const engine = await playwright[browser].launch()
        const page = await engine.newPage({ deviceScaleFactor: dpr })
        try {
          await page.setViewportSize({ width, height: 1100 })
          await page.emulateMedia({ reducedMotion: 'reduce' })
          await page.goto('/')
          await expect(page.locator('.result-panel')).toHaveCSS('border-top-width', '0px')
          const boxes = await page.locator('.hero-copy, .hero-cat-card, .camera-panel, .result-panel').evaluateAll(els => els.map(el => {
            const { left, right, top, bottom, width, height } = el.getBoundingClientRect()
            const style = getComputedStyle(el)
            return { left, right, top, bottom, width, height, borders: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth] }
          }))
          const [copy, cat, camera, result] = boxes
          for (const box of boxes) {
            expect(box.width).toBe(width / 2)
            expect(box.height).toBe(copy.height)
            expect(box.height).toBe(box.width)
            expect(box.borders).toEqual(['0px', '0px', '0px', '0px'])
          }
          expect(copy.bottom).toBe(camera.top)
          expect(cat.bottom).toBe(result.top)
          expect(copy.bottom).toBe(cat.bottom)
          expect(camera.bottom).toBe(result.bottom)
          expect(copy.right).toBe(cat.left)
          expect(camera.right).toBe(result.left)
          expect(cat.left).toBe(result.left)
          expect(result.right).toBe(width)
          await page.screenshot({
            path: `test-results/seam-${browser}-${dpr}-${width}.png`,
            clip: { x: width / 2 - 24, y: Math.floor(result.top) - 12, width: width / 2, height: 24 },
            scale: 'device',
          })
        } finally {
          await engine.close()
        }
      })
    }
  })
}
