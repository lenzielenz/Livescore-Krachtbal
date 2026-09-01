import { FIELD, distanceM, projectWerpplaats, totalLengthM, veldMaten, type Point, type VeldMaten } from './field'

// Van een bevestigd videovoorstel naar de invoer van één worp.
//
// De video-weg belooft "alles op video berekend": je voert niets in, je bevestigt wat het model
// aandroeg. Maar zolang een bevestigd voorstel enkel een voorstel blijft, blijft de veldkaart
// leeg en klopt er geen enkele statistiek — de rest van het platform leeft van `throws`.
//
// Deze module doet de vertaling, en niets meer dan dat. Hij is bewust puur en klein, want de
// drie plekken waar het stil fout kan gaan zitten hier:
//
//  1. HET ASSENSTELSEL. cv/veld.py spiegelt src/lib/field.ts exact: x over de breedte, y over de
//     volledige lengte inclusief beide doelgebieden, y=0 aan de thuis-achterlijn. De CV levert
//     meters, de engine wil genormaliseerd. Eén keer verkeerd delen en elke landing ligt op een
//     andere plek op het veld — zonder dat er iets crasht.
//  2. DE UITKOMST. De engine leidt die zélf af uit het landingspunt (deriveOutcome): doel, uit,
//     eigen doelgebied. Wij mogen dus nooit een uitkomst meegeven — enkel of de bal gevángen
//     werd, want dát is het enige dat je niet aan de landingsplek ziet.
//  3. WAT NIET OVER MAG. Een voorstel zonder landingspunt kan geen worp worden: dan is er geen
//     plek, en de engine zou er een verzinnen. Zo'n voorstel hoort overgeslagen te worden, mét
//     vermelding — stilzwijgend weglaten is hoe je een wedstrijd van 60 worpen als 41 in de
//     boeken krijgt.

/** Wat er van een cv-event nodig is om er een worp van te maken. */
export type Voorstelworp = {
  videoTimeS: number
  /** De werper-groep uit de videoanalyse (geen rugnummer). */
  werper?: number | null
  eventType: 'worp' | 'vangst' | 'doelpunt' | 'buitenspel'
  worpType?: 'nek' | 'rug' | null
  side?: 'home' | 'away' | null
  rugnummer?: number | null
  xM?: number | null
  yM?: number | null
  /** De bal landde buiten de lijnen: het punt ligt dan bewúst buiten het veld. */
  uitbal?: boolean | null
  verdict?: 'bevestigd' | 'afgewezen' | null
}

/** De velden die recordThrow van ons verwacht (de rest leidt de engine zelf af). */
export type Worpinvoer = {
  type: 'nek' | 'rug'
  /** De werper-groep uit de video; met de toewijzing wordt dat een échte speler. */
  werper: number | null
  point: Point
  tapCount: 1 | 2
  rugnummer: number | null
  side: 'home' | 'away' | null
  videoTimeS: number
}

/** Meters op het veld → genormaliseerd punt. Spiegel van `toMeters` en van cv/veld.py. */
export function naarNorm(
  xM: number,
  yM: number,
  goalAreaDepthM: number = FIELD.defaultGoalAreaDepthM,
  maten?: Partial<VeldMaten> | null,
): Point {
  const breedte = veldMaten(maten).breedteM
  const lengte = totalLengthM(goalAreaDepthM, maten)
  return {
    x: breedte > 0 ? xM / breedte : 0,
    y: lengte > 0 ? yM / lengte : 0,
  }
}

/**
 * Reglementaire worpafstand (meters) uit werpplaats + landingspunt, met de field.ts-machinerie.
 *
 * Dít is de ene bron van waarheid voor "hoe ver was die worp": dezelfde §6.4-projectie
 * (projectWerpplaats) en dezelfde metriek (distanceM, met de echte veldmaten en diepte van de
 * wedstrijd) als voor handmatig aangetekende worpen. landing.py rekent voor het losse
 * CLI-rapport en de overlay een eigen benadering uit, maar dat getal komt de app niet in —
 * twee afstandsberekeningen drijven onvermijdelijk uiteen.
 */
