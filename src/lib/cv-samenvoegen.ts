// De detecties van twee camera's samenvoegen tot één stroom.
//
// Een veld van 46 m past zelden in één beeld: wie met twee toestellen filmt, zet er één op elke
// kant. Beide opnames projecteren via hun eigen kalibratie naar hetzélfde veld-assenstelsel
// (cv/veld.py ↔ src/lib/field.ts), dus samenvoegen kan ná die projectie: alles in veldmeters en
// in één gedeelde tijdlijn — die van camera 1, via het geijkte tijdsverschil (video2OffsetS).
//
// De valkuil is het midden van het veld: een worp over de middellijn zien béide camera's, en
// zonder ontdubbeling telt die dubbel — in de voorstellen, in de modelscore en straks in de
// wedstrijd. Vandaar de greedy koppeling op tijdsafstand (zelfde aanpak als cv-score.ts), met
// het landingspunt als scheidsrechter: twee "dezelfde" worpen die tien meter uit elkaar landen
// zijn twéé worpen.
//
// Puur (geen I/O, geen database): de regels komen uit de JSONL-bestanden van de analyse en gaan
// als één lijst naar de bestaande import — die verandert hier niets aan.

/**
 * Werper- en spoornummers van camera 2 krijgen dit erbij: de volgnummers uit houding.py en
 * tracking.py beginnen per video opnieuw, dus "werper 3" van camera 1 en "werper 3" van
 * camera 2 zijn twee verschillende mensen. Met de basis erbij blijven het aparte groepen;
 * een mens wijst ze gewoon allebei aan dezelfde speler toe als het er één blijkt te zijn.
 */
export const CAMERA2_BASIS = 1000

/** Binnen dit venster is een worp van camera 1 en één van camera 2 dezelfde worp. */
export const SAMENVOEG_VENSTER_S = 2.0

/**
 * Landen twee gekoppelde detecties verder dan dit uit elkaar, dan zijn het toch twee worpen.
 * Ruim genomen: elke camera meet de overkant van het veld met meters fout (zie de precisie
 * per veldderde in de kalibratie), dus een strakke grens zou echte duplicaten laten staan.
 */
export const SAMENVOEG_MAX_AFSTAND_M = 8.0

type Regel = Record<string, unknown>

const getal = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Het landingspunt van een detectie (zone of onbeknot uitbal-punt), of null. */
function landingVan(e: Regel): { xM: number; yM: number } | null {
  const zone = e.zone
  if (zone != null && typeof zone === 'object') {
    const xM = getal((zone as { x_m?: unknown }).x_m)
    const yM = getal((zone as { y_m?: unknown }).y_m)
    if (xM != null && yM != null) return { xM, yM }
  }
  if (e.uitbal === true) {
    const xM = getal(e.uitbal_x_m)
    const yM = getal(e.uitbal_y_m)
    if (xM != null && yM != null) return { xM, yM }
  }
  return null
}

/**
 * De regels van camera 2 omzetten naar de gedeelde tijdlijn van camera 1.
 *
 * `offsetS` is het geijkte tijdsverschil: seconde 0 van camera 1 = seconde `offsetS` in
 * camera 2, dus t₁ = t₂ − offset. Wat vóór het begin van camera 1 valt (t₁ < 0) kan nergens
 * op de tijdlijn staan en valt af — geteld, niet stilzwijgend.
 *
 * Elke regel krijgt `camera: 2` (zodat de review de frames uit het juiste beeld haalt) en een
 * werper-volgnummer mét CAMERA2_BASIS erbij.
 */
export function naarTijdlijnCamera1(
  regels: Regel[],
  offsetS: number,
): { regels: Regel[]; buitenTijdlijn: number } {
  const uit: Regel[] = []
  let buitenTijdlijn = 0
  for (const e of regels) {
    const t2 = getal(e.video_time_s)
    if (t2 == null) continue
    const t1 = Math.round((t2 - offsetS) * 1000) / 1000
    if (t1 < 0) {
      buitenTijdlijn++
      continue
    }
    const werper = getal(e.werper)
    uit.push({
      ...e,
      video_time_s: t1,
      camera: 2,
      ...(werper != null && Number.isInteger(werper) ? { werper: werper + CAMERA2_BASIS } : {}),
    })
  }
  return { regels: uit, buitenTijdlijn }
}

/**
 * Waarmee een duplicaat-paar beslecht wordt: eerst een landingspunt, dan de zekerheid.
 *
 * De winnaar draagt `beide_cameras: true`: dat onderscheidt "enkel camera 2 zag hem" van "beide
 * zagen hem, camera 2 had de betere meting". De trainingslus heeft dat onderscheid nodig — een
 * worp die camera 1 nooit zag mag geen label zijn voor camera 1's meetreeks (zie cv-training.ts).
 */
function beste(a: Regel, b: Regel): Regel {
  const landingA = landingVan(a) != null
  const landingB = landingVan(b) != null
  if (landingA !== landingB) return { ...(landingA ? a : b), beide_cameras: true }
  const confA = getal(a.confidence) ?? 0
  const confB = getal(b.confidence) ?? 0
  // Gelijk spel gaat naar camera 1: dat is de hoofdopname waar de tijdlijn op geijkt is.
  return { ...(confB > confA ? b : a), beide_cameras: true }
}

