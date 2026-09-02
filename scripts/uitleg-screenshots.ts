import fs from 'fs/promises'
import path from 'path'

import { chromium, type BrowserContext, type Page } from '@playwright/test'

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
/** Hoelang op een knop wachten. In dev-modus compileert Next elke pagina bij het eerste bezoek,
 *  en dat duurt makkelijk een halve minuut — te kort wachten en het script denkt dat de knop
 *  verdwenen is. */
const GEDULD = Number(process.env.UITLEG_GEDULD ?? 90_000)
const UIT = path.join(process.cwd(), 'public', 'uitleg')
const MANIFEST = path.join(process.cwd(), 'src', 'lib', 'uitleg-beelden.json')

/** Een telefoonscherm: de aantekenaar staat aan een tafel met een gsm, niet met een laptop. */
const SCHERM = { width: 430, height: 900 }
/** Vier keer zoveel pixels als het scherm meet. Op papier wordt zo'n foto ongeveer 290 dpi —
 *  scherp genoeg om te drukken. Op de helft daarvan (de vorige versie) zag de handleiding er
 *  blokkerig uit zodra ze uit de printer kwam. */
const PIXELDICHTHEID = 4

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
const RAND_BOVEN = 120
const RAND_ONDER = 80

const beelden: Beeld[] = []

async function leg(page: Page, nr: number, doelKiezer: string | null, kaderKiezer?: string) {
  const bestand = `stap-${String(nr).padStart(2, '0')}.png`
  let doel: Beeld['doel'] = null
  let uitsnede: { x: number; y: number; width: number; height: number } | null = null

  if (doelKiezer) {
    const el = page.locator(doelKiezer).first()
    await el.waitFor({ state: 'visible', timeout: GEDULD })
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
  }

  // De uitsnede. Met een kader-element volgt ze de randen daarvan — dan snijdt het beeld niet
  // dwars door een invoerveld of een wedstrijdrij, en dat is precies wat een handleiding
  // slordig maakt. Zonder kader: een band rond de knop, over de volle schermbreedte.
  if (kaderKiezer) {
    const kader = await page.locator(kaderKiezer).first().boundingBox()
    if (!kader) throw new Error(`stap ${nr}: kader "${kaderKiezer}" niet gevonden`)
    const boven = Math.max(0, Math.round(kader.y) - 10)
    uitsnede = {
      x: 0,
      y: boven,
      width: SCHERM.width,
      height: Math.min(SCHERM.height - boven, Math.round(kader.height) + 20),
    }
  } else if (doel) {
    const boven = Math.max(0, doel.y - RAND_BOVEN)
    uitsnede = {
      x: 0,
      y: boven,
      width: SCHERM.width,
      height: Math.min(SCHERM.height - boven, doel.h + RAND_BOVEN + RAND_ONDER),
    }
  }
  // Het doel ligt in de uitsnede hoger dan op het volledige scherm.
  if (doel && uitsnede) doel = { ...doel, y: doel.y - uitsnede.y }

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

/**
 * Naar een pagina gaan en pas doorgaan als de gevraagde knop er écht staat.
 *
 * In dev-modus compileert Next elke pagina bij het eerste bezoek. Onder die belasting kan het
 * ophalen van de ingelogde gebruiker op de server even mislukken, en dan rendert de pagina
 * zichzelf als uitgelogd — zónder de knoppen die de handleiding moet tonen. Eén keer opnieuw
 * laden is dan genoeg. Blijft het na drie pogingen weg, dan is er echt iets aan de hand en
 * stopt het script liever dan een verkeerd beeld te bewaren.
 */
async function ganaar(page: Page, url: string, kiezer: string) {
  for (let poging = 1; poging <= 3; poging++) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: GEDULD })
    const gevonden = await page
      .locator(kiezer)
      .first()
      .waitFor({ state: 'visible', timeout: poging === 3 ? GEDULD : 30_000 })
      .then(() => true, () => false)
    if (gevonden) return
    console.log(`  (${kiezer} nog niet te zien — poging ${poging} van 3)`)
  }
  throw new Error(`"${kiezer}" bleef weg op ${url}`)
}

/**
 * Inloggen via de API en de sessiecookie in de browser zetten.
 *
 * De cookie komt uit het antwoord van Payload zelf, dus met exact de eigenschappen die de app
 * ook in het echt geeft.
 */
