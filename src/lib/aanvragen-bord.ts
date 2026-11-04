// Het bord met aanvragen en taken van de federatie (/federatie/aanvragen): de pure kant. Welke
// kolom een aanvraag krijgt, welke knoppen erbij horen, sorteren en filteren — zonder React of DB,
// zodat het getest is. De gegevens komen uit lib/federatie-aanvragen.ts (server).
//
// Kernregel: of een aanvraag AFGEHANDELD is, komt uit de aanvraag zelf (haar status in haar eigen
// collection), nooit uit het dossier. Het dossier (lib/dossiers.ts) zegt enkel wie ermee bezig is,
// op wie we wachten en tegen wanneer. Zo bestaat er maar één bron van waarheid per aanvraag.

export type Bron = 'verplaatsing' | 'registratie' | 'klacht' | 'boete' | 'ongeval' | 'kaart' | 'afgelasting' | 'inschrijving' | 'taak'
export type WachtOp = 'club' | 'scheidsrechter' | 'speler' | 'extern'
export type Kolom = 'nieuw' | 'bezig' | 'wacht' | 'klaar'

export type Actie = {
  id: string
  label: string
  stijl: 'primair' | 'gewoon' | 'gevaar'
  /** Vraagt het bord een toelichting vóór het uitvoeren? Bij 'verplicht' kan het niet zonder. */
  toelichting?: 'optioneel' | 'verplicht'
  /** Geen actie op het bord zelf, maar een sprong naar het werkscherm (bv. een datum kiezen). */
  href?: string
}

export type Notitie = { door: string; op: string; tekst: string }

export type Dossier = {
  id: number
  behandelaar: { id: number; naam: string } | null
  wachtOp: WachtOp | null
  wachtOpTekst: string | null
  deadline: string | null
  notities: Notitie[]
  afgerondOp: string | null
}

export type Aanvraag = {
  /** `${bron}:${bronId}` — de sleutel waarmee het bord en de API over dezelfde aanvraag praten. */
  sleutel: string
  bron: Bron
  bronId: number
  titel: string
  detail: string
  club: string | null
  /** Sinds wanneer ligt dit bij de federatie (ISO). */
  sinds: string
  /** Leesbare status van de aanvraag zelf. */
  status: string
  /** De statuscode van de aanvraag zelf (bepaalt de knoppen). */
  statusCode: string
  open: boolean
  /** Wanneer ze afgehandeld werd (ISO), voor de kolom "Afgehandeld". */
  afgeslotenOp: string | null
  /** Wachten we volgens de aanvraag zelf al op iemand (bv. de tegenpartij)? Dan hoeft niemand dat aan te duiden. */
  wachtOpAuto: WachtOp | null
  href: string
  dossier: Dossier | null
}

export const BRON_META: Record<Bron, { label: string; icoon: string; meervoud: string }> = {
  verplaatsing: { label: 'Verplaatsing', icoon: '🔁', meervoud: 'Verplaatsingen' },
  registratie: { label: 'Registratie', icoon: '🩺', meervoud: 'Registraties' },
  klacht: { label: 'Klacht', icoon: '⚖️', meervoud: 'Klachten' },
  boete: { label: 'Boete', icoon: '💶', meervoud: 'Boetes' },
  ongeval: { label: 'Ongeval', icoon: '🚑', meervoud: 'Ongevallen' },
  kaart: { label: 'Medische kaart', icoon: '🪪', meervoud: 'Medische kaarten' },
  afgelasting: { label: 'Afgelasting', icoon: '⛈️', meervoud: 'Afgelastingen' },
  inschrijving: { label: 'Inschrijving', icoon: '📝', meervoud: 'Inschrijvingen' },
  taak: { label: 'Taak', icoon: '📌', meervoud: 'Taken' },
}

export const WACHT_OP_LABEL: Record<WachtOp, string> = {
  club: 'de club',
  scheidsrechter: 'de scheidsrechter',
  speler: 'de speler of ouder',
  extern: 'iemand extern',
}

