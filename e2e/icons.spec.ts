import { test, expect, devices } from '@playwright/test'

test.use({ ...devices['iPhone 13'], defaultBrowserType: 'webkit' })

test('iPhone UI uses SVG paths instead of emoji-capable decoration', async ({ page }) => {
  await page.goto('/')
  const cta = page.getByRole('button', { name: 'Начать', exact: true })
  await expect(cta).toBeVisible()
  await expect(cta.locator('svg[data-icon="arrow-up-right"]')).toHaveAttribute('aria-hidden', 'true')
  await expect(page.locator('[data-cat-geometry] path')).toHaveCount(8)
  const catBody = page.locator('[data-cat-geometry] path').first()
  await expect(catBody).not.toHaveAttribute('opacity')
  await expect(catBody).toHaveAttribute('fill', 'var(--paper)')
  await expect(catBody).toHaveCSS('fill', 'rgb(243, 242, 238)')
  await expect(catBody).toHaveCSS('opacity', '1')
  const catDetails = page.locator('[data-cat-geometry] path').nth(1)
  await expect(catDetails).toHaveAttribute('fill', 'currentColor')
  await expect(catDetails).toHaveCSS('fill', 'rgb(24, 24, 22)')
  await expect(page.locator('.hero-card-star, .cat-orbit, .hero-cat-heading')).toHaveCount(0)
  await expect(page.locator('.hero-cat-body')).toHaveCSS('animation-name', 'hero-cat-breathe')
  await expect(page.locator('.hero-cat-eyes')).toHaveCSS('animation-name', 'hero-cat-blink')
  await expect(page.locator('.hero-cat-eyes path')).toHaveCount(2)
  await expect(page.locator('[data-cat-targets] path')).toHaveCount(2)
  await expect(page.locator('[data-cat-targets]')).toHaveAttribute('opacity', '.42')
  await expect(page.locator('.hero-cat-footer')).toHaveText('meme.cv')
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

test('mint styling ignores legacy palette settings and preserves calibration', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('meme-cv-theme-v1', 'rose')
    localStorage.setItem('meme-cv-calibration-v1', JSON.stringify({ poses: {}, neutral: { eyesOpen: .7 } }))
  })
  await page.goto('/')
  await expect(page.locator('.hero-cat-card')).toHaveCSS('background-color', 'rgb(120, 221, 179)')
  await expect(page.locator('.brand-mark')).toHaveCSS('color', 'rgb(120, 221, 179)')
  await expect(page.getByRole('link', { name: 'Оформление', exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.hero-cat-card')).toHaveCSS('background-color', 'rgb(120, 221, 179)')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('meme-cv-calibration-v1')!).neutral.eyesOpen)).toBe(.7)
})

test('retired theme preview URLs lead to the homepage', async ({ page }) => {
  for (const path of ['/themes', '/themes/', '/themese']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('meme.cv')
    await expect(page.getByRole('radio')).toHaveCount(0)
    await expect(page.locator('.hero-cat-card')).toHaveCSS('background-color', 'rgb(120, 221, 179)')
  }
})

test('reduced motion freezes the cat and both eyes without hiding CV targets', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  for (const selector of ['.hero-cat-body', '.hero-cat-eyes']) {
    await expect(page.locator(selector)).toHaveCSS('animation-name', 'none')
    await expect(page.locator(selector)).toHaveCSS('transform', 'none')
  }
  expect(await page.locator('.hero-cat-scene').evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0)
  await expect(page.locator('[data-cat-geometry] path')).toHaveCount(8)
  await expect(page.locator('[data-cat-targets]')).toBeVisible()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(page.locator('.hero-cat-body')).toHaveCSS('animation-name', 'hero-cat-breathe')
  await expect(page.locator('.hero-cat-eyes')).toHaveCSS('animation-name', 'hero-cat-blink')
})


test('cat and CV frame stay inside their viewport throughout breathing on desktop and mobile', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    await page.goto('/')
    for (const time of [0, 2800, 5600]) {
      const fits = await page.locator('.hero-cat-scene').evaluate((scene, time) => {
        scene.getAnimations({ subtree: true }).forEach(animation => {
          animation.pause()
          animation.currentTime = time
        })
        const outer = scene.getBoundingClientRect()
        return [...scene.querySelectorAll('path')].every(path => {
          const box = path.getBoundingClientRect()
          return box.left > outer.left && box.right < outer.right && box.top > outer.top && box.bottom < outer.bottom
        })
      }, time)
      expect(fits).toBe(true)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    // Blink affects exactly the two eye paths, never the nose or head.
    const blink = await page.locator('.hero-cat-eyes').evaluate(eyes => {
      const animation = eyes.getAnimations()[0]
      animation.currentTime = 8400 * .45
      return { transform: getComputedStyle(eyes).transform, paths: eyes.querySelectorAll('path').length }
    })
    expect(blink).toEqual({ transform: 'matrix(1, 0, 0, 0.08, 0, 0)', paths: 2 })
  }
})
