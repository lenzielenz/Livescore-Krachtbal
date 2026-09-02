import fs from 'fs/promises'
import path from 'path'

import { chromium, type Page } from '@playwright/test'

// De handleiding fotograferen: echte schermen uit de draaiende app, met per stap de plek van de
// knop waar de pijl naartoe moet wijzen.
//
// Waarom een script en geen handmatige schermafbeeldingen: knoppen verhuizen. Een map met
// screenshots die iemand ooit met de hand nam, verouderd stilletjes en niemand merkt het tot de
// handleiding iets aanwijst wat er niet meer staat. Dit loopt de flow écht af — mislukt een stap
// (knop weg, andere tekst), dan stopt het script in plaats van een verkeerd beeld te bewaren.
//
// De pijl wordt níét in het beeld getekend: de plek van de knop komt als rechthoek in
// `beelden.json`, en de PDF tekent de pijl er scherp overheen. Zo blijft het beeld puur een foto
// en kan de opmaak veranderen zonder alles opnieuw te fotograferen.
//
// Vooraf: `pnpm dev` draaien en één keer `pnpm exec tsx scripts/uitleg-demo.ts`.
// Daarna:  pnpm exec tsx scripts/uitleg-screenshots.ts

const BASIS = process.env.UITLEG_BASIS ?? 'http://localhost:3000'
const EMAIL = process.env.UITLEG_EMAIL ?? 'handleiding@voorbeeld.be'
const WACHTWOORD = process.env.UITLEG_WACHTWOORD ?? 'handleiding-demo-1234'
const GROEP = process.env.UITLEG_GROEP ?? 'Demotornooi handleiding'
// De meegeleverde Chromium van deze omgeving. Playwright zoekt standaard een versie die hier
// niet staat; met dit pad hoeft er niets gedownload te worden.
const BROWSER = process.env.UITLEG_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const UIT = path.join(process.cwd(), 'public', 'uitleg')
const MANIFEST = path.join(process.cwd(), 'src', 'lib', 'uitleg-beelden.json')

/** Een telefoonscherm: de aantekenaar staat aan een tafel met een gsm, niet met een laptop. */
const SCHERM = { width: 430, height: 900 }

type Vak = { x: number; y: number; b: number; h: number }

type Beeld = {
  /** Het stapnummer uit AANTEKEN_STAPPEN. */
  nr: number
  bestand: string
  breedte: number
  hoogte: number
  /** Waar de pijl naartoe wijst, in beeldpixels. Null = geen pijl (overzichtsbeeld). */
  doel: Vak | null
}

/** Hoeveel scherm er rond de knop mee op de uitsnede komt. Genoeg om te herkennen wáár je zit,
 *  weinig genoeg om de knop groot te houden — een handleiding met negen volledige
 *  telefoonschermen leest niemand. */
const RAND_BOVEN = 150
const RAND_ONDER = 110

const beelden: Beeld[] = []

async function leg(page: Page, nr: number, doelKiezer: string | null) {
  const bestand = `stap-${String(nr).padStart(2, '0')}.png`
  let doel: Beeld['doel'] = null
  let uitsnede: { x: number; y: number; width: number; height: number } | null = null
  if (doelKiezer) {
    const el = page.locator(doelKiezer).first()
    await el.waitFor({ state: 'visible', timeout: 15_000 })
    await el.scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
    // Past het scherm in één beeld, dan liever van bovenaf: een half afgesneden titel ziet er
    // slordig uit in een handleiding.
    const past = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 8)
    if (past) {
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.waitForTimeout(200)
    }
    const vak = await el.boundingBox()
    if (!vak) throw new Error(`stap ${nr}: "${doelKiezer}" heeft geen plek op het scherm`)
    doel = { x: Math.round(vak.x), y: Math.round(vak.y), b: Math.round(vak.width), h: Math.round(vak.height) }
    // De uitsnede: een band rond de knop, over de volle breedte van het scherm.
    const boven = Math.max(0, doel.y - RAND_BOVEN)
    const hoogte = Math.min(SCHERM.height - boven, doel.h + RAND_BOVEN + RAND_ONDER)
    uitsnede = { x: 0, y: boven, width: SCHERM.width, height: hoogte }
    // Het doel ligt in de uitsnede hoger dan op het volledige scherm.
    doel = { ...doel, y: doel.y - boven }
  }
  // De ontwikkelbalk van Next zit in een eigen shadow-root en trekt zich niets van CSS aan;
  // vlak vóór de foto weghalen is het enige wat werkt.
  await page.evaluate(() => {
    document.querySelectorAll('nextjs-portal, #__next-build-watcher').forEach((el) => el.remove())
  }).catch(() => {})
  await page.screenshot({ path: path.join(UIT, bestand), ...(uitsnede ? { clip: uitsnede } : {}) })
  beelden.push({
    nr,
    bestand,
    breedte: uitsnede ? uitsnede.width : SCHERM.width,
    hoogte: uitsnede ? Math.round(uitsnede.height) : SCHERM.height,
    doel,
  })
  console.log(`  stap ${nr} → ${bestand}${doel ? '' : ' (zonder pijl)'}`)
}

