import { createRequire } from 'module'
const { chromium } = createRequire('/home/user/Livescore-Krachtbal/package.json')('playwright')
const out = process.argv[2]
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await b.newPage({ viewport: { width: 1200, height: 1200 } })
p.on('console', (m) => console.log('console', m.text()))
p.on('pageerror', (e) => console.log('err', e.message))
await p.goto('http://localhost:8765/index.html')
await p.waitForFunction(() => window.KLAAR, null, { timeout: 20000 })
await p.locator('#c').screenshot({ path: out + '/gouden-krachtbal.png', omitBackground: true })
await b.close()
