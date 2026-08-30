import fs from 'fs/promises'
import path from 'path'
import zlib from 'zlib'
import { promisify } from 'util'

// Een tar.gz uitpakken zonder het `tar`-commando.
//
// Waarom zelf: de analyse-omgeving wordt op de server binnengehaald, en we weten niet welke
// hulpprogramma's daar in het beeld zitten — dat is precies de aanname die de deploy twee keer
// deed mislukken. Node's zlib zit er sowieso in; de rest is honderd regels formaat lezen.

const gunzip = promisify(zlib.gunzip)

export type TarItem = {
  naam: string
  type: 'bestand' | 'map' | 'link'
  /** Doel van een symlink, anders leeg. */
  link: string
  modus: number
  begin: number
  grootte: number
}

const tekst = (buf: Buffer, van: number, lengte: number) => {
  const ruw = buf.subarray(van, van + lengte)
  const einde = ruw.indexOf(0)
  return ruw.subarray(0, einde === -1 ? ruw.length : einde).toString('utf8')
}

const octaal = (buf: Buffer, van: number, lengte: number) => {
  const s = tekst(buf, van, lengte).trim()
  return s ? parseInt(s, 8) || 0 : 0
}

/**
 * De inhoudsopgave van een uitgepakte tar lezen.
 *
 * Ondersteunt ustar (met `prefix` voor lange paden), GNU-longname (`L`) en symlinks; pax-blokken
 * worden overgeslagen. Meer heeft een python-build-standalone-tarball niet nodig.
 */
export function leesTar(tar: Buffer): TarItem[] {
  const items: TarItem[] = []
  let langeNaam: string | null = null
  for (let pos = 0; pos + 512 <= tar.length; ) {
    const kop = tar.subarray(pos, pos + 512)
    if (kop.every((b) => b === 0)) break // twee lege blokken = einde
    const grootte = octaal(kop, 124, 12)
    const vlag = String.fromCharCode(kop[156] || 48)
    const blokken = Math.ceil(grootte / 512) * 512
    const inhoud = pos + 512

    if (vlag === 'L') {
      // GNU: de échte naam staat in het datablok van dit pseudo-item.
      langeNaam = tekst(tar.subarray(inhoud, inhoud + grootte), 0, grootte)
    } else if (vlag === 'x' || vlag === 'g') {
      // pax-extensies: niet nodig voor onze tarballs.
    } else {
      const prefix = tekst(kop, 345, 155)
      const naam = langeNaam ?? (prefix ? `${prefix}/${tekst(kop, 0, 100)}` : tekst(kop, 0, 100))
      langeNaam = null
      if (naam) {
        items.push({
          naam,
          type: vlag === '5' ? 'map' : vlag === '2' || vlag === '1' ? 'link' : 'bestand',
          link: tekst(kop, 157, 100),
          modus: octaal(kop, 100, 8),
          begin: inhoud,
          grootte: vlag === '5' || vlag === '2' || vlag === '1' ? 0 : grootte,
        })
      }
    }
    pos = inhoud + blokken
  }
  return items
}

/**
 * Waar een item terechtkomt, of null als het buiten de doelmap wil schrijven.
 *
 * Een tarball van het internet mag nooit `../..` kunnen gebruiken; dat geldt ook voor het doel
 * van een symlink, die anders naar elk bestand op de server kan wijzen.
 */
export function veiligPad(doel: string, naam: string, strip = 0): string | null {
  // `tar` maakt van een absolute naam stilzwijgend een relatieve; wij weigeren ze liever. Onze
  // tarball heeft er geen, dus een absolute naam is een reden om níét uit te pakken.
  if (naam.startsWith('/')) return null
  const delen = naam.split('/').filter((d) => d !== '' && d !== '.')
  if (delen.length <= strip) return null
  const rest = delen.slice(strip)
  if (rest.some((d) => d === '..')) return null
  const vol = path.resolve(doel, rest.join('/'))
  return vol === path.resolve(doel) || vol.startsWith(path.resolve(doel) + path.sep) ? vol : null
}

/** Wijst deze symlink binnen de uitgepakte map? (Absolute of ontsnappende links weigeren we.) */
export function veiligeLink(doel: string, vanaf: string, naar: string): boolean {
  if (path.isAbsolute(naar)) return false
  const vol = path.resolve(path.dirname(vanaf), naar)
  return vol === path.resolve(doel) || vol.startsWith(path.resolve(doel) + path.sep)
}

/** Pak een gzip-tar uit in `doel`. `strip` slaat het aantal bovenste mapniveaus over. */
export async function pakUit(gz: Buffer, doel: string, strip = 0): Promise<number> {
  const tar = await gunzip(gz)
  const items = leesTar(tar)
  let aantal = 0
  // Eerst de mappen en bestanden, dan pas de links: een symlink kan naar een bestand wijzen dat
  // verderop in de tarball staat.
  for (const item of items) {
    const pad = veiligPad(doel, item.naam, strip)
    if (!pad || item.type === 'link') continue
    if (item.type === 'map') {
      await fs.mkdir(pad, { recursive: true })
      continue
    }
    await fs.mkdir(path.dirname(pad), { recursive: true })
    await fs.writeFile(pad, tar.subarray(item.begin, item.begin + item.grootte))
    // Uitvoerrechten overnemen: zonder dit is de meegeleverde python geen programma.
    await fs.chmod(pad, item.modus & 0o777 ? item.modus & 0o777 : 0o644)
    aantal++
  }
  for (const item of items) {
    if (item.type !== 'link') continue
    const pad = veiligPad(doel, item.naam, strip)
    if (!pad || !veiligeLink(doel, pad, item.link)) continue
    await fs.mkdir(path.dirname(pad), { recursive: true })
    await fs.rm(pad, { force: true })
    await fs.symlink(item.link, pad)
    aantal++
  }
  return aantal
}
