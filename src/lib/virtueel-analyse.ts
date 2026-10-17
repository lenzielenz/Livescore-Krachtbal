import type { PlekSamenvatting, Samenvatting } from './virtueel-meting'

// De analyse bovenop de metingen van het virtuele stadion (zie lib/virtueel-meting.ts): uit het
// overzicht leiden we af wáár het stadion het moeilijk heeft, wát de rem is (de processor of de
// grafische kaart) en wat je eraan kunt doen. Puur rekenwerk, geen DB: de pagina
// /federatie/stadion en GET /api/virtueel/meting rekenen het telkens opnieuw uit op de verse
// metingen, dus de analyse loopt vanzelf mee met elke bezoeker.

export type Ernst = 'hoog' | 'middel' | 'info'

export type Knelpunt = {
  ernst: Ernst
  /** Waar het over gaat: een plek ("gang"), "laden", "toestellen", "versies"… */
  waar: string
  titel: string
  /** Wat de cijfers zeggen. */
  uitleg: string
  /** Wat je eraan kunt doen. */
  advies: string
}

/** Het doel: een beeld om de 1/60 s. Rond 55 b/s merkt niemand het verschil. */
const VLOT = 55
const TRAAG = 45
const ZEER_TRAAG = 30
/** Een plek telt pas mee met minstens zoveel minuten aan metingen (anders is het ruis). */
const MIN_MINUTEN = 2

/** Wat de rem is op een plek, uit de verhouding processortijd / frametijd. */
export function rem(p: Pick<PlekSamenvatting, 'fps' | 'cpu'>): 'processor' | 'grafische kaart' | 'onbekend' {
  if (!(p.cpu > 0) || !(p.fps > 0)) return 'onbekend'
  const frame = 1000 / p.fps
  if (p.cpu >= frame * 0.6) return 'processor'
  if (p.cpu <= frame * 0.4) return 'grafische kaart'
  return 'onbekend'
}

function adviesVoorPlek(p: PlekSamenvatting): string {
  const r = rem(p)
  const delen: string[] = []
  if (r === 'processor') {
    delen.push(`De processor is de rem (${p.cpu} ms per beeld).`)
    if (p.calls > 400) delen.push(`Met ${p.calls} tekenopdrachten per beeld: meer samenvoegen (samenvoegen.ts) of herhaalde voorwerpen als InstancedMesh tekenen.`)
    else delen.push('Weinig tekenopdrachten, dus de spellogica zelf: zoek wat er hier elk beeld herberekend wordt (wandelaars, animaties, botsingen).')
  } else if (r === 'grafische kaart') {
    delen.push(`De grafische kaart is de rem (processor maar ${p.cpu} ms per beeld).`)
    if (p.tris > 350_000) delen.push(`${Math.round(p.tris / 1000)}k driehoeken per beeld: minder detail of een zichtbaarheidszone (zichtbaarheid.ts) zodat verre delen niet getekend worden.`)
    else delen.push('Weinig driehoeken, dus te veel pixels: doorzichtige vlakken over elkaar, grote lichtgevende sprites of een te hoog pixelbudget hier.')
  } else {
    if (p.calls > 500) delen.push(`${p.calls} tekenopdrachten per beeld is veel: meer samenvoegen.`)
    if (p.tris > 400_000) delen.push(`${Math.round(p.tris / 1000)}k driehoeken per beeld is veel: zichtbaarheidszone of minder detail.`)
    if (!delen.length) delen.push('Geen duidelijke rem uit de cijfers: open de plek lokaal met de profiler van de browser.')
  }
  return delen.join(' ')
}