async function main() {
  await fs.mkdir(UIT, { recursive: true })
  const kop = await fs.stat(BROWSER).then(() => BROWSER, () => undefined)
  const browser = await chromium.launch(kop ? { executablePath: kop } : {})
  const context = await browser.newContext({ viewport: SCHERM, deviceScaleFactor: 2 })
  const page = await context.newPage()
  // De ontwikkelbalk van Next ("Compiling …") hoort niet in een handleiding.
  await page.addStyleTag({ content: 'nextjs-portal, #__next-build-watcher { display: none !important }' })
    .catch(() => {})
  await context.addInitScript(() => {
    const stijl = document.createElement('style')
    stijl.textContent = 'nextjs-portal, #__next-build-watcher { display: none !important }'
    document.documentElement.appendChild(stijl)
  })

  try {
    // 1 · Inloggen
    await page.goto(`${BASIS}/inloggen`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await page.locator('input[type="email"]').fill(EMAIL)
    await page.locator('input[type="password"]').fill(WACHTWOORD)
    await leg(page, 1, 'button[type="submit"]')
    await page.locator('button[type="submit"]').click()
    // In dev-modus compileert de volgende pagina nog; wachten tot we écht weg zijn van de
    // inlogpagina, anders fotografeer je straks het uitgelogde dagprogramma.
    await page.waitForURL((u) => !u.pathname.includes('inloggen'), { timeout: 120_000 }).catch(() => {})
    await page.waitForTimeout(3000)

    // 2 · Het dagprogramma, en 3 · de Aantekenen-knop van jouw wedstrijd
    const programma = `${BASIS}/tornooi/groep/${encodeURIComponent(GROEP)}/programma`
    await page.goto(programma, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await page.waitForTimeout(2500)
    await leg(page, 2, null)
    await leg(page, 3, '.dp-aantekenen')

    // Doorklikken naar het aantekenscherm van die wedstrijd.
    await page.locator('.dp-aantekenen').first().click()
    await page.waitForTimeout(5000)

    // 4 · Starten
    await leg(page, 4, '.trn-btn.primary')
    await page.locator('.trn-btn.primary').first().click()
    await page.waitForTimeout(900)
    await page.getByRole('button', { name: /ja, starten/i }).first().click()
    await page.waitForTimeout(3000)

    // 5 · Score
    await leg(page, 5, '.ts-goal.nek')
    await page.locator('.ts-goal.nek').first().click()
    await page.waitForTimeout(1800)

    // 6 · Kruisjes, time-outs en de klok
    await leg(page, 6, '.ts-stat')

    // 7 · Naar de tweede helft
    const helft = page.getByRole('button', { name: /2e helft/i }).first()
    await leg(page, 7, 'button:has-text("2e helft")')
    await helft.click()
    await page.waitForTimeout(2500)

    // 8 · Einde wedstrijd
    await leg(page, 8, '.trn-btn.danger')
    await page.locator('.trn-btn.danger').first().click()
    await page.waitForTimeout(900)
    await page.getByRole('button', { name: /gedaan/i }).first().click()
    await page.waitForTimeout(3000)

    // 9 · Klaar
    await leg(page, 9, null)

    await fs.writeFile(MANIFEST, `${JSON.stringify({ scherm: SCHERM, beelden }, null, 2)}\n`)
    console.log(`\n${beelden.length} beelden in public/uitleg + ${path.relative(process.cwd(), MANIFEST)}`)
  } finally {
    await browser.close()
  }
}

void main()
