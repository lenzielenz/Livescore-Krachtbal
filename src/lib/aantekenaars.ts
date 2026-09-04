// Wie tekende deze wedstrijd aan?
//
// Bij een afgelopen wedstrijd hoort te staan wie de cijfers invoerde — voor de supporter die zich
// afvraagt waar een stand vandaan komt, en voor de federatie die een betwiste uitslag moet kunnen
// natrekken. Dit is een AUDITFEIT, geen afgeleide staat: uit de doelpunten valt niet te herleiden
// wie ze intikte, dus wordt het bij elke actie geboekt (zie CLAUDE.md over event-sourcing).
//
// Puur en zonder DB, zoals score-trust.ts: de opslag zit in de tornooi-actieroute, de weergave in
// het tornooibord. Naast de gebruikers-id bewaren we een MOMENTOPNAME van de naam — `users.read`
// is federatie-only, dus een publieke pagina kan de naam later niet meer ophalen. Zelfde patroon
// als MatchInstants.authorName en MatchTrust.scorerName.

/** Eén persoon die aan deze wedstrijd meetekende. */
export interface Aantekenaar {
  id: number
  /** Naam zoals ze bij deze actie op het account stond. Nooit een e-mailadres — zie veiligeNaam. */
  naam: string
  /**
   * Met welke pet: de organisatie (federatie, scheidsrechter, of wie aantekenrechten kreeg) of een
   * supporter die in supporters-modus meetelde. Dat verschil bepaalt hoe zwaar de stand weegt.
   */
  rol: AantekenaarRol
  /** Eerste en laatste actie (ms sinds epoch) — samen zeggen ze hoe lang iemand aan tafel zat. */
  eerste: number
  laatste: number
  /** Aantal geboekte acties. Enkel indicatief: een undo telt óók als actie. */
  acties: number
}

export type AantekenaarRol = 'organisatie' | 'supporter'

/** Wie de wedstrijd afsloot — dat is de handtekening onder de eindstand. */
export interface Afsluiter {
  id: number
  naam: string
  /** Moment van afsluiten (ms sinds epoch). Een tornooiwedstrijd heeft geen eigen finishedAt. */
  op: number
}

/**
 * Terugval wanneer een account geen naam draagt (`users.name` is niet verplicht).
 *
 * Uitdrukkelijk NIET het e-mailadres: dit veld is publiek leesbaar, en het privacybeleid van het
 * platform zegt dat uitslagen en namen publiek zijn maar e-mailadressen niet.
 */
export const NAAMLOOS = 'Aantekenaar'

/** Langer dan dit knippen we een naam af — een publiek veld is geen vrije invoerruimte. */
export const MAX_NAAM = 80

/** Meer dan dit bewaren we niet: aan één wedstrijd zitten nooit tientallen mensen. */
export const MAX_AANTEKENAARS = 20

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Maak van wat er op het account staat een naam die publiek getoond mag worden.
 *
 * Een leeg veld, een niet-string of iets dat op een e-mailadres lijkt valt terug op NAAMLOOS.
 * Die @-controle is geen overdreven voorzichtigheid: verschillende schrijfpaden in dit project
 * vullen een publiek naamveld met `user.name ?? user.email`, en zo belandt een adres alsnog in
 * beeld. Hier stopt dat.
 */
export function veiligeNaam(ruw: unknown): string {
  if (typeof ruw !== 'string') return NAAMLOOS
  const naam = ruw.trim()
  if (!naam || naam.includes('@')) return NAAMLOOS
  return naam.length > MAX_NAAM ? `${naam.slice(0, MAX_NAAM - 1).trimEnd()}…` : naam
}

const isRol = (v: unknown): v is AantekenaarRol => v === 'organisatie' || v === 'supporter'