export type Samenvoegrapport = {
  /** Bruikbare detecties per camera (camera 2 al op de gedeelde tijdlijn). */
  camera1: number
  camera2: number
  /** Paren die als dezelfde worp herkend en tot één teruggebracht zijn. */
  ontdubbeld: number
  /** Camera 2-detecties van vóór het begin van camera 1 — die passen nergens op de tijdlijn. */
  buitenTijdlijn: number
}

/**
 * Beide stromen tot één, ontdubbeld en op tijd gesorteerd.
 *
 * De koppeling is greedy op tijdsafstand (dichtstbijzijnde paar eerst, zoals `vergelijk` in
 * cv-score.ts): binnen het venster én — als beide een landingspunt hebben — binnen de
 * landingsgrens is het dezelfde worp. Ontdubbelen gebeurt uitsluitend TUSSEN camera's: twee
 * detecties van dezelfde camera kort na elkaar zijn het oordeel van de detector, niet het onze.
 * Van een paar overleeft de hele regel van de beste kant (landingspunt > zekerheid): velden van
 * twee camera's mengen zou een werper van hier aan een landing van daar koppelen.
 */
export function voegDetectiesSamen(
  cam1: Regel[],
  cam2OpTijdlijn: Regel[],
  opties: { vensterS?: number; maxAfstandM?: number } = {},
): { regels: Regel[]; rapport: Samenvoegrapport } {
  const venster = opties.vensterS ?? SAMENVOEG_VENSTER_S
  const maxAfstand = opties.maxAfstandM ?? SAMENVOEG_MAX_AFSTAND_M

  const een = cam1
    .filter((e) => getal(e.video_time_s) != null)
    .map((e): Regel => ({ ...e, camera: getal(e.camera) ?? 1 }))
  const twee = cam2OpTijdlijn.filter((e) => getal(e.video_time_s) != null)

  // Alle kandidaat-paren binnen het venster, dichtstbijzijnde eerst.
  const paren: { i: number; j: number; verschil: number }[] = []
  for (let i = 0; i < een.length; i++) {
    for (let j = 0; j < twee.length; j++) {
      const verschil = Math.abs((getal(een[i].video_time_s) as number) - (getal(twee[j].video_time_s) as number))
      if (verschil > venster) continue
      const landingEen = landingVan(een[i])
      const landingTwee = landingVan(twee[j])
      if (landingEen && landingTwee) {
        const afstand = Math.hypot(landingEen.xM - landingTwee.xM, landingEen.yM - landingTwee.yM)
        if (afstand > maxAfstand) continue // te ver uit elkaar geland: twee echte worpen
      }
      paren.push({ i, j, verschil })
    }
  }
  paren.sort((a, b) => a.verschil - b.verschil)

  const wegEen = new Set<number>()
  const wegTwee = new Set<number>()
  const vervangen = new Map<number, Regel>()
  let ontdubbeld = 0
  for (const { i, j } of paren) {
    if (wegEen.has(i) || wegTwee.has(j)) continue
    wegEen.add(i)
    wegTwee.add(j)
    vervangen.set(i, beste(een[i], twee[j]))
    ontdubbeld++
  }

  const uit = [
    ...een.map((e, i) => vervangen.get(i) ?? e),
    ...twee.filter((_, j) => !wegTwee.has(j)),
  ].sort((a, b) => (getal(a.video_time_s) as number) - (getal(b.video_time_s) as number))

  return {
    regels: uit,
    rapport: { camera1: een.length, camera2: twee.length, ontdubbeld, buitenTijdlijn: 0 },
  }
}

/**
 * De hele samenvoeging in één beweging: camera 2 op de tijdlijn van camera 1 zetten en dan
 * beide stromen ontdubbeld samenvoegen. Dit is wat de analyse-taak aanroept.
 */
export function samenvoegen(
  cam1: Regel[],
  cam2: Regel[],
  offsetS: number,
  opties: { vensterS?: number; maxAfstandM?: number } = {},
): { regels: Regel[]; rapport: Samenvoegrapport } {
  const omgezet = naarTijdlijnCamera1(cam2, offsetS)
  const uit = voegDetectiesSamen(cam1, omgezet.regels, opties)
  return {
    regels: uit.regels,
    rapport: { ...uit.rapport, buitenTijdlijn: omgezet.buitenTijdlijn },
  }
}

/**
 * Is een tweede camera volledig klaar voor de analyse?
 *
 * Drie dingen moeten er zijn: de opname zelf, het geijkte tijdsverschil (anders vallen de twee
 * tijdlijnen niet op elkaar te leggen) — en dat is het. Een eigen kalibratie is sterk aan te
 * raden (zonder weet camera 2 wél wanneer maar niet wáár), maar net als bij camera 1 geen
 * voorwaarde om worpen te spotten.
 */
export function tweedeCameraKlaar(match: {
  video2Url?: string | null
  video2OffsetS?: number | null
}): { klaar: true } | { klaar: false; reden: string } {
  const url = (match.video2Url ?? '').trim()
  if (!url) return { klaar: false, reden: 'geen tweede camera gekoppeld' }
  if (typeof match.video2OffsetS !== 'number' || !Number.isFinite(match.video2OffsetS)) {
    return {
      klaar: false,
      reden: 'het tijdsverschil met camera 1 is niet geijkt — de twee tijdlijnen vallen dan niet op elkaar te leggen',
    }
  }
  return { klaar: true }
}