export const KOLOMMEN: { key: Kolom; titel: string; uitleg: string }[] = [
  { key: 'nieuw', titel: 'Nieuw', uitleg: 'Binnengekomen, nog niemand mee bezig' },
  { key: 'bezig', titel: 'In behandeling', uitleg: 'Iemand van de federatie werkt eraan' },
  { key: 'wacht', titel: 'Wacht op anderen', uitleg: 'De bal ligt bij een club, speler of extern' },
  { key: 'klaar', titel: 'Afgehandeld', uitleg: 'De laatste 14 dagen' },
]

export const sleutelVan = (bron: Bron, id: number) => `${bron}:${id}`

const BRONNEN = new Set<string>(Object.keys(BRON_META))

/** `verplaatsing:12` → { bron, id }; iets anders → null. */
export function ontleedSleutel(s: string): { bron: Bron; id: number } | null {
  const [bron, idTekst] = String(s ?? '').split(':')
  const id = Number(idTekst)
  if (!bron || !BRONNEN.has(bron) || !Number.isInteger(id) || id <= 0) return null
  return { bron: bron as Bron, id }
}

/** In welke kolom staat deze aanvraag? Afgehandeld wint altijd; dan wachten; dan wie ermee bezig is. */
export function kolomVan(a: Aanvraag): Kolom {
  if (!a.open) return 'klaar'
  if (a.dossier?.wachtOp || a.wachtOpAuto) return 'wacht'
  if (a.dossier?.behandelaar) return 'bezig'
  return 'nieuw'
}

/** Op wie wachten we: wat iemand aanduidde, anders wat de aanvraag zelf zegt. */
export function wachtOpVan(a: Aanvraag): WachtOp | null {
  return a.dossier?.wachtOp ?? a.wachtOpAuto
}

/** Welke knoppen horen bij deze aanvraag, gegeven de status van de aanvraag zelf. Enkel open aanvragen. */
export function actiesVoor(a: Pick<Aanvraag, 'bron' | 'statusCode' | 'open' | 'bronId'>): Actie[] {
  if (!a.open) return []
  switch (a.bron) {
    case 'verplaatsing':
      return a.statusCode === 'wacht_federatie'
        ? [
            { id: 'goedkeuren', label: 'Goedkeuren', stijl: 'primair', toelichting: 'optioneel' },
            { id: 'afwijzen', label: 'Afwijzen', stijl: 'gevaar', toelichting: 'optioneel' },
          ]
        : []
    case 'registratie':
      return [
        { id: 'goedkeuren', label: 'Goedkeuren', stijl: 'primair' },
        { id: 'afkeuren', label: 'Afkeuren', stijl: 'gevaar', toelichting: 'verplicht' },
      ]
    case 'klacht':
      return [
        { id: 'heropenen', label: 'Blad heropenen', stijl: 'primair', toelichting: 'optioneel' },
        { id: 'afwijzen', label: 'Afwijzen', stijl: 'gevaar', toelichting: 'verplicht' },
      ]
    case 'boete':
      if (a.statusCode === 'voorstel')
        return [
          { id: 'opleggen', label: 'Opleggen', stijl: 'primair', toelichting: 'optioneel' },
          { id: 'vernietigen', label: 'Schrappen', stijl: 'gevaar', toelichting: 'optioneel' },
        ]
      if (a.statusCode === 'betaling_gemeld') return [{ id: 'betaald', label: 'Betaling bevestigen', stijl: 'primair' }]
      if (a.statusCode === 'betwist')
        return [
          { id: 'handhaven', label: 'Handhaven', stijl: 'primair', toelichting: 'optioneel' },
          { id: 'vernietigen', label: 'Vernietigen', stijl: 'gevaar', toelichting: 'optioneel' },
        ]
      return []
    case 'ongeval':
      return a.statusCode === 'ingediend'
        ? [
            { id: 'afhandelen', label: 'Afhandelen', stijl: 'primair', toelichting: 'optioneel' },
            { id: 'terugsturen', label: 'Terugsturen', stijl: 'gewoon', toelichting: 'verplicht' },
          ]
        : []
    case 'kaart':
      return [
        { id: 'verstuurd', label: 'Verstuurd', stijl: 'primair' },
        { id: 'geweigerd', label: 'Weigeren', stijl: 'gevaar', toelichting: 'optioneel' },
      ]
    case 'afgelasting':
      return [
        { id: 'herplannen', label: 'Nieuwe datum', stijl: 'primair', href: '/beheer/afgelastingen' },
        { id: 'intrekken', label: 'Intrekken', stijl: 'gevaar' },
      ]
    case 'inschrijving':
      return [{ id: 'verwerken', label: 'Verwerken', stijl: 'primair' }]
    case 'taak':
      return [{ id: 'afronden', label: 'Afronden', stijl: 'primair' }]
  }
}