/** Lees de json-kolom veilig uit: alles wat niet klopt valt weg, de rest blijft bruikbaar. */
export function sanitizeAantekenaars(raw: unknown): Aantekenaar[] {
  if (!Array.isArray(raw)) return []
  const gezien = new Set<number>()
  const uit: Aantekenaar[] = []
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue
    const id = num((e as { id?: unknown }).id)
    if (!Number.isFinite(id) || id <= 0 || gezien.has(id)) continue
    gezien.add(id)
    const eerste = num((e as { eerste?: unknown }).eerste)
    const laatste = num((e as { laatste?: unknown }).laatste)
    uit.push({
      id,
      naam: veiligeNaam((e as { naam?: unknown }).naam),
      rol: isRol((e as { rol?: unknown }).rol) ? ((e as { rol: AantekenaarRol }).rol) : 'organisatie',
      eerste,
      // Een omgekeerde volgorde is onmogelijk; komt ze toch binnen, dan trekken we ze recht.
      laatste: Math.max(eerste, laatste),
      acties: Math.max(0, Math.floor(num((e as { acties?: unknown }).acties))),
    })
  }
  return uit.slice(0, MAX_AANTEKENAARS)
}

export function sanitizeAfsluiter(raw: unknown): Afsluiter | null {
  if (!raw || typeof raw !== 'object') return null
  const id = num((raw as { id?: unknown }).id)
  if (!Number.isFinite(id) || id <= 0) return null
  return { id, naam: veiligeNaam((raw as { naam?: unknown }).naam), op: num((raw as { op?: unknown }).op) }
}

/**
 * Boek één actie op de lijst.
 *
 * Wie er al op staat, krijgt zijn teller en zijn 'laatste' bijgewerkt — en ook zijn naam, want een
 * account dat intussen hernoemd werd hoort onder de nieuwe naam te verschijnen. Wie nieuw is, komt
 * erbij zolang er plaats is; is de lijst vol, dan blijft ze zoals ze is (de eerste twintig zeggen
 * al lang genoeg wie aan tafel zat).
 */
export function boekAantekenaar(
  lijst: Aantekenaar[],
  wie: { id: number; naam: unknown; rol: AantekenaarRol },
  nu: number,
): Aantekenaar[] {
  if (!Number.isFinite(wie.id) || wie.id <= 0) return lijst
  const naam = veiligeNaam(wie.naam)
  const bestaand = lijst.find((a) => a.id === wie.id)
  if (bestaand) {
    return lijst.map((a) =>
      a.id === wie.id
        ? { ...a, naam, rol: wie.rol, laatste: Math.max(a.laatste, nu), acties: a.acties + 1 }
        : a,
    )
  }
  if (lijst.length >= MAX_AANTEKENAARS) return lijst
  return [...lijst, { id: wie.id, naam, rol: wie.rol, eerste: nu, laatste: nu, acties: 1 }]
}

/**
 * Wie is DÉ aantekenaar van deze wedstrijd? Wie de meeste acties boekte; bij gelijk aantal wie er
 * het eerst aan begon. Zo wint niet degene die toevallig als laatste op een knop duwde.
 */
export function hoofdAantekenaar(lijst: Aantekenaar[]): Aantekenaar | null {
  let beste: Aantekenaar | null = null
  for (const a of lijst) {
    if (!beste || a.acties > beste.acties || (a.acties === beste.acties && a.eerste < beste.eerste)) {
      beste = a
    }
  }
  return beste
}

/**
 * De regel die onder een wedstrijd komt te staan.
 *
 * Eén persoon: "Aangetekend door Jan Peeters". Twee: "… en Rita Claes". Meer: "… en 3 anderen".
 * Sloot iemand anders de wedstrijd af, dan komt dat erachter — dat is een tweede naam die telt,
 * want het eindsignaal legt de uitslag vast en schuift de winnaar door in het schema.
 */
export function aantekenaarTekst(lijst: Aantekenaar[], afsluiter: Afsluiter | null = null): string | null {
  const hoofd = hoofdAantekenaar(lijst)
  if (!hoofd) return null
  const rest = lijst.filter((a) => a.id !== hoofd.id)
  let tekst = `Aangetekend door ${hoofd.naam}`
  if (rest.length === 1) tekst += ` en ${rest[0].naam}`
  else if (rest.length > 1) tekst += ` en ${rest.length} anderen`
  if (afsluiter && afsluiter.id !== hoofd.id) tekst += ` · afgesloten door ${afsluiter.naam}`
  return tekst
}
