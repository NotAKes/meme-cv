import { test, expect } from '@playwright/test'

for (const width of [390, 768, 1024, 1280, 1440]) {
  test(`shared grid aligns cards, camera and controls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 800 ? 1024 : 1100 })
    await page.goto('/')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const layout = await page.evaluate(() => {
      const rect = (selector: string) => {
        const { left, right, top, bottom, width } = document.querySelector(selector)!.getBoundingClientRect()
        return { left, right, top, bottom, width }
      }
      const second = document.querySelectorAll('.control-group')[1]
      const divider = getComputedStyle(second, '::before')
      return {
        hero: [rect('.hero-copy'), rect('.hero-cat-card')],
        workspace: [rect('.camera-panel'), rect('.result-panel')],
        controls: [rect('.control-group'), rect('.control-group + .control-group')],
        heading: rect('.section-kicker h2'), hint: rect('.section-kicker p'),
        divider: second.getBoundingClientRect().left + parseFloat(divider.left),
        overflow: document.documentElement.scrollWidth - innerWidth,
      }
    })
    const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1)
    expect(layout.overflow).toBeLessThanOrEqual(0)
    near(layout.hint.left, layout.workspace[0].left)
    near(layout.heading.left, layout.hint.left)
    expect(layout.hint.top).toBeGreaterThan(layout.heading.bottom)
    expect(layout.hint.bottom).toBeLessThan(layout.workspace[0].top)
    for (const pair of [layout.hero, layout.controls]) {
      for (const i of [0, 1]) {
        near(pair[i].left, layout.workspace[i].left)
        near(pair[i].right, layout.workspace[i].right)
      }
      if (width <= 800) expect(pair[1].top).toBeGreaterThanOrEqual(pair[0].bottom)
    }
    if (width > 800) {
      near(layout.divider, (layout.workspace[0].right + layout.workspace[1].left) / 2)
      near(layout.hero[0].top, layout.hero[1].top)
      near(layout.workspace[0].top, layout.workspace[1].top)
    } else {
      expect(layout.workspace[1].top).toBeGreaterThan(layout.workspace[0].bottom)
    }
    await page.screenshot({ path: `test-results/grid-${width}.png`, fullPage: true })
  })
}