export function afstandVanWorp(
  werpplaats: { xM: number; yM: number },
  landing: { xM: number; yM: number },
  goalAreaDepthM: number = FIELD.defaultGoalAreaDepthM,
  maten?: Partial<VeldMaten> | null,
): number {
  // De CV levert de werpplaats al §6.4-geprojecteerd aan, maar de engine blijft de baas over
  // die regel: hier nogmaals projecteren is idempotent én vangt een CV-kant die het ooit
  // vergeet. De opzetcontext (vangst ín het doelgebied) kent de CV niet, dus geen
  // vanuitDoelgebied — exact dezelfde aanname als projecteer_vrijeworplijn in landing.py.
  const van = projectWerpplaats(naarNorm(werpplaats.xM, werpplaats.yM, goalAreaDepthM, maten), goalAreaDepthM, {
    maten,
  })
  const naar = naarNorm(landing.xM, landing.yM, goalAreaDepthM, maten)
  return distanceM(van, naar, goalAreaDepthM, maten)
}

/**
 * De afstand voor één ruw CV-event (JSONL-rij uit landing.py), of null als er geen hoort.
 *
 * Leest bewúst nooit het Python-veld `afstand_m`: dat is enkel de CLI-benadering. Regels:
 *  - een uitbal krijgt géén afstand — het reglement kent geen worpafstand voor een worp
 *    die buiten de lijnen eindigt;
 *  - zonder werpplaats (het event draagt 'werpplaats' uit landing.py) geen afstand;
 *  - zonder landingspunt (zone) valt er niets te meten.
 */
export function afstandUitEvent(
  e: Record<string, unknown>,
  goalAreaDepthM: number = FIELD.defaultGoalAreaDepthM,
  maten?: Partial<VeldMaten> | null,
): number | null {
  if (e.uitbal === true) return null
  const getal = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const punt = (v: unknown): { xM: number; yM: number } | null => {
    if (v == null || typeof v !== 'object') return null
    const xM = getal((v as { x_m?: unknown }).x_m)
    const yM = getal((v as { y_m?: unknown }).y_m)
    return xM != null && yM != null ? { xM, yM } : null
  }
  const werpplaats = punt(e.werpplaats)
  const landing = punt(e.zone)
  if (!werpplaats || !landing) return null
  // Zelfde granulariteit als de rest van de meterswaarden in cv-events (2 decimalen).
  return Math.round(afstandVanWorp(werpplaats, landing, goalAreaDepthM, maten) * 100) / 100
}

/**
 * De richting van een worp, in graden.
 *
 * Nul is recht naar de UITKANT, positief naar rechts — met links en rechts zoals de hele app
 * ze afspreekt: sta op de achterlijn aan de thuiskant en kijk naar de uitkant, dan is links
 * x=0 (zie `kalibratie-punten.ts`). Dus:
 *
 *     0°  recht over de lengte-as naar de uitkant
 *   +90°  dwars naar de rechterzijlijn
 *   −90°  dwars naar de linkerzijlijn
 *  ±180°  terug naar de thuiskant
 *
 * Bewust in het assenstelsel van het VELD en niet in dat van de aanvallende ploeg: de video
 * weet niet welke kant een ploeg aanvalt (dat hangt van de helft af, en dat weet de engine).
 * Wie het per ploeg wil lezen, draait het teken om voor de bezoekers — één keer, op de plek
 * die de helft kent, in plaats van hier een aanname te maken die er in de tweede helft naast zit.
 *
 * Zelfde beginpunt als de afstand: de §6.4-geprojecteerde werpplaats. Anders beschrijven het
 * getal "hoe ver" en het getal "welke kant op" niet dezelfde worp.
 */