async function zetSessie(ctx: BrowserContext) {
  const res = await fetch(`${BASIS}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: WACHTWOORD }),
  })
  if (!res.ok) throw new Error(`inloggen mislukte (${res.status}) — draait \`pnpm uitleg:demo\` al?`)
  const rauw = res.headers.get('set-cookie') ?? ''
  const token = /payload-token=([^;]+)/.exec(rauw)?.[1]
  if (!token) throw new Error('geen sessiecookie in het antwoord van de login')
  const { hostname } = new URL(BASIS)
  await ctx.addCookies([{ name: 'payload-token', value: token, domain: hostname, path: '/' }])
}

async function main() {
  await fs.mkdir(UIT, { recursive: true })
  const kop = await fs.stat(BROWSER).then(() => BROWSER, () => undefined)
  const browser = await chromium.launch(kop ? { executablePath: kop } : {})
  const context = await browser.newContext({ viewport: SCHERM, deviceScaleFactor: PIXELDICHTHEID })
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
    // De sessie komt van de API en wordt rechtstreeks in de browser gezet, in plaats van het
    // inlogformulier te laten indienen. Dat is niet uit gemak: onder een dev-server die elke
    // pagina eerst nog compileert, is het doorklikken na een formulier-login onbetrouwbaar, en
    // dan fotografeert het script een uitgelogd dagprogramma zonder de knoppen die de
    // handleiding juist moet tonen. Deze weg is deterministisch.
    await zetSessie(context)

    // 1 · Inloggen — het formulier ingevuld, maar niet ingediend: dit beeld is enkel om te
    // tonen wáár de knop staat.
    await page.goto(`${BASIS}/inloggen`, { waitUntil: 'domcontentloaded', timeout: GEDULD })
    await page.locator('input[type="email"]').fill(EMAIL)
    await page.locator('input[type="password"]').fill(WACHTWOORD)
    await leg(page, 1, 'button[type="submit"]', '.login-card')

    // 2 · Het dagprogramma, en 3 · de Aantekenen-knop van jouw wedstrijd
    const programma = `${BASIS}/tornooi/groep/${encodeURIComponent(GROEP)}/programma`
    await ganaar(page, programma, '.dp-aantekenen')
    await page.waitForTimeout(1500)
    // Stap 2 wijst niets aan maar toont wél de lijst waar je jouw wedstrijd in zoekt; het doel
    // is hier de eerste rij, zodat de uitsnede rond de lijst valt en niet rond het hele scherm.
    await leg(page, 2, null, '.dp-lijst')
    await leg(page, 3, '.dp-aantekenen')

    // Doorklikken naar het aantekenscherm van die wedstrijd.
    await page.locator('.dp-aantekenen').first().click()
    await page.locator('.trn-btn.primary').first().waitFor({ state: 'visible', timeout: GEDULD })
    await page.waitForTimeout(1500)

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

    // 7 · Einde eerste helft (de knop heet naar wát hij doet, niet naar wat erna komt)
    const eindeHelft = page.getByRole('button', { name: /einde 1e helft/i }).first()
    await leg(page, 7, 'button:has-text("Einde 1e helft")')
    await eindeHelft.click()
    await page.waitForTimeout(900)
    await page.getByRole('button', { name: /ja, einde eerste helft/i }).first().click()
    await page.waitForTimeout(2500)

    // 8 · Start de tweede helft — de rust: klok op nul en stil.
    await leg(page, 8, 'button:has-text("Start 2e helft")')
    await page.getByRole('button', { name: /start 2e helft/i }).first().click()
    await page.waitForTimeout(2500)

    // 9 · Einde wedstrijd
    await leg(page, 9, '.trn-btn.danger')
    await page.locator('.trn-btn.danger').first().click()
    await page.waitForTimeout(900)
    await page.getByRole('button', { name: /gedaan/i }).first().click()
    await page.waitForTimeout(3000)

    // 10 · Klaar
    await leg(page, 10, null)

    await fs.writeFile(MANIFEST, `${JSON.stringify({ scherm: SCHERM, beelden }, null, 2)}\n`)
    console.log(`\n${beelden.length} beelden in public/uitleg + ${path.relative(process.cwd(), MANIFEST)}`)
  } finally {
    await browser.close()
  }
}

void main()
