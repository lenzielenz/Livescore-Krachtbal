import { describe, it, expect } from 'vitest'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import zlib from 'zlib'

import { leesTar, pakUit, veiligPad, veiligeLink } from '@/lib/cv-tar'

// De tar-lezer haalt een Python van het internet binnen die daarna uitgevoerd wordt. Twee dingen
// moeten dus kloppen: het formaat (anders start er niets) en de grenzen (een tarball mag nooit
// buiten zijn eigen map schrijven).

/** Minimale tar-schrijver, zodat de proefstukken hier gemaakt worden zonder `tar` te vereisen. */
function tarBlok(naam: string, opties: { type?: '0' | '5' | '2'; inhoud?: string; link?: string; modus?: number } = {}) {
  const kop = Buffer.alloc(512)
  kop.write(naam, 0, 100)
  kop.write((opties.modus ?? 0o644).toString(8).padStart(7, '0') + '\0', 100, 8)
  const data = Buffer.from(opties.inhoud ?? '')
  kop.write(data.length.toString(8).padStart(11, '0') + '\0', 124, 12)
  kop.write('        ', 148, 8) // checksumveld telt als spaties mee
  kop.write(opties.type ?? '0', 156, 1)
  if (opties.link) kop.write(opties.link, 157, 100)
  kop.write('ustar\0' + '00', 257, 8)
  let som = 0
  for (const b of kop) som += b
  kop.write(som.toString(8).padStart(6, '0') + '\0 ', 148, 8)
  const vulling = Buffer.alloc((512 - (data.length % 512)) % 512)
  return Buffer.concat([kop, data, vulling])
}

const tarGz = (...blokken: Buffer[]) => zlib.gzipSync(Buffer.concat([...blokken, Buffer.alloc(1024)]))

describe('leesTar', () => {
  it('leest bestanden, mappen en symlinks uit een tar', () => {
    const items = leesTar(
      zlib.gunzipSync(
        tarGz(
          tarBlok('python/', { type: '5' }),
          tarBlok('python/bin/python3.12', { inhoud: '#!/bin/echo', modus: 0o755 }),
          tarBlok('python/bin/python3', { type: '2', link: 'python3.12' }),
        ),
      ),
    )
    expect(items.map((i) => [i.naam, i.type])).toEqual([
      ['python/', 'map'],
      ['python/bin/python3.12', 'bestand'],
      ['python/bin/python3', 'link'],
    ])
    expect(items[1].modus & 0o777).toBe(0o755)
    expect(items[2].link).toBe('python3.12')
  })
})

describe('veiligPad', () => {
  it('weigert alles wat buiten de doelmap wil schrijven', () => {
    for (const gemeen of ['../weg.txt', 'a/../../weg.txt', '/etc/passwd', '..']) {
      expect(veiligPad('/doel', gemeen)).toBeNull()
    }
  })

  it('laat gewone paden door en kan bovenste niveaus overslaan', () => {
    expect(veiligPad('/doel', 'python/bin/x')).toBe(path.join('/doel', 'python/bin/x'))
    expect(veiligPad('/doel', 'python/bin/x', 1)).toBe(path.join('/doel', 'bin/x'))
    expect(veiligPad('/doel', 'python', 1)).toBeNull()
  })
})

describe('veiligeLink', () => {
  it('laat een link binnen de map toe en weigert een ontsnapping', () => {
    expect(veiligeLink('/doel', '/doel/bin/python3', 'python3.12')).toBe(true)
    expect(veiligeLink('/doel', '/doel/bin/python3', '../lib/x')).toBe(true)
    expect(veiligeLink('/doel', '/doel/bin/python3', '../../../etc/passwd')).toBe(false)
    expect(veiligeLink('/doel', '/doel/bin/python3', '/etc/passwd')).toBe(false)
  })
})

describe('pakUit', () => {
  it('zet bestanden, rechten en symlinks op schijf', async () => {
    const map = await fs.mkdtemp(path.join(os.tmpdir(), 'tartest-'))
    try {
      await pakUit(
        tarGz(
          tarBlok('python/', { type: '5' }),
          tarBlok('python/bin/echt', { inhoud: 'hallo', modus: 0o755 }),
          tarBlok('python/bin/wijzer', { type: '2', link: 'echt' }),
        ),
        map,
      )
      expect(await fs.readFile(path.join(map, 'python/bin/echt'), 'utf8')).toBe('hallo')
      // Zonder uitvoerrecht is de meegeleverde python geen programma maar een bestand.
      expect((await fs.stat(path.join(map, 'python/bin/echt'))).mode & 0o111).toBeTruthy()
      expect(await fs.readlink(path.join(map, 'python/bin/wijzer'))).toBe('echt')
    } finally {
      await fs.rm(map, { recursive: true, force: true })
    }
  })

  it('schrijft niets buiten de doelmap, wat er ook in de tarball staat', async () => {
    const map = await fs.mkdtemp(path.join(os.tmpdir(), 'tartest-'))
    const buiten = path.join(map, 'buiten.txt')
    try {
      await pakUit(
        tarGz(
          tarBlok('doel/', { type: '5' }),
          tarBlok('doel/../buiten.txt', { inhoud: 'ingebroken' }),
          tarBlok('doel/link', { type: '2', link: '../../../../etc/passwd' }),
        ),
        path.join(map, 'doel'),
      )
      await expect(fs.readFile(buiten)).rejects.toThrow()
      await expect(fs.lstat(path.join(map, 'doel/link'))).rejects.toThrow()
    } finally {
      await fs.rm(map, { recursive: true, force: true })
    }
  })
})
