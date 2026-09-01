import type { Payload } from 'payload'

import { maakOverzetplan, type Voorstelworp } from './cv-naar-worp'
import { leesToewijzing } from './cv-werpers'
import { advanceHalf, buildMatchState, recordThrow, startMatch } from './match-engine'

// De video-weg afmaken: bevestigde voorstellen worden échte worpen.
//
// Waarom dit niet "gewoon rijen wegschrijven" is. Een worp is geen los feit maar een schakel in
// een keten: wie aan bal is, de hoeveelste worp het is, of het balbezit eindigt, of er een
// kruisje bijkomt — dat leidt de match-engine allemaal af. Wie hier rechtstreeks in de
// worp-tabel zou schrijven, breekt precies datgene waar het hele platform op staat.
//
// Daarom wordt er AFGESPEELD: elk voorstel gaat door dezelfde `recordThrow` als een worp die een
// aantekenaar intikt, in videovolgorde. De engine bepaalt zelf welke ploeg aan bal is en wat de
// uitkomst was; wij leveren alleen de plek waar de bal viel, het worptype en of hij gevangen werd.
//
// Drie dingen die daaruit volgen, en die je moet weten vóór je op de knop drukt:
//
//  1. De VOLGORDE is die van de video, niet die van het model zijn zekerheid. Miste het model een
//     worp, dan schuift de keten op: de engine denkt dan dat de volgende worp bij dezelfde ploeg
//     hoort. Dat maakt de overzetting niet stuk (het blijft een geldige wedstrijd), maar het is
//     wél een andere wedstrijd dan die gespeeld werd. Vandaar dat het rapport eerlijk zegt hoeveel
//     er overgeslagen is.
//  2. De PLOEGKANT van het model is niet leidend. Zegt het model "uit" terwijl de keten bij thuis
//     staat, dan weigert de engine die worp — terecht. We nemen daarom de ploeg die volgens de
//     keten aan bal is, en gebruiken het rugnummer enkel om de juiste speler binnen die ploeg te
//     kiezen.
//  3. Het is EENRICHTING, maar omkeerbaar: er komt niets bij een wedstrijd die al worpen heeft, en
//     terugdraaien doe je door de wedstrijd te resetten (die weg bestond al).
//
// En drie dingen die de engine bepaalt en waar wij níét omheen kunnen:
//
//  • De HELFT komt uit match.currentHalf, niet uit de worp. Wie de rust overslaat, krijgt een
//    wedstrijd waarin alles in helft 1 staat en het wedstrijdblad geen tweede helft kent. Is de
//    aftrap van de tweede helft geijkt, dan wisselen we op dát videomoment van helft; is ze dat
//    niet, dan staat álles in helft 1 — en dat zegt het rapport er dan ook bij.
//  • UIT komt wél uit de video, sinds de landing niet meer op de veldrand geklemd wordt: een
//    voorstel met de uitbal-vlag draagt zijn échte landingspunt (buiten de lijnen), en precies
//    daaruit leidt de engine zelf out_side/out_back af. Alleen een uitbal-punt dat te ver
//    buiten het veld ligt om geloofwaardig te zijn, valt nog af — dat staat dan bij
//    'overgeslagen', niet stilzwijgend weg.
//  • De AUDIT-TRAIL blijft leeg: we zetten géén 'createdBy'. Anders zou er in het wedstrijdblad
//    staan dat een mens deze zestig worpen intikte, terwijl een model ze aandroeg.

export type Overzetrapport = {
  /** Hoeveel worpen er zouden overgaan (droogloop) of overgegaan zijn. */
  overgezet: number
  /** Wat er niet overgaat, met reden — stilzwijgend weglaten verzint een andere wedstrijd. */
  overgeslagen: { videoTimeS: number; reden: string }[]
  /** Worpen die de engine weigerde, met haar eigen uitleg. */
  geweigerd: { videoTimeS: number; reden: string }[]
  /** Was dit enkel een voorbeschouwing? */
  droog: boolean
  /** Waar de tweede helft begint (videoseconden), of null als de aftrap niet geijkt is. */
  tweedeHelftVanaf: number | null
  /** Wat deze overzetting niet kan — eerlijk, want het staat straks in de statistieken. */
  beperkingen: string[]
  /** Hoeveel overgezette worpen een herkend rugnummer hadden (0 = de namen zeggen niets). */
  metRugnummer?: number
  /** Hoeveel worpen als vrije worp geteld zijn — daar staat geen voorstel tegenover. */
  vrijeWorpen?: number
}

