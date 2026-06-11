// Genereert de PNG-app-iconen uit public/icon.svg (PWA + iOS-beginscherm). Eén keer draaien
// wanneer het logo wijzigt: `pnpm tsx scripts/gen-icons.ts`. SVG alleen volstaat niet — iOS
// gebruikt voor het beginscherm een PNG (apple-touch-icon), en Android wil een maskable PNG.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import sharp from 'sharp'

const pub = path.resolve(process.cwd(), 'public')
const svg = readFileSync(path.join(pub, 'icon.svg'))

// Maskable variant: vol vlak (geen ronde hoeken) zodat het Android-masker netjes uitsnijdt.
const maskable = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <rect width="512" height="512" fill="#06140d"/>
    <circle cx="256" cy="256" r="138" fill="none" stroke="#06d6a0" stroke-width="13"/>
    <text x="256" y="256" font-family="ui-sans-serif, system-ui, sans-serif" font-size="200" font-weight="900"
      fill="#ffd166" text-anchor="middle" dominant-baseline="central">K</text>
  </svg>`,
)

async function main() {
  const jobs: [Buffer, number, string][] = [
    [svg, 192, 'icon-192.png'],
    [svg, 512, 'icon-512.png'],
    [svg, 180, 'apple-icon-180.png'],
    [maskable, 512, 'icon-maskable-512.png'],
  ]
  for (const [src, size, name] of jobs) {
    const out = await sharp(src).resize(size, size).png().toBuffer()
    writeFileSync(path.join(pub, name), out)
    console.log('✓', name, `${size}×${size}`)
  }
}

void main()
