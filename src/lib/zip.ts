// Een minimale ZIP-schrijver, zonder compressie.
//
// Waarom zelfgeschreven en niet een pakket erbij: het gaat om foto's, en JPEG's zijn al
// gecomprimeerd — samenpersen levert daar niets op (soms zelfs een grótere bundel). Wat overblijft
// is het ZIP-formaat zelf, en dat is voor de "opslaan zonder compressie"-variant een handvol
// velden. Een extra afhankelijkheid meeslepen voor honderd regels die nooit meer veranderen, is
// duurder dan ze hier te zetten — zeker met een licentiebeleid dat elke nieuwe dependency laat
// nakijken (zie cv/LICENSES.md).
//
// Bewust NIET ondersteund: mappen, zip64 (bundels boven 4 GB), tijdzones in de tijdstempel.
// Een tornooidag levert enkele honderden foto's; wie daar ooit voorbij gaat, moet dit vervangen
// in plaats van oprekken.

/** Eén bestand in de bundel. */
export type ZipBestand = { naam: string; data: Uint8Array }

// CRC-32 (IEEE 802.3), de controlesom die elke ZIP per bestand verwacht. De tabel wordt één keer
// opgebouwd; zonder tabel is dit tergend traag op een bundel van honderden foto's.
let tabel: Uint32Array | null = null
function crcTabel(): Uint32Array {
  if (tabel) return tabel
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  tabel = t
  return t
}

export function crc32(data: Uint8Array): number {
  const t = crcTabel()
  let c = 0xffffffff
  for (let i = 0; i < data.length; i += 1) c = t[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/**
 * Een bestandsnaam die veilig in een ZIP en op elk besturingssysteem past.
 *
 * Een naam uit de database kan alles bevatten — ook schuine strepen of `..`. In een ZIP is dat
 * geen schoonheidsfoutje maar een lek: wie zo'n bundel uitpakt, schrijft dan buiten de map waar
 * hij dacht uit te pakken ("zip slip").
 */
export function veiligeNaam(naam: string, terugval = 'bestand'): string {
  const schoon = naam
    // Het pad in stukken en de gevaarlijke stukken eruit: '..' hoort nergens in een
    // bestandsnaam thuis, en een schuine streep maakt er een map van.
    .split(/[\\/]+/)
    .filter((deel) => deel && deel !== '.' && deel !== '..')
    .join('-')
    // Stuurtekens en de tekens die Windows weigert. Letters, cijfers, punten en streepjes
    // blijven staan — anders houd je van 'foto.jpg' alleen 'fotojpg' over.
    .replace(/[\u0000-\u001f<>:"|?*]/g, '')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120)
  return schoon || terugval
}

/** Namen uniek maken: twee foto's met dezelfde naam overschrijven elkaar bij het uitpakken. */
export function uniekeNamen(namen: string[]): string[] {
  const gezien = new Map<string, number>()
  return namen.map((ruw) => {
    const naam = veiligeNaam(ruw)
    const sleutel = naam.toLowerCase()
    const n = gezien.get(sleutel) ?? 0
    gezien.set(sleutel, n + 1)
    if (n === 0) return naam
    const punt = naam.lastIndexOf('.')
    return punt > 0 ? `${naam.slice(0, punt)}-${n + 1}${naam.slice(punt)}` : `${naam}-${n + 1}`
  })
}

const schrijf16 = (b: Uint8Array, off: number, v: number) => {
  b[off] = v & 0xff
  b[off + 1] = (v >>> 8) & 0xff
}
const schrijf32 = (b: Uint8Array, off: number, v: number) => {
  b[off] = v & 0xff
  b[off + 1] = (v >>> 8) & 0xff
  b[off + 2] = (v >>> 16) & 0xff
  b[off + 3] = (v >>> 24) & 0xff
}

/** Datum en tijd in het MS-DOS-formaat dat ZIP gebruikt (seconden in stappen van twee). */
export function dosTijd(d: Date): { tijd: number; datum: number } {
  const jaar = Math.max(1980, d.getFullYear())
  return {
    tijd: (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f),
    datum: ((jaar - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

/**
 * Bouw de bundel. Geeft de volledige ZIP terug als één blok bytes.
 *
 * Alles in het geheugen: een tornooidag met een paar honderd foto's is enkele honderden
 * megabytes, en dat past. Zou dit ooit over gigabytes gaan, dan hoort er een stream te komen —
 * maar dan is dit formaat sowieso te klein (zip64).
 */
export function maakZip(bestanden: ZipBestand[], nu: Date = new Date()): Uint8Array {
  const { tijd, datum } = dosTijd(nu)
  const namen = uniekeNamen(bestanden.map((b) => b.naam))
  const coder = new TextEncoder()

  const lokaal: Uint8Array[] = []
  const centraal: Uint8Array[] = []
  let offset = 0

  bestanden.forEach((bestand, i) => {
    const naam = coder.encode(namen[i])
    const som = crc32(bestand.data)
    const lengte = bestand.data.length

    // Lokale kop (30 bytes) + naam + data.
    const kop = new Uint8Array(30 + naam.length)
    schrijf32(kop, 0, 0x04034b50)
    schrijf16(kop, 4, 20) // benodigde versie: 2.0
    schrijf16(kop, 6, 0x0800) // vlaggen: namen in UTF-8
    schrijf16(kop, 8, 0) // methode 0 = opslaan zonder compressie
    schrijf16(kop, 10, tijd)
    schrijf16(kop, 12, datum)
    schrijf32(kop, 14, som)
    schrijf32(kop, 18, lengte)
    schrijf32(kop, 22, lengte)
    schrijf16(kop, 26, naam.length)
    schrijf16(kop, 28, 0)
    kop.set(naam, 30)
    lokaal.push(kop, bestand.data)

    // Centrale map (46 bytes) + naam: de inhoudsopgave achteraan, die elk uitpakprogramma leest.
    const centraalKop = new Uint8Array(46 + naam.length)
    schrijf32(centraalKop, 0, 0x02014b50)
    schrijf16(centraalKop, 4, 20)
    schrijf16(centraalKop, 6, 20)
    schrijf16(centraalKop, 8, 0x0800)
    schrijf16(centraalKop, 10, 0)
    schrijf16(centraalKop, 12, tijd)
    schrijf16(centraalKop, 14, datum)
    schrijf32(centraalKop, 16, som)
    schrijf32(centraalKop, 20, lengte)
    schrijf32(centraalKop, 24, lengte)
    schrijf16(centraalKop, 28, naam.length)
    schrijf32(centraalKop, 42, offset)
    centraalKop.set(naam, 46)
    centraal.push(centraalKop)

    offset += kop.length + lengte
  })

  const centraalBytes = centraal.reduce((n, c) => n + c.length, 0)
  const staart = new Uint8Array(22)
  schrijf32(staart, 0, 0x06054b50)
  schrijf16(staart, 8, bestanden.length)
  schrijf16(staart, 10, bestanden.length)
  schrijf32(staart, 12, centraalBytes)
  schrijf32(staart, 16, offset)

  const totaal = offset + centraalBytes + staart.length
  const uit = new Uint8Array(totaal)
  let p = 0
  for (const blok of [...lokaal, ...centraal, staart]) {
    uit.set(blok, p)
    p += blok.length
  }
  return uit
}