/** De knelpunten, de ernstigste eerst. */
export function analyseer(s: Samenvatting): Knelpunt[] {
  const uit: Knelpunt[] = []

  if (s.sessies < 5 || s.minuten < 10) {
    uit.push({
      ernst: 'info',
      waar: 'metingen',
      titel: 'Nog weinig metingen',
      uitleg: `${s.sessies} bezoeken, ${s.minuten} minuten. Conclusies worden pas betrouwbaar vanaf een tiental bezoeken.`,
      advies: 'Laat het stadion een paar dagen gewoon gebruiken; de meter verzamelt vanzelf.',
    })
  }

  for (const p of s.plekken) {
    if (p.minuten < MIN_MINUTEN) continue
    if (p.fps < TRAAG) {
      uit.push({
        ernst: p.fps < ZEER_TRAAG ? 'hoog' : 'middel',
        waar: p.plek,
        titel: `Traag op "${p.plek}": ${p.fps} beelden/s`,
        uitleg: `Over ${p.minuten} min (${p.sessies} bezoeken): 95% van de beelden binnen ${p.p95} ms, ${p.calls} tekenopdrachten en ${Math.round(p.tris / 1000)}k driehoeken per beeld${p.cpu ? `, ${p.cpu} ms processortijd` : ''}.`,
        advies: adviesVoorPlek(p),
      })
    } else if (p.schokkenPerMinuut > 30) {
      uit.push({
        ernst: 'middel',
        waar: p.plek,
        titel: `Ongelijk op "${p.plek}": ${p.schokkenPerMinuut} schokken per minuut`,
        uitleg: `Gemiddeld ${p.fps} beelden/s, maar geregeld een beeld dat te laat komt (95e percentiel ${p.p95} ms).`,
        advies: 'Iets dat af en toe zwaar is: laden van textures, samenvoegen, of werk dat om de zoveel beelden gebeurt. Spreid het over meerdere beelden.',
      })
    }
    if (p.haperingenPerMinuut > 1) {
      const erg = s.ergste.filter((e) => e.plek === p.plek).slice(0, 3)
      uit.push({
        ernst: p.haperingenPerMinuut > 4 ? 'hoog' : 'middel',
        waar: p.plek,
        titel: `Haperingen op "${p.plek}": ${p.haperingenPerMinuut} per minuut`,
        uitleg: `Beelden van meer dan 100 ms.${erg.length ? ` Ergste: ${erg.map((e) => `${e.ms} ms`).join(', ')}.` : ''}`,
        advies: 'Een hapering is één zware stap: een shader die pas hier klaargezet wordt, een grote texture, of het samenvoegen van een module. Zet het vooraf klaar of knip het op.',
      })
    }
  }

  if (s.laden.shadersMediaan > 2500) {
    uit.push({
      ernst: s.laden.shadersMediaan > 6000 ? 'hoog' : 'middel',
      waar: 'laden',
      titel: `Shaders klaarzetten duurt ${Math.round(s.laden.shadersMediaan / 100) / 10} s`,
      uitleg: 'De mediaan over alle bezoeken: zo lang blijft het beeld stil bij het starten.',
      advies: 'Minder verschillende materialen (hergebruik dezelfde), of minder lichtsoorten.',
    })
  }
  if (s.laden.eersteBeeldMediaan > 8000) {
    uit.push({
      ernst: 'middel',
      waar: 'laden',
      titel: `Eerste beeld pas na ${Math.round(s.laden.eersteBeeldMediaan / 100) / 10} s`,
      uitleg: 'De mediaan over alle bezoeken, van het openen tot het eerste getekende beeld.',
      advies: 'Minder bouwen vóór het eerste beeld: zware modules (kelder, verdiepen) pas opbouwen als je ernaartoe wandelt.',
    })
  }

  const zwak = s.toestellen.filter((t) => t.sessies >= 2 && t.minuten >= MIN_MINUTEN && t.fps < TRAAG)
  if (zwak.length) {
    uit.push({
      ernst: zwak.some((t) => t.fps < ZEER_TRAAG) ? 'hoog' : 'middel',
      waar: 'toestellen',
      titel: `${zwak.length} ${zwak.length === 1 ? 'grafische kaart haalt' : 'grafische kaarten halen'} het niet`,
      uitleg: zwak
        .slice(0, 5)
        .map((t) => `${t.gpu}: ${t.fps} b/s`)
        .join('; '),
      advies: 'Herken deze kaarten bij het starten en begin daar meteen met minder pixels, minder publiek en een kortere zichtafstand.',
    })
  }

  const ingrepen = Object.values(s.bijsturing).reduce((a, b) => a + b, 0)
  if (s.sessies >= 5 && ingrepen / s.sessies > 0.5) {
    uit.push({
      ernst: 'info',
      waar: 'bijsturing',
      titel: 'De automatische bijsturing grijpt vaak in',
      uitleg: Object.entries(s.bijsturing)
        .sort((a, b) => b[1] - a[1])
        .map(([wat, n]) => `${wat}: ${n}×`)
        .join(', '),
      advies: 'Begin op die toestellen meteen lichter, dan is er geen schokkerige aanloop.',
    })
  }

  // Wat de laatste versie opleverde tegenover de vorige (enkel als beide genoeg metingen hebben).
  const genoeg = s.versies.filter((v) => v.minuten >= 5 && v.versie !== 'onbekend')
  if (genoeg.length >= 2) {
    const [vorige, laatste] = genoeg.slice(-2)
    const verschil = Math.round((laatste.fps - vorige.fps) * 10) / 10
    uit.push({
      ernst: verschil < -3 ? 'hoog' : 'info',
      waar: 'versies',
      titel: verschil < -3 ? `Achteruitgang: versie ${laatste.versie} is ${-verschil} b/s trager` : `Versie ${laatste.versie}: ${verschil >= 0 ? '+' : ''}${verschil} b/s tegenover ${vorige.versie}`,
      uitleg: `${vorige.versie}: ${vorige.fps} b/s, ${vorige.schokkenPerMinuut} schokken/min. ${laatste.versie}: ${laatste.fps} b/s, ${laatste.schokkenPerMinuut} schokken/min.`,
      advies: verschil < -3 ? 'Kijk wat er in die versie aan het stadion veranderde.' : 'Ter info: het effect van de laatste aanpassing.',
    })
  }

  if (!uit.some((k) => k.ernst !== 'info') && s.sessies >= 5 && s.fps >= VLOT) {
    uit.push({
      ernst: 'info',
      waar: 'alles',
      titel: `Het stadion loopt vlot: ${s.fps} beelden/s gemiddeld`,
      uitleg: `${s.sessies} bezoeken, ${s.minuten} minuten, ${s.schokkenPerMinuut} schokken per minuut.`,
      advies: 'Niets dringends.',
    })
  }

  const gewicht: Record<Ernst, number> = { hoog: 0, middel: 1, info: 2 }
  return uit.sort((a, b) => gewicht[a.ernst] - gewicht[b.ernst])
}
