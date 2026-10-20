// Kalender voor een heel seizoen, met de voorkeuren van de clubs. Pure logica (geen DB) — de route
// /api/federatie/kalender-plan bouwt de invoer uit de inschrijvingen en maakt er wedstrijden van.
//
// De kern (zoals professionele competitieplanners het doen): per reeks een Berger-tabel, en elke
// ploeg krijgt een NUMMER in die tabel. Twee ploegen van dezelfde club die gekoppeld zijn (bv. heren
// en dames van Sint-Michiels) krijgen in hun reeks hetzelfde nummer. Spelen in beide reeksen ook
// dezelfde tegenstander-clubs met hetzelfde nummer, dan valt elke speeldag dezelfde club tegen
// dezelfde club, met dezelfde thuisploeg: dames en heren spelen hetzelfde weekend op hetzelfde terrein.
// Gekoppelde reeksen gebruiken daarom één tabelgrootte (de grootste, even gemaakt; lege nummers zijn
// "vrij").
//
// Daarna zoekt een lokale zoektocht (nummers wisselen, speeldagen wisselen, heen en terug van een
// speeldag omdraaien — alles wat de koppels heel laat) de verdeling met de minste problemen:
// een thuiswedstrijd op een datum dat het terrein van een club niet vrij is (hard of zacht), en
// gekoppelde ploegen die toch niet samen vallen. Wat niet lukte, staat in `problemen`, in mensentaal.

import { brusselsWallUtc, shiftDateStr } from './datetime'

export type PlanPloeg = {
  id: number
  naam: string
  club: number
  clubNaam?: string
  reeks: string
  /** Thuisdag in het weekend (standaard zaterdag). */
  thuisdag?: 'za' | 'zo' | null
  /** Aftrapuur thuis, "HH:MM" (ook "za 16:00" uit de reeksindeling wordt begrepen). */
  thuisUur?: string | null
}
/** Twee ploegen van dezelfde club in verschillende reeksen die samen moeten vallen. */
export type PlanKoppel = { a: number; b: number }
/** Op dit weekend (zaterdag YYYY-MM-DD) is het terrein van de club niet vrij: geen thuiswedstrijd. */
export type PlanOnbeschikbaar = { club: number; weekend: string; hard: boolean; reden?: string | null }
export type PlanOpties = {
  /** De speelweekends, als zaterdag "YYYY-MM-DD", in volgorde (vrije weekends van de federatie al weg). */
  weekends: string[]
  enkelHeen?: boolean
  standaardUur?: string
  standaardDag?: 'za' | 'zo'
  /** Duur van één wedstrijdslot op het terrein (minuten), voor wedstrijden na elkaar. */
  slotMinuten?: number
  /** Aantal velden per club (parallel spelen); standaard 1. */
  velden?: Record<number, number>
  iteraties?: number
  seed?: number
}
export type PlanWedstrijd = {
  reeks: string
  speeldag: number
  weekend: string
  datum: string
  thuis: number
  uit: number
  aftrapUtc: string
  uur: string
  /** Zelfde sleutel = gekoppeld (zelfde clubs, zelfde weekend, zelfde terrein). */
  koppel?: string
}
export type PlanProbleem = {
  soort: 'onbeschikbaar' | 'koppel' | 'weekends' | 'koppel_onmogelijk'
  ernst: 'hard' | 'zacht'
  tekst: string
  ploegen?: number[]
  weekend?: string
}
export type PlanResultaat = {
  wedstrijden: PlanWedstrijd[]
  problemen: PlanProbleem[]
  score: number
  stats: { koppels: number; koppelsSamen: number; wedstrijden: number; reeksen: number }
}

const UUR = /(\d{1,2}):(\d{2})/
const DAG = /\b(za|zo)\b/i

/** "16:00", "za 16:00", "zo 14u30" → { dag, uur }. */
export function leesThuis(p: Pick<PlanPloeg, 'thuisdag' | 'thuisUur'>, standaard: { dag: 'za' | 'zo'; uur: string }) {
  const t = (p.thuisUur ?? '').trim().replace(/u/i, ':')
  const m = UUR.exec(t)
  const uur = m && Number(m[1]) < 24 && Number(m[2]) < 60 ? `${m[1].padStart(2, '0')}:${m[2]}` : standaard.uur
  const dagUitTekst = DAG.exec(t)?.[1]?.toLowerCase() as 'za' | 'zo' | undefined
  return { dag: p.thuisdag ?? dagUitTekst ?? standaard.dag, uur }
}