export type Filter = {
  bron?: Bron | null
  /** Enkel wat aan deze gebruiker toegewezen is. */
  mijnId?: number | null
  zoek?: string
}

const plat = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

export function filterAanvragen(lijst: Aanvraag[], f: Filter): Aanvraag[] {
  const woorden = plat(f.zoek ?? '').split(/\s+/).filter(Boolean)
  return lijst.filter((a) => {
    if (f.bron && a.bron !== f.bron) return false
    if (f.mijnId != null && a.dossier?.behandelaar?.id !== f.mijnId) return false
    if (woorden.length) {
      const hooi = plat([a.titel, a.detail, a.club ?? '', a.status, BRON_META[a.bron].label, a.dossier?.behandelaar?.naam ?? ''].join(' '))
      if (!woorden.every((w) => hooi.includes(w))) return false
    }
    return true
  })
}

const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN)

/** Open kolommen: dringendste eerst — deadline verstreken, dan dichtste deadline, dan wie het langst wacht.
 *  Afgehandeld: laatst afgehandeld eerst. */
export function sorteerKolom(lijst: Aanvraag[], kolom: Kolom, nu: number = Date.now()): Aanvraag[] {
  if (kolom === 'klaar') return [...lijst].sort((a, b) => (ms(b.afgeslotenOp) || 0) - (ms(a.afgeslotenOp) || 0))
  const rang = (a: Aanvraag) => {
    const d = ms(a.dossier?.deadline)
    if (Number.isFinite(d) && d < nu) return 0 // te laat
    return 1
  }
  return [...lijst].sort((a, b) => {
    const r = rang(a) - rang(b)
    if (r) return r
    const da = ms(a.dossier?.deadline)
    const db = ms(b.dossier?.deadline)
    if (Number.isFinite(da) || Number.isFinite(db)) {
      if (!Number.isFinite(da)) return 1
      if (!Number.isFinite(db)) return -1
      if (da !== db) return da - db
    }
    return ms(a.sinds) - ms(b.sinds)
  })
}

/** Hoe lang al / tegen wanneer, kort: "3 d", "vandaag", "2 u". */
export function ouderdom(iso: string, nu: number = Date.now()): string {
  const d = nu - new Date(iso).getTime()
  if (!Number.isFinite(d)) return ''
  const uren = Math.floor(d / 3_600_000)
  if (uren < 1) return 'net'
  if (uren < 24) return `${uren} u`
  const dagen = Math.floor(uren / 24)
  if (dagen < 14) return `${dagen} d`
  return `${Math.floor(dagen / 7)} w`
}

export type DeadlineStand = { tekst: string; toon: 'teLaat' | 'vandaag' | 'binnenkort' | 'later' }

/** De deadline in gewone taal, met een toon voor de kleur. */
export function deadlineStand(iso: string | null | undefined, nu: number = Date.now()): DeadlineStand | null {
  if (!iso) return null
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return null
  const vandaag = new Date(nu)
  const dag = (x: Date) => Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate())
  const verschil = Math.round((dag(d) - dag(vandaag)) / 86_400_000)
  if (verschil < 0) return { tekst: `${-verschil} d te laat`, toon: 'teLaat' }
  if (verschil === 0) return { tekst: 'vandaag', toon: 'vandaag' }
  if (verschil === 1) return { tekst: 'morgen', toon: 'binnenkort' }
  if (verschil <= 7) return { tekst: `over ${verschil} d`, toon: 'binnenkort' }
  return { tekst: `over ${verschil} d`, toon: 'later' }
}

/** Tellingen per kolom (voor het dashboard en de teller in de zijbalk). */
export function tellingen(lijst: Aanvraag[]): Record<Kolom, number> & { open: number } {
  const t: Record<Kolom, number> = { nieuw: 0, bezig: 0, wacht: 0, klaar: 0 }
  for (const a of lijst) t[kolomVan(a)] += 1
  return { ...t, open: t.nieuw + t.bezig + t.wacht }
}