export type Overzetfout = { fout: string; code: number }

const isFout = (r: Overzetrapport | Overzetfout): r is Overzetfout => 'fout' in r

/**
 * Welke speler werpt deze worp?
 *
 * Het rugnummer van het model als dat er is. Is het er niet — en vandaag is dat de regel, want
 * de videopijplijn vult het rugnummer zelden in — dan is er geen werper te herkennen. Dan zou
 * "de eerste van de opstelling" ervoor zorgen dat één speler álle worpen krijgt, en dat is geen
 * onvolledige spelerskaart maar een verzonnen: veertig worpen op naam van iemand die er misschien
 * twee deed. Vandaar rondgaan over de opstelling: even willekeurig, maar het liegt niet over één
 * speler in het bijzonder. Dat de namen dan niets betekenen, staat in het rapport én in het
 * scherm — en de worp zelf draagt `bron: 'video'`.
 */
export function kiesWerper(
  opstelling: { id: number; shirtNumber: number }[],
  rugnummer: number | null,
  vorigeWerperId: number | null,
  beurt = 0,
): number | null {
  const bruikbaar = opstelling.filter((p) => p.id !== vorigeWerperId)
  if (!bruikbaar.length) return null
  const herkend = rugnummer != null ? bruikbaar.find((p) => p.shirtNumber === rugnummer) : undefined
  return (herkend ?? bruikbaar[beurt % bruikbaar.length]).id
}

/**
 * Zet de bevestigde voorstellen om in worpen.
 *
 * `droog` (standaard) rekent alles uit maar schrijft niets weg: zo zie je eerst hoeveel er
 * overgaat en wat er afvalt. Pas met `droog: false` gebeurt het echt.
 */
