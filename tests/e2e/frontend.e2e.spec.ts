import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:3000'

// Rooktest op de publieke kant: laden de schermen die een supporter écht gebruikt, en staat er
// geen client-side fout in de console? Bewust breed en ondiep — de regels en berekeningen zitten
// in de unit-/integratietests, hier gaat het om "doet de site het in een echte browser".
test.describe('Publieke site', () => {
  test('startpagina toont het live-bord', async ({ page }) => {
    await page.goto(BASE)
    await expect(page).toHaveTitle(/Krachtbal/)
    await expect(page.locator('header').first()).toBeVisible()
  })

  test('live-bord, rangschikking en weekoverzicht openen', async ({ page }) => {
    for (const pad of ['/live', '/rangschikking', '/recap']) {
      const res = await page.goto(BASE + pad)
      expect(res?.status(), `${pad} moet laden`).toBeLessThan(400)
      await expect(page.locator('header').first()).toBeVisible()
    }
  })

  test('het reglement is leesbaar zonder account', async ({ page }) => {
    await page.goto(`${BASE}/reglement`)
    await expect(page.locator('h1').first()).toBeVisible()
  })

  test('inloggen en registreren zijn bereikbaar', async ({ page }) => {
    await page.goto(`${BASE}/inloggen`)
    await expect(page.locator('input[type=email]')).toBeVisible()
    await expect(page.locator('input[type=password]')).toBeVisible()
    await page.goto(`${BASE}/registreren`)
    await expect(page.locator('input[type=email]')).toBeVisible()
  })

  test('geen client-side fouten op de kernschermen', async ({ page }) => {
    const fouten: string[] = []
    page.on('pageerror', (e) => fouten.push(String(e)))
    page.on('console', (m) => {
      if (m.type() !== 'error') return
      // Netwerkruis van externe bronnen (weer, kaarten) telt niet mee.
      if (/favicon|net::ERR_|Failed to load resource/i.test(m.text())) return
      fouten.push(m.text())
    })
    for (const pad of ['/', '/live', '/recap', '/pronostiek', '/uitleg']) {
      await page.goto(BASE + pad)
      await page.waitForTimeout(600)
    }
    expect(fouten, fouten.join('\n')).toHaveLength(0)
  })
})