const minuten = (uur: string) => {
  const [h, m] = uur.split(':').map(Number)
  return h * 60 + m
}
const uurVan = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/** Eenvoudige, voorspelbare random (zelfde invoer → zelfde kalender). */
function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

/**
 * Berger-tabel op nummers 0..n-1 (n even): per ronde de paren [thuisNummer, uitNummer]. Thuis/uit hangt
 * enkel van nummer en ronde af, zodat gekoppelde reeksen dezelfde thuisclub krijgen.
 */
export function bergerRondes(n: number): [number, number][][] {
  const rondes: [number, number][][] = []
  let draai = Array.from({ length: n - 1 }, (_, i) => i + 1)
  for (let r = 0; r < n - 1; r++) {
    const rij = [0, ...draai]
    const ronde: [number, number][] = []
    for (let i = 0; i < n / 2; i++) {
      const a = rij[i]
      const b = rij[n - 1 - i]
      // Klassieke cirkelmethode: nummer 0 wisselt elke ronde, verder speelt de linkerkant thuis.
      // Door het draaien staat elke ploeg ongeveer de helft van de rondes links.
      const aThuis = i === 0 ? r % 2 === 0 : true
      ronde.push(aThuis ? [a, b] : [b, a])
    }
    rondes.push(ronde)
    draai = [draai[draai.length - 1], ...draai.slice(0, -1)]
  }
  return rondes
}

type Component = {
  reeksen: string[]
  n: number
  /** nummer per ploeg-id */
  nummer: Map<number, number>
  /** groepen ploegen die samen één nummer delen (koppels), plus losse ploegen */
  entiteiten: number[][]
  /** volgorde van de heenrondes (permutatie) en welke rondes omgedraaid zijn */
  volgorde: number[]
  omgedraaid: boolean[]
}