export async function zetVoorstellenOver(
  payload: Payload,
  matchId: number,
  opties: { droog?: boolean } = {},
): Promise<Overzetrapport | Overzetfout> {
  const droog = opties.droog !== false

  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
  if (!match) return { fout: 'Wedstrijd niet gevonden.', code: 404 }
  if (match.status === 'finished') {
    return { fout: 'Deze wedstrijd is afgelopen — heropen ze eerst.', code: 409 }
  }
  // Enkel op een analyse-opname. Op een échte wedstrijd zou de gedeelde SSE-hub deze zestig
  // worpen in enkele seconden live naar het publieke scorebord en de kantine-TV duwen — een
  // wedstrijd die zichzelf in sneltempo opnieuw speelt voor iedereen die kijkt.
  if (!match.analyseOnly) {
    return { fout: 'Overzetten kan enkel op een analyse-opname, niet op een echte wedstrijd.', code: 403 }
  }

  const bestaande = await payload
    .find({ collection: 'throws', where: { match: { equals: matchId } }, depth: 0, limit: 1 })
    .catch(() => ({ totalDocs: 0 }))
  if ((bestaande as { totalDocs: number }).totalDocs > 0) {
    return {
      fout:
        'Er staan al worpen in deze wedstrijd. Overzetten zou machinewerk door aangetekend werk '
        + 'mengen; zet de wedstrijd eerst terug op "nog niet gestart".',
      code: 409,
    }
  }

  const voorstellenRes = await payload
    .find({
      collection: 'cv-events',
      where: { match: { equals: matchId } },
      sort: 'videoTimeS',
      depth: 0,
      limit: 3000,
    })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))

  // Wie is wie: de toewijzing die een mens één keer per werper maakte. Daarmee komt élke worp
  // van die werper op de juiste speler terecht, in plaats van op een rondgaande gok.
  const toewijzing = leesToewijzing(match.cvWerpers)

  const plan = maakOverzetplan(
    voorstellenRes.docs as unknown as Voorstelworp[],
    match.goalAreaDepth ?? undefined,
    { breedteM: match.veldBreedte ?? undefined, speelveldM: match.veldSpeelveld ?? undefined },
  )

  if (!plan.worpen.length) {
    return {
      fout:
        'Geen enkel bevestigd voorstel met een landingspunt. Beoordeel eerst de voorstellen — en '
        + 'zonder veldkalibratie is er geen landingspunt, dus dan valt er ook niets over te zetten.',
      code: 400,
    }
  }

  // De rust: enkel te plaatsen als de aftrap van de tweede helft geijkt is. Zonder dat weet
  // niemand waar helft 1 ophoudt, en dan is één helft eerlijker dan een gegokte grens.
  const tweedeHelftVanaf = typeof match.videoOffsetH2 === 'number' ? match.videoOffsetH2 : null
  const opstellingGezet =
    Array.isArray(match.homeLineup) && match.homeLineup.length > 0
    && Array.isArray(match.awayLineup) && match.awayLineup.length > 0
  const beperkingen = [
    ...(opstellingGezet
      ? []
      : ['Er is geen opstelling gekozen: de eerste vier spelers op rugnummer komen op het veld te '
         + 'staan. Wil je kloppende spelerskaarten, zet de opstelling dan eerst.']),
    ...(tweedeHelftVanaf == null
      ? ['De aftrap van de tweede helft is niet geijkt, dus alle worpen komen in helft 1 te staan.']
      : []),
    'Een worp die het model miste, schuift de balbezit-keten op: vanaf daar kan de ploeg die aan '
      + 'bal is verschillen van wat er echt gebeurde.',
  ]

  if (droog) {
    return {
      overgezet: plan.worpen.length,
      overgeslagen: plan.overgeslagen,
      geweigerd: [],
      droog: true,
      tweedeHelftVanaf,
      beperkingen,
    }
  }

  // Starten mag maar één keer, en de engine eist een lopend balbezit vóór de eerste worp. De
  // beginnende ploeg is die van de eerste worp die het model zag — dat is precies de opzet.
  if (match.status !== 'live') {
    const eerste = plan.worpen[0]
    const homeId = typeof match.homeTeam === 'object' ? (match.homeTeam as { id: number }).id : Number(match.homeTeam)
    const awayId = typeof match.awayTeam === 'object' ? (match.awayTeam as { id: number }).id : Number(match.awayTeam)
    const start = eerste.side === 'away' ? awayId : homeId
    try {
      await startMatch(payload, matchId, start)
    } catch (e) {
      return { fout: `De wedstrijd kon niet gestart worden: ${(e as Error).message}`, code: 409 }
    }
  }

  const geweigerd: { videoTimeS: number; reden: string }[] = []
  let overgezet = 0
  let metRugnummer = 0
  let vrijeWorpen = 0
  let beurt = 0
  let inTweedeHelft = false

  for (const worp of plan.worpen) {
    // De rust valt niet uit een worp af te leiden: ze staat op de wedstrijd (de geijkte aftrap
    // van helft 2). Passeren we die grens, dan sluit de engine de helft af en opent ze de
    // volgende — precies zoals een aantekenaar dat met de knop zou doen.
    if (tweedeHelftVanaf != null && !inTweedeHelft && worp.videoTimeS >= tweedeHelftVanaf) {
      inTweedeHelft = true
      try {
        await advanceHalf(payload, matchId)
      } catch (e) {
        geweigerd.push({ videoTimeS: worp.videoTimeS, reden: `rust niet kunnen plaatsen: ${(e as Error).message}` })
      }
    }

    // De stand opnieuw lezen per worp: de keten kan met élke worp van ploeg wisselen, en die
    // beslissing is aan de engine. Duurder dan zelf bijhouden, maar het is precies de plek waar
    // "zelf slim zijn" een stille fout oplevert.
    const state = await buildMatchState(payload, matchId).catch(() => null)
    if (!state?.possession) {
      geweigerd.push({ videoTimeS: worp.videoTimeS, reden: 'geen lopend balbezit meer' })
      break
    }
    // Na het derde kruisje kent de engine zélf een vrije worp toe aan de tegenstander. Daar
    // staat geen voorstel tegenover: de eerstvolgende worp uit de video wordt dan als die vrije
    // worp geteld — één punt in plaats van twee, en op naam van de ándere ploeg. De keten blijft
    // geldig, maar ze wijkt vanaf daar af van wat er echt gebeurde. Tellen en zeggen dus.
    if (state.possession.freeThrow) vrijeWorpen++
    const side = state.possession.side
    const opstelling = await spelersVan(payload, side === 'home' ? state.teams.home.id : state.teams.away.id, state.lineup[side])
    // Wie de vorige worp van dít balbezit deed, weet de engine zelf — en zij is de enige die
    // weet wanneer het balbezit wisselde en die regel dus weer vanaf nul geldt.
    // Eerst de toewijzing: die is van een mens en gaat dus vóór alles. Staat de toegewezen
    // speler niet op het veld (gewisseld, of bij de andere ploeg volgens de balbezit-keten),
    // dan valt het terug op het rugnummer en anders op de rondgang.
    const toegewezen = worp.werper != null ? toewijzing[String(worp.werper)] : undefined
    const uitToewijzing = toegewezen != null
      && opstelling.some((p) => p.id === toegewezen)
      && toegewezen !== state.possession.lastPlayerId
      ? toegewezen
      : null
    const werper = uitToewijzing ?? kiesWerper(opstelling, worp.rugnummer, state.possession.lastPlayerId, beurt)
    beurt++
    if (werper == null) {
      geweigerd.push({ videoTimeS: worp.videoTimeS, reden: 'geen speler op het veld om de worp op te zetten' })
      continue
    }

    try {
      await recordThrow(payload, {
        matchId,
        playerId: werper,
        type: worp.type,
        point: worp.point,
        tapCount: worp.tapCount,
        // De wedstrijdklok: de videotijd min de aftrap van deze helft. Is er niet geijkt, dan ís
        // de videotijd de klok — bij de video-weg tikt niemand een klok aan, en dan is de opname
        // de enige tijdlijn die er is.
        gameClock: Math.max(0, Math.round(worp.videoTimeS - aftrapVan(match, inTweedeHelft))),
        // Bewust géén actorId: 'createdBy' zou beweren dat een mens deze worp intikte.
        bron: 'video',
      })
      overgezet++
      if (uitToewijzing != null
          || (worp.rugnummer != null && opstelling.some((p) => p.shirtNumber === worp.rugnummer))) {
        metRugnummer++
      }
    } catch (e) {
      geweigerd.push({ videoTimeS: worp.videoTimeS, reden: (e as Error).message })
    }
  }

  return {
    overgezet,
    overgeslagen: plan.overgeslagen,
    geweigerd,
    droog: false,
    tweedeHelftVanaf,
    metRugnummer,
    vrijeWorpen,
    beperkingen: [
      ...beperkingen,
      ...(vrijeWorpen > 0
        ? [`${vrijeWorpen} worp(en) zijn als vrije worp geteld: na drie kruisjes kent het `
           + 'reglement er een toe, maar in de video staat daar geen apart voorstel tegenover. '
           + 'Die tellen één punt in plaats van twee.']
        : []),
      ...(overgezet > 0 && metRugnummer === 0
        ? ['Geen enkele worp weet wie hem maakte: de worpen zijn over de opstelling verdeeld. '
           + 'Score, veldkaart en afstanden kloppen; de spelerskaarten zeggen niets. Wijs de '
           + 'werpers toe (hierboven) en zet daarna pas over.']
        : metRugnummer < overgezet
          ? [`${overgezet - metRugnummer} van de ${overgezet} worpen weten niet wie ze maakte `
             + '— die staan op een speler uit de opstelling, niet op wie ze echt deed.']
          : []),
    ],
  }
}

/** De videoseconde waarop de lopende helft begon (0 als er niet geijkt is). */
function aftrapVan(match: { videoOffsetH1?: number | null; videoOffsetH2?: number | null }, tweede: boolean): number {
  const offset = tweede ? match.videoOffsetH2 : match.videoOffsetH1
  return typeof offset === 'number' && Number.isFinite(offset) ? Math.max(0, offset) : 0
}

/** De veldspelers van een ploeg, met hun rugnummer — in de volgorde van de opstelling. */
async function spelersVan(
  payload: Payload,
  teamId: number,
  opstelling: number[],
): Promise<{ id: number; shirtNumber: number }[]> {
  if (!opstelling.length) return []
  const res = await payload
    .find({ collection: 'players', where: { team: { equals: teamId } }, depth: 0, limit: 200 })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const kaart = new Map<number, number>()
  for (const p of res.docs) kaart.set(Number((p as { id: number }).id), Number((p as { shirtNumber?: number }).shirtNumber ?? 0))
  return opstelling.filter((id) => kaart.has(id)).map((id) => ({ id, shirtNumber: kaart.get(id) as number }))
}

export { isFout as isOverzetfout }
