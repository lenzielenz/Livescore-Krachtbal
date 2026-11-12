// De wettelijke feestdagen in België — puur, zonder DB. Gebruikt om termijnen in werkdagen te tellen
// (RCVK item 25: een voorbehoud bekrachtigen "binnen de 5 werkdagen"): een feestdag is geen werkdag.
//
// Tien dagen: Nieuwjaar, Paasmaandag, Dag van de Arbeid, O.-L.-H.-Hemelvaart, Pinkstermaandag,
// Nationale feestdag, O.-L.-V.-Hemelvaart, Allerheiligen, Wapenstilstand en Kerstmis. De dagen van de
// gemeenschappen (11 juli e.a.) en brugdagen tellen niet: die zijn geen wettelijke feestdag.

const pad = (n: number) => String(n).padStart(2, '0')
const dagStr = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

/** Paaszondag (gregoriaans, anonieme algoritme van Meeus/Jones/Butcher) als [maand, dag]. */
export function paaszondag(jaar: number): [number, number] {
  const a = jaar % 19
  const b = Math.floor(jaar / 100)
  const c = jaar % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const maand = Math.floor((h + l - 7 * m + 114) / 31)
  const dag = ((h + l - 7 * m + 114) % 31) + 1
  return [maand, dag]
}

/** `YYYY-MM-DD` + n kalenderdagen (UTC-rekenen op een datum zonder uur: geen zomertijdgedoe). */
function plus(y: number, m: number, d: number, n: number): string {
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return dagStr(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}

const cache = new Map<number, Map<string, string>>()

/** De wettelijke feestdagen van dat jaar: datum (`YYYY-MM-DD`) → naam. */
export function belgischeFeestdagen(jaar: number): Map<string, string> {
  const al = cache.get(jaar)
  if (al) return al
  const [pm, pd] = paaszondag(jaar)
  const lijst = new Map<string, string>([
    [dagStr(jaar, 1, 1), 'Nieuwjaar'],
    [plus(jaar, pm, pd, 1), 'Paasmaandag'],
    [dagStr(jaar, 5, 1), 'Dag van de Arbeid'],
    [plus(jaar, pm, pd, 39), 'O.-L.-H.-Hemelvaart'],
    [plus(jaar, pm, pd, 50), 'Pinkstermaandag'],
    [dagStr(jaar, 7, 21), 'Nationale feestdag'],
    [dagStr(jaar, 8, 15), 'O.-L.-V.-Hemelvaart'],
    [dagStr(jaar, 11, 1), 'Allerheiligen'],
    [dagStr(jaar, 11, 11), 'Wapenstilstand'],
    [dagStr(jaar, 12, 25), 'Kerstmis'],
  ])
  cache.set(jaar, lijst)
  return lijst
}

/** De naam van de feestdag op die datum (`YYYY-MM-DD`), of null. */
export function feestdag(datum: string): string | null {
  const jaar = Number(datum.slice(0, 4))
  if (!Number.isInteger(jaar)) return null
  return belgischeFeestdagen(jaar).get(datum) ?? null
}