export function planKalender(
  ploegen: PlanPloeg[],
  koppels: PlanKoppel[],
  onbeschikbaar: PlanOnbeschikbaar[],
  o: PlanOpties,
): PlanResultaat {
  const problemen: PlanProbleem[] = []
  const standaard = { dag: o.standaardDag ?? 'za', uur: UUR.test(o.standaardUur ?? '') ? (o.standaardUur as string) : '14:00' }
  const slot = o.slotMinuten && o.slotMinuten > 0 ? o.slotMinuten : 120
  const perId = new Map(ploegen.map((p) => [p.id, p]))
  const naam = (id: number) => perId.get(id)?.naam ?? `#${id}`
  const clubNaam = (club: number) => ploegen.find((p) => p.club === club)?.clubNaam ?? `club ${club}`

  // ── 1. Koppels geldig maken: zelfde club, verschillende reeks, elke ploeg in hooguit één koppelgroep
  //       die per reeks maar één ploeg heeft.
  const ouder = new Map<number, number>()
  const vind = (x: number): number => {
    const p = ouder.get(x) ?? x
    if (p === x) return x
    const r = vind(p)
    ouder.set(x, r)
    return r
  }
  const geldigeKoppels: PlanKoppel[] = []
  for (const k of koppels) {
    const a = perId.get(k.a)
    const b = perId.get(k.b)
    if (!a || !b || a.id === b.id) continue
    if (a.club !== b.club || a.reeks === b.reeks) {
      problemen.push({ soort: 'koppel_onmogelijk', ernst: 'zacht', tekst: `${a.naam} en ${b.naam} kunnen niet gekoppeld worden (${a.club !== b.club ? 'andere club' : 'zelfde reeks'}).`, ploegen: [a.id, b.id] })
      continue
    }
    const ra = vind(a.id)
    const rb = vind(b.id)
    if (ra === rb) continue
    // Zou de groep twee ploegen in dezelfde reeks krijgen? Dan kan dit koppel niet.
    const groepA = ploegen.filter((p) => vind(p.id) === ra).map((p) => p.reeks)
    const groepB = ploegen.filter((p) => vind(p.id) === rb).map((p) => p.reeks)
    if (groepA.some((r) => groepB.includes(r))) {
      problemen.push({ soort: 'koppel_onmogelijk', ernst: 'zacht', tekst: `${a.naam} en ${b.naam}: de club heeft al een gekoppelde ploeg in die reeks.`, ploegen: [a.id, b.id] })
      continue
    }
    ouder.set(ra, rb)
    geldigeKoppels.push(k)
  }

  // ── 2. Reeksen die via koppels verbonden zijn, vormen één component met één tabelgrootte.
  const reeksen = [...new Set(ploegen.map((p) => p.reeks))].sort()
  const rOuder = new Map(reeksen.map((r) => [r, r]))
  const rVind = (r: string): string => (rOuder.get(r) === r ? r : rVind(rOuder.get(r)!))
  for (const k of geldigeKoppels) rOuder.set(rVind(perId.get(k.a)!.reeks), rVind(perId.get(k.b)!.reeks))
  const comps: Component[] = []
  for (const wortel of [...new Set(reeksen.map(rVind))]) {
    const rs = reeksen.filter((r) => rVind(r) === wortel)
    const grootte = Math.max(...rs.map((r) => ploegen.filter((p) => p.reeks === r).length))
    if (grootte < 2) continue
    const n = grootte % 2 === 0 ? grootte : grootte + 1
    const inComp = ploegen.filter((p) => rs.includes(p.reeks))
    const groepen = new Map<number, number[]>()
    for (const p of inComp) groepen.set(vind(p.id), [...(groepen.get(vind(p.id)) ?? []), p.id])
    // Grote koppelgroepen eerst een nummer geven: die zijn het moeilijkst te plaatsen.
    const entiteiten = [...groepen.values()].sort((x, y) => y.length - x.length || x[0] - y[0])
    const nummer = new Map<number, number>()
    const bezet = new Map(rs.map((r) => [r, new Set<number>()]))
    for (const e of entiteiten) {
      const vrij = Array.from({ length: n }, (_, i) => i).find((i) => e.every((id) => !bezet.get(perId.get(id)!.reeks)!.has(i)))
      if (vrij == null) {
        // Kan in theorie niet (een reeks heeft nooit meer ploegen dan n), maar val veilig terug: los plaatsen.
        for (const id of e) {
          const r = perId.get(id)!.reeks
          const los = Array.from({ length: n }, (_, i) => i).find((i) => !bezet.get(r)!.has(i))!
          bezet.get(r)!.add(los)
          nummer.set(id, los)
        }
        continue
      }
      for (const id of e) {
        bezet.get(perId.get(id)!.reeks)!.add(vrij)
        nummer.set(id, vrij)
      }
    }
    comps.push({ reeksen: rs, n, nummer, entiteiten, volgorde: Array.from({ length: n - 1 }, (_, i) => i), omgedraaid: Array(n - 1).fill(false) })
  }

  const rondesNodig = Math.max(0, ...comps.map((c) => (c.n - 1) * (o.enkelHeen ? 1 : 2)))
  if (rondesNodig > o.weekends.length) {
    problemen.push({ soort: 'weekends', ernst: 'hard', tekst: `Er zijn ${rondesNodig} speelweekends nodig, maar maar ${o.weekends.length} beschikbaar: de laatste speeldagen vallen weg. Voeg weekends toe.` })
  }

  // ── 3. Van nummers naar wedstrijden.
  const onb = new Map<string, PlanOnbeschikbaar>()
  for (const x of onbeschikbaar) {
    const key = `${x.club}|${x.weekend}`
    const al = onb.get(key)
    if (!al || (x.hard && !al.hard)) onb.set(key, x)
  }

  type Ruwe = { reeks: string; speeldag: number; weekend: string; thuis: number; uit: number }
  const bouw = (c: Component): Ruwe[] => {
    const tabel = bergerRondes(c.n)
    const perReeksNummer = new Map<string, Map<number, number>>()
    for (const [id, nr] of c.nummer) {
      const r = perId.get(id)!.reeks
      if (!perReeksNummer.has(r)) perReeksNummer.set(r, new Map())
      perReeksNummer.get(r)!.set(nr, id)
    }
    const heen = c.volgorde.map((ri, k) => tabel[ri].map(([a, b]) => (c.omgedraaid[k] ? [b, a] : [a, b]) as [number, number]))
    const alle = o.enkelHeen ? heen : [...heen, ...heen.map((r) => r.map(([a, b]) => [b, a] as [number, number]))]
    const uit: Ruwe[] = []
    alle.forEach((ronde, k) => {
      const weekend = o.weekends[k]
      if (!weekend) return
      for (const r of c.reeksen) {
        const nrs = perReeksNummer.get(r) ?? new Map()
        for (const [a, b] of ronde) {
          const thuis = nrs.get(a)
          const tegen = nrs.get(b)
          if (thuis == null || tegen == null) continue // vrij
          uit.push({ reeks: r, speeldag: k + 1, weekend, thuis, uit: tegen })
        }
      }
    })
    return uit
  }

  const strafVan = (c: Component): number => {
    let s = 0
    for (const w of bouw(c)) {
      const x = onb.get(`${perId.get(w.thuis)!.club}|${w.weekend}`)
      if (x) s += x.hard ? 1000 : 10
    }
    return s
  }

  // ── 4. Lokaal zoeken per component (componenten hangen niet van elkaar af).
  const random = rng(o.seed ?? 20261020)
  const iteraties = o.iteraties ?? 2500
  for (const c of comps) {
    let huidig = strafVan(c)
    for (let it = 0; it < iteraties && huidig > 0; it++) {
      const zet = random()
      let terug: () => void
      if (zet < 0.5 && c.entiteiten.length > 1) {
        // Twee nummers volledig wisselen (alle ploegen op die nummers, in alle reeksen van de component).
        const i = Math.floor(random() * c.n)
        let j = Math.floor(random() * c.n)
        if (j === i) j = (j + 1) % c.n
        const wissel = () => {
          for (const [id, nr] of c.nummer) {
            if (nr === i) c.nummer.set(id, j)
            else if (nr === j) c.nummer.set(id, i)
          }
        }
        wissel()
        terug = wissel
      } else if (zet < 0.8) {
        const i = Math.floor(random() * c.volgorde.length)
        const j = Math.floor(random() * c.volgorde.length)
        const wissel = () => {
          ;[c.volgorde[i], c.volgorde[j]] = [c.volgorde[j], c.volgorde[i]]
          ;[c.omgedraaid[i], c.omgedraaid[j]] = [c.omgedraaid[j], c.omgedraaid[i]]
        }
        wissel()
        terug = wissel
      } else {
        const i = Math.floor(random() * c.omgedraaid.length)
        c.omgedraaid[i] = !c.omgedraaid[i]
        terug = () => {
          c.omgedraaid[i] = !c.omgedraaid[i]
        }
      }
      const nieuw = strafVan(c)
      if (nieuw <= huidig) huidig = nieuw
      else terug()
    }
  }

  // ── 5. Data en uren: thuisdag van de thuisploeg; wedstrijden op hetzelfde terrein na elkaar.
  const ruw = comps.flatMap(bouw)
  const wedstrijden: PlanWedstrijd[] = []
  const perTerreinDag = new Map<string, Ruwe[]>()
  for (const w of ruw) {
    const t = perId.get(w.thuis)!
    const { dag } = leesThuis(t, standaard)
    const datum = dag === 'zo' ? shiftDateStr(w.weekend, 1) : w.weekend
    const key = `${t.club}|${datum}`
    perTerreinDag.set(key, [...(perTerreinDag.get(key) ?? []), w])
  }
  for (const [key, lijst] of perTerreinDag) {
    const [club, datum] = key.split('|')
    const velden = Math.max(1, o.velden?.[Number(club)] ?? 1)
    // Gekoppelde wedstrijden (zelfde uitclub) na elkaar: sorteer op uitclub, dan op gewenst uur.
    const gesorteerd = [...lijst].sort((a, b) => {
      const ca = perId.get(a.uit)!.club
      const cb = perId.get(b.uit)!.club
      return ca - cb || minuten(leesThuis(perId.get(a.thuis)!, standaard).uur) - minuten(leesThuis(perId.get(b.thuis)!, standaard).uur)
    })
    const vrijOp = Array(velden).fill(0)
    // Uitclubs in de volgorde van hun eerste gewenst uur.
    for (const w of gesorteerd) {
      const gewenst = minuten(leesThuis(perId.get(w.thuis)!, standaard).uur)
      const veld = vrijOp.indexOf(Math.min(...vrijOp))
      const start = Math.max(gewenst, vrijOp[veld])
      vrijOp[veld] = start + slot
      const [y, m, d] = datum.split('-').map(Number)
      const uur = uurVan(start)
      const koppelSleutel = `${club}-${perId.get(w.uit)!.club}-${datum}`
      wedstrijden.push({
        reeks: w.reeks,
        speeldag: w.speeldag,
        weekend: w.weekend,
        datum,
        thuis: w.thuis,
        uit: w.uit,
        uur,
        aftrapUtc: brusselsWallUtc(y, m, d, Math.floor(start / 60), start % 60).toISOString(),
        koppel: koppelSleutel,
      })
    }
  }
  // Een koppelsleutel die maar één keer voorkomt, is geen koppel.
  const telling = new Map<string, number>()
  for (const w of wedstrijden) telling.set(w.koppel!, (telling.get(w.koppel!) ?? 0) + 1)
  for (const w of wedstrijden) if ((telling.get(w.koppel!) ?? 0) < 2) delete w.koppel
  wedstrijden.sort((a, b) => a.aftrapUtc.localeCompare(b.aftrapUtc) || a.reeks.localeCompare(b.reeks))

  // ── 6. Wat niet lukte, in mensentaal.
  let score = 0
  for (const w of wedstrijden) {
    const club = perId.get(w.thuis)!.club
    const x = onb.get(`${club}|${w.weekend}`)
    if (!x) continue
    score += x.hard ? 1000 : 10
    problemen.push({
      soort: 'onbeschikbaar',
      ernst: x.hard ? 'hard' : 'zacht',
      tekst: `${naam(w.thuis)} – ${naam(w.uit)} (${w.reeks}) valt thuis bij ${clubNaam(club)} op het weekend van ${w.weekend}, terwijl dat terrein niet vrij is${x.reden ? ` (${x.reden})` : ''}. ${x.hard ? 'Verplaats deze wedstrijd in de planner.' : 'Zachte wens: niet anders in te passen zonder een andere te breken.'}`,
      ploegen: [w.thuis, w.uit],
      weekend: w.weekend,
    })
  }
  // Koppels: vallen de gekoppelde ploegen telkens samen (zelfde weekend, zelfde tegenstander-club)?
  let samen = 0
  let totaal = 0
  for (const k of geldigeKoppels) {
    const wa = wedstrijden.filter((w) => w.thuis === k.a || w.uit === k.a)
    for (const w of wa) {
      totaal++
      const tegenClub = perId.get(w.thuis === k.a ? w.uit : w.thuis)!.club
      const ok = wedstrijden.some((x) => (x.thuis === k.b || x.uit === k.b) && x.weekend === w.weekend && perId.get(x.thuis === k.b ? x.uit : x.thuis)!.club === tegenClub && (x.thuis === k.b) === (w.thuis === k.a))
      if (ok) samen++
    }
  }
  // Een koppel valt enkel samen als ook de tegenstander-club twee gekoppelde ploegen heeft; zo niet,
  // dan is dat geen fout van de planning — enkel melden als het opvallend weinig lukt.
  if (totaal > 0 && samen / totaal < 0.5 && geldigeKoppels.length) {
    problemen.push({
      soort: 'koppel',
      ernst: 'zacht',
      tekst: `Gekoppelde ploegen vallen in ${samen} van de ${totaal} wedstrijden samen. Dat lukt enkel tegen clubs die in beide reeksen een (gekoppelde) ploeg hebben.`,
    })
  }

  return {
    wedstrijden,
    problemen,
    score,
    stats: { koppels: totaal, koppelsSamen: samen, wedstrijden: wedstrijden.length, reeksen: comps.reduce((t, c) => t + c.reeksen.length, 0) },
  }
}