export function richtingVanWorp(
  werpplaats: { xM: number; yM: number },
  landing: { xM: number; yM: number },
  goalAreaDepthM: number = FIELD.defaultGoalAreaDepthM,
  maten?: Partial<VeldMaten> | null,
): number | null {
  const norm = veldMaten(maten)
  const lengte = totalLengthM(goalAreaDepthM, maten)
  const van = projectWerpplaats(naarNorm(werpplaats.xM, werpplaats.yM, goalAreaDepthM, maten), goalAreaDepthM, {
    maten,
  })
  const dx = landing.xM - van.x * norm.breedteM
  const dy = landing.yM - van.y * lengte
  // Een worp die op zijn vertrekpunt landt heeft geen richting. Onder een centimeter is dat
  // geen worp maar meetruis, en atan2 zou er een willekeurige hoek van maken.
  if (Math.hypot(dx, dy) < 0.01) return null
  const graden = (Math.atan2(dx, dy) * 180) / Math.PI
  return Math.round(graden * 10) / 10
}

/**
 * De richting voor één ruw CV-event (JSONL-rij uit landing.py), of null als er geen hoort.
 *
 * Anders dan de afstand telt een uitbal hier wél mee: het reglement kent geen worpafstand voor
 * een bal die buiten eindigt, maar "welke kant ging hij uit" is juist dán het interessante —
 * en het landingspunt van een uitbal staat bewust ónbeknot in het event.
 */
export function richtingUitEvent(
  e: Record<string, unknown>,
  goalAreaDepthM: number = FIELD.defaultGoalAreaDepthM,
  maten?: Partial<VeldMaten> | null,
): number | null {
  const getal = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const punt = (v: unknown): { xM: number; yM: number } | null => {
    if (v == null || typeof v !== 'object') return null
    const xM = getal((v as { x_m?: unknown }).x_m)
    const yM = getal((v as { y_m?: unknown }).y_m)
    return xM != null && yM != null ? { xM, yM } : null
  }
  const werpplaats = punt(e.werpplaats)
  if (!werpplaats) return null
  const uitbalX = getal(e.uitbal_x_m)
  const uitbalY = getal(e.uitbal_y_m)
  const landing =
    punt(e.zone) ?? (e.uitbal === true && uitbalX != null && uitbalY != null ? { xM: uitbalX, yM: uitbalY } : null)
  if (!landing) return null
  return richtingVanWorp(werpplaats, landing, goalAreaDepthM, maten)
}

/**
 * De richting in mensentaal. Voor het scherm: "-3,4°" zegt een aantekenaar niets, "recht
 * vooruit" wel.
 */
export function richtingTekst(graden: number | null | undefined): string | null {
  if (graden == null || !Number.isFinite(graden)) return null
  const g = ((graden + 180) % 360) - 180
  const a = Math.abs(g)
  const kant = g < 0 ? 'links' : 'rechts'
  if (a <= 15) return 'recht vooruit'
  if (a >= 165) return 'terug naar achter'
  if (a >= 115) return `schuin achteruit ${kant}`
  if (a >= 65) return `dwars naar ${kant}`
  return `schuin naar ${kant}`
}

/** Ligt dit punt binnen het veld? Buiten zónder uitbal-vlag betekent: de meting deugt niet. */
export function opHetVeld(p: Point, marge = 0.02): boolean {
  return p.x >= -marge && p.x <= 1 + marge && p.y >= -marge && p.y <= 1 + marge
}

/**
 * Is dit een geloofwaardig uitbal-punt?
 *
 * Een uitbal ligt buiten de lijnen, maar niet in een ander dorp: tot een halve veldmaat
 * erbuiten is een gemiste bal, verder is het een kapotte projectie. De grens is ruim genomen —
 * een verre uitworp over de achterlijn kan best tien meter doorschieten.
 */
export function geloofwaardigeUitbal(p: Point): boolean {
  return p.x >= -0.5 && p.x <= 1.5 && p.y >= -0.5 && p.y <= 1.5 && !opHetVeld(p, 0)
}

/**
 * Eén bevestigd voorstel als worp-invoer, of null als het niet overgezet kan worden.
 *
 * Enkel BEVESTIGDE voorstellen komen in aanmerking: een afgewezen voorstel is per definitie
 * geen worp, en een onbeoordeeld voorstel is nog niemands oordeel.
 */
