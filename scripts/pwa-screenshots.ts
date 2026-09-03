import fs from 'fs/promises'
import path from 'path'

import { chromium } from '@playwright/test'

// De schermafbeeldingen voor het PWA-installatievenster fotograferen.
//
// Waarom die er zijn: zonder schermafbeeldingen toont Chrome bij het installeren een kaal balkje;
// mét toont hij een echt installatievenster waarin je de app eerst ziet. Dat scheelt of iemand op
// "Installeren" tikt of wegklikt.
//
// Waarom een script en geen handmatige beelden: knoppen verhuizen. Een etalage die iemand ooit met
// de hand maakte, veroudert stilletjes en niemand merkt het — tot ze een scherm toont dat er niet
// meer zo uitziet. Dit loopt de echte app af.
//
// Vooraf: `pnpm dev` draaien en één keer `pnpm pwa:demo` (zet een nette tornooidag klaar; een
// ontwikkeldatabase zit vol wegwerpwedstrijden uit testruns, en "Thuis 1788385900…" in een
// installatievenster is slechter dan géén schermafbeeldingen).
// Daarna: `pnpm pwa:shots`

const BASIS = process.env.PWA_BASIS ?? 'http://localhost:3000'
const GROEP = process.env.PWA_GROEP ?? 'Krachtbaltornooi Sint-Michiels'
// De meegeleverde Chromium van deze omgeving; Playwright zoekt anders een versie die hier niet staat.
const BROWSER = process.env.PWA_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
/** In dev-modus compileert Next elke pagina bij het eerste bezoek — dat duurt makkelijk minuten. */
const GEDULD = Number(process.env.PWA_GEDULD ?? 300_000)
const UIT = path.join(process.cwd(), 'public', 'screenshots')

/** Telefoonformaat: de `narrow`-vorm die Android voor het installatievenster verwacht. */
const SCHERM = { width: 412, height: 892 }

const PAGINAS = [
  { pad: `/tornooi/groep/${encodeURIComponent(GROEP)}/programma`, naam: 'dagprogramma' },
  { pad: `/tornooi/groep/${encodeURIComponent(GROEP)}`, naam: 'tornooidag' },
]

async function main() {
  await fs.mkdir(UIT, { recursive: true })
  const kop = await fs.stat(BROWSER).then(() => BROWSER, () => undefined)
  const browser = await chromium.launch(kop ? { executablePath: kop } : {})
  // Pixeldichtheid 1: het venster schaalt de beelden toch terug, en dit houdt de bestanden klein
  // genoeg om in de repo te leven.
  const ctx = await browser.newContext({ viewport: SCHERM, deviceScaleFactor: 1 })
  // De ontwikkelbalk van Next zit in een eigen shadow-root en hoort niet in een etalage.
  await ctx.addInitScript(() => {
    const s = document.createElement('style')
    s.textContent = 'nextjs-portal, #__next-build-watcher { display: none !important }'
    document.documentElement.appendChild(s)
  })
  const page = await ctx.newPage()

  try {
    for (const p of PAGINAS) {
      // Bewust niet op `networkidle` wachten: deze schermen houden een live SSE-verbinding open,
      // dus het netwerk wordt nooit stil en dat wachten loopt gegarandeerd af in een time-out.
      await page.goto(`${BASIS}${p.pad}`, { waitUntil: 'domcontentloaded', timeout: GEDULD })
      await page.waitForTimeout(6000)
      await page.screenshot({ path: path.join(UIT, `${p.naam}.png`) })
      console.log(`  ${p.naam}.png`)
    }
    console.log(`\n${PAGINAS.length} beelden in public/screenshots`)
  } finally {
    await browser.close()
  }
}

void main()
