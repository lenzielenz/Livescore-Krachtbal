// Wie mag een wedstrijd terugzetten op "nog niet gestart", en wanneer?
//
// Terugzetten is de zwaarste knop in de aantekentafel: alles wat ingevoerd is — worpen, score,
// kruisjes, klok — verdwijnt. Tegelijk is het de knop die je nodig hebt op het moment dat iemand
// per ongeluk op start drukte, en dan staat er per definitie nog niets in.
//
// DECISION Robin 2026-09-06: die twee gevallen mogen niet dezelfde lat krijgen. Wie een wedstrijd
// mag aantekenen (ook wie dat enkel via de open livescore mag) mag ze terugzetten zolang er nog
// niets vastligt. Zodra er wél iets aangetekend is, geldt de oude, strengere regel: een echte
// aantekenrol, en boven nul enkel de federatie. Aanleiding: een clubverantwoordelijke kon de
// wedstrijd aantekenen maar niet terugzetten, en las een melding die zei dat hij aantekenaar
// moest zijn — terwijl hij dat op dat moment was.
//
// Pure functie, bewust zonder database: de regel is het delicate stuk en hoort volledig
// testbaar te zijn. De route verzamelt de vier feiten en laat deze module beslissen.

/** Wat een reset zou weggooien. Zie `matchResetImpact` in match-engine.ts. */
export type ResetImpact = {
  worpen: number
  /** Doelpunten uit de snelscoremodus (matches.simpleScore). */
  doelpunten: number
  /** Kruisjes uit de snelscoremodus. */
  kruisjes: number
  /** Niets aangetekend — terugzetten gooit dan niets weg. */
  leeg: boolean
}

export type ResetOordeel = { ok: true } | { ok: false; reden: string }

const meervoud = (n: number, enkel: string, meer: string) => `${n} ${n === 1 ? enkel : meer}`

/** "12 worpen en 3 doelpunten" — enkel wat er écht staat, in leesbare taal. */
export function beschrijfImpact(impact: ResetImpact): string {
  const delen: string[] = []
  if (impact.worpen > 0) delen.push(meervoud(impact.worpen, 'worp', 'worpen'))
  if (impact.doelpunten > 0) delen.push(meervoud(impact.doelpunten, 'doelpunt', 'doelpunten'))
  if (impact.kruisjes > 0) delen.push(meervoud(impact.kruisjes, 'kruisje', 'kruisjes'))
  if (delen.length === 0) return 'niets'
  if (delen.length === 1) return delen[0]
  return `${delen.slice(0, -1).join(', ')} en ${delen[delen.length - 1]}`
}

export function beoordeelReset(input: {
  /** Draagt een echte aantekenrol (federatie, aantekenaar, SR van dienst, clubstaf). */
  magRechtzetten: boolean
  /** Mag deze wedstrijd bedienen — ook wanneer dat enkel via de open livescore is. */
  magAantekenen: boolean
  isFederatie: boolean
  impact: ResetImpact
}): ResetOordeel {
  const { magRechtzetten, magAantekenen, isFederatie, impact } = input

  // De federatie kan altijd rechtzetten; dat is het laatste vangnet.
  if (isFederatie) return { ok: true }

  // Niets ingevoerd: dan vernietigt terugzetten niets, en volstaat het recht om aan te tekenen.
  if (impact.leeg) {
    if (magAantekenen || magRechtzetten) return { ok: true }
    return { ok: false, reden: 'Je hebt geen rechten om deze wedstrijd terug te zetten.' }
  }

  // Er staat iets in. Vanaf hier telt enkel nog de federatie — ook een aantekenaar of clubstaf
  // mag een aangetekende wedstrijd niet zomaar leegmaken.
  const wat = beschrijfImpact(impact)
  if (magRechtzetten) {
    return {
      ok: false,
      reden:
        `Er staat al ${wat} ingevoerd, dus terugzetten zou dat wissen. ` +
        `Vanaf hier kan enkel de federatie de wedstrijd nog leegmaken — vraag het aan hen.`,
    }
  }
  if (magAantekenen) {
    return {
      ok: false,
      reden:
        `Je tekent deze wedstrijd aan via de open livescore, en dat is niet hetzelfde als de ` +
        `aantekenaar van dienst zijn. Zolang er nog niets ingevoerd stond mocht je zelf ` +
        `terugzetten, maar er staat intussen ${wat}. Vraag de scheidsrechter van dienst, iemand ` +
        `van de clubstaf of de federatie om het recht te zetten.`,
    }
  }
  return { ok: false, reden: 'Je hebt geen rechten om deze wedstrijd terug te zetten.' }
}
