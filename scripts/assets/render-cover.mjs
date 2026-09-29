import { chromium } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto('file://' + path.join(__dirname, 'cover.html'))
await page.screenshot({ path: path.join(__dirname, 'dag-van-de-sportclub-cover.png') })
await browser.close()
console.log('done')