export function worpUitVoorstel(
  v: Voorstelworp,
  goalAreaDepthM: number = FIELD.defaultGoalAreaDepthM,
  maten?: Partial<VeldMaten> | null,
): Worpinvoer | null {
  if (v.verdict !== 'bevestigd') return null
  if (typeof v.xM !== 'number' || typeof v.yM !== 'number') return null
  if (!Number.isFinite(v.xM) || !Number.isFinite(v.yM)) return null

  const point = naarNorm(v.xM, v.yM, goalAreaDepthM, maten)
  // Een uitbal ligt bewúst buiten de lijnen: dat punt moet ONGEKLEMD naar de engine, want
  // precies daaruit leidt die 'uit' af (out_side/out_back). Alles daarbuiten blijft de oude
  // regel: buiten het veld zonder uitbal-vlag is een kapotte meting, geen worp.
  const uitbal = v.uitbal === true && geloofwaardigeUitbal(point)
  if (!uitbal && !opHetVeld(point)) return null

  return {
    // Weet het model het worptype niet, dan is 'nek' de gewone worp — en de reviewlaan laat
    // je dat per voorstel corrigeren vóór je overzet.
    type: v.worpType === 'rug' ? 'rug' : 'nek',
    point: uitbal ? point : { x: Math.min(1, Math.max(0, point.x)), y: Math.min(1, Math.max(0, point.y)) },
    // Twee tikken = gevangen. Dat is het enige dat je niet aan de landingsplek kunt zien; doel,
    // uit en eigen doelgebied leidt de engine zelf af.
    tapCount: v.eventType === 'vangst' ? 2 : 1,
    rugnummer: typeof v.rugnummer === 'number' && v.rugnummer >= 0 ? v.rugnummer : null,
    werper: typeof v.werper === 'number' && Number.isFinite(v.werper) ? v.werper : null,
    side: v.side === 'home' || v.side === 'away' ? v.side : null,
    videoTimeS: v.videoTimeS,
  }
}

export type Overzetplan = {
  /** De worpen die overgezet kunnen worden, op videotijd gesorteerd. */
  worpen: Worpinvoer[]
  /** Wat er afvalt en waarom — stilzwijgend weglaten verzint een andere wedstrijd. */
  overgeslagen: { videoTimeS: number; reden: string }[]
}

/**
 * Het plan: welke bevestigde voorstellen worden worpen, en wat valt af?
 *
 * Op videotijd, want dat is de volgorde waarin het gespeeld werd. De engine bouwt de
 * balbezit-keten daaruit op; wij bepalen die niet.
 */
export function maakOverzetplan(
  voorstellen: Voorstelworp[],
  goalAreaDepthM: number = FIELD.defaultGoalAreaDepthM,
  maten?: Partial<VeldMaten> | null,
): Overzetplan {
  const worpen: Worpinvoer[] = []
  const overgeslagen: { videoTimeS: number; reden: string }[] = []

  for (const v of [...voorstellen].sort((a, b) => a.videoTimeS - b.videoTimeS)) {
    if (v.verdict === 'afgewezen') continue
    if (v.verdict !== 'bevestigd') {
      overgeslagen.push({ videoTimeS: v.videoTimeS, reden: 'nog niet beoordeeld' })
      continue
    }
    const w = worpUitVoorstel(v, goalAreaDepthM, maten)
    if (!w) {
      overgeslagen.push({
        videoTimeS: v.videoTimeS,
        reden:
          typeof v.xM === 'number' && typeof v.yM === 'number'
            ? v.uitbal === true
              ? 'uitbal-punt te ver buiten het veld om geloofwaardig te zijn'
              : 'landingspunt valt buiten het veld'
            : 'geen landingspunt (zonder veldkalibratie weet niets waar de bal viel)',
      })
      continue
    }
    worpen.push(w)
  }

  return { worpen, overgeslagen }
}
