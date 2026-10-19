// ── Vertrouwenslaag op supporters-scores ─────────────────────────────────────────────────────
// In supporters-modus mag élke ingelogde supporter de score doorgeven (zie score-mode.ts). Dat
// maakt de livescore levendig, maar zonder waarborg weet een kijker niet of een stand klopt.
// Deze module bevat de PURE regels van het bewezen patroon (SofaScore/Waze/GameChanger):
//
//   1. Eén official scorer per wedstrijd. Wie de wedstrijd claimt, tekent aan; anderen kunnen
//      dan enkel nog bevestigen of betwisten. Een claim vervalt bij lange inactiviteit, zodat een
//      platte batterij een wedstrijd nooit blokkeert.
//   2. Consensus. Andere kijkers bevestigen ("klopt") of betwisten ("klopt niet") de stand. De
//      stemmen wegen mee volgens de trust-score van wie stemt.
//   3. Een ONZICHTBARE trust-score per gebruiker: wie herhaaldelijk bevestigd wordt, krijgt meer
//      gewicht en zijn scores gaan meteen als bevestigd door de deur.
//
// Geen DB, geen Payload — enkel data in, data uit. De opslag zit in score-trust-store.ts.

/** Iemand die aan deze wedstrijd meetekende (de official scorer of, vóór de claim, een supporter). */
export interface TrustContributor {
  userId: number
  name: string
  /** Aantal doorgegeven acties (doelpunten, kruisjes, klok …). */
  ops: number
  /** Tijdstip van de laatste actie (ms). */
  at: number
}

/** Eén bevestiging of betwisting van de stand. */
export interface TrustVote {
  userId: number
  name: string
  at: number
  /** Gewicht van deze stem op het moment van stemmen (zie voteWeight). Vastgeklikt: de stem
   *  mag niet van waarde veranderen wanneer de stemmer later meer of minder vertrouwd wordt. */
  w: number
}

/** De volledige vertrouwensstaat van één wedstrijd (opgeslagen als json op de match). */
export interface MatchTrust {
  scorerId: number | null
  scorerName: string | null
  /** Trust-score van de official scorer op het moment van de claim (0..1). */
  scorerTrust: number
  claimedAt: number | null
  /** Laatste aantekenactie van de official scorer — bepaalt of de claim nog leeft. */
  lastActiveAt: number | null
  contributors: TrustContributor[]
  confirms: TrustVote[]
  disputes: TrustVote[]
  /** Wanneer het oordeel op de trust-historiek van de scorer geboekt is (eenmalig, na het venster). */
  settledAt: number | null
}

/** Hoe de stand van een wedstrijd getoond wordt. */
export type TrustLabel = 'official' | 'confirmed' | 'unconfirmed' | 'disputed'

/** Een claim vervalt na drie kwartier zonder aantekenactie — dan mag iemand anders overnemen. */
export const CLAIM_IDLE_MS = 45 * 60 * 1000

/** Gewogen bevestigingen die nodig zijn om een fan-score als bevestigd te tonen. */
export const CONFIRM_THRESHOLD = 2

/** Vanaf deze trust-score gaat je invoer meteen als bevestigd door (het "vertrouwd"-niveau). */
export const TRUSTED_SCORE = 0.7

export function emptyTrust(): MatchTrust {
  return {
    scorerId: null,
    scorerName: null,
    scorerTrust: 0,
    claimedAt: null,
    lastActiveAt: null,
    contributors: [],
    confirms: [],
    disputes: [],
    settledAt: null,
  }
}

const num = (v: unknown, fallback = 0): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' && v.trim() ? v.trim() : fallback)

function sanitizeVotes(raw: unknown): TrustVote[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<number>()
  const out: TrustVote[] = []
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue
    const userId = num((e as { userId?: unknown }).userId)
    if (!Number.isFinite(userId) || userId <= 0 || seen.has(userId)) continue
    seen.add(userId)
    out.push({
      userId,
      name: str((e as { name?: unknown }).name, 'Supporter'),
      at: num((e as { at?: unknown }).at),
      // Een gewicht buiten het geldige bereik (of geknoeide json) valt terug op een neutrale stem.
      w: Math.min(1.5, Math.max(0.5, num((e as { w?: unknown }).w, 1))),
    })
  }
  return out
}

function sanitizeContributors(raw: unknown): TrustContributor[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<number>()
  const out: TrustContributor[] = []
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue
    const userId = num((e as { userId?: unknown }).userId)
    if (!Number.isFinite(userId) || userId <= 0 || seen.has(userId)) continue
    seen.add(userId)
    out.push({
      userId,
      name: str((e as { name?: unknown }).name, 'Supporter'),
      ops: Math.max(0, Math.floor(num((e as { ops?: unknown }).ops))),
      at: num((e as { at?: unknown }).at),
    })
  }
  return out.slice(-50)
}

/** Lees de json-kolom veilig uit: alles wat niet klopt valt terug op een lege staat. */
export function sanitizeTrust(raw: unknown): MatchTrust {
  if (!raw || typeof raw !== 'object') return emptyTrust()
  const r = raw as Record<string, unknown>
  const scorerId = num(r.scorerId)
  return {
    scorerId: Number.isFinite(scorerId) && scorerId > 0 ? scorerId : null,
    scorerName: typeof r.scorerName === 'string' && r.scorerName.trim() ? r.scorerName.trim() : null,
    scorerTrust: Math.min(1, Math.max(0, num(r.scorerTrust))),
    claimedAt: num(r.claimedAt) || null,
    lastActiveAt: num(r.lastActiveAt) || null,
    contributors: sanitizeContributors(r.contributors),
    confirms: sanitizeVotes(r.confirms),
    disputes: sanitizeVotes(r.disputes),
    settledAt: num(r.settledAt) || null,
  }
}

// ── Trust-score per gebruiker ────────────────────────────────────────────────────────────────

/** Bijdragehistoriek van één gebruiker (opgeslagen als json op de user). Onzichtbaar voor hemzelf. */
export interface UserTrust {
  /** Wedstrijden die je aantekende en die bevestigd/officieel eindigden. */
  confirmed: number
  /** Wedstrijden die je aantekende en die betwist eindigden. */
  disputed: number
  /** Totaal aantal wedstrijden dat je aantekende. */
  matches: number
}

export function emptyUserTrust(): UserTrust {
  return { confirmed: 0, disputed: 0, matches: 0 }
}

export function sanitizeUserTrust(raw: unknown): UserTrust {
  if (!raw || typeof raw !== 'object') return emptyUserTrust()
  const r = raw as Record<string, unknown>
  const confirmed = Math.max(0, Math.floor(num(r.confirmed)))
  const disputed = Math.max(0, Math.floor(num(r.disputed)))
  // matches kan nooit kleiner zijn dan wat er al beoordeeld is.
  const matches = Math.max(confirmed + disputed, Math.max(0, Math.floor(num(r.matches))))
  return { confirmed, disputed, matches }
}

/**
 * Trust-score 0..1. Twee delen:
 *  - trefzekerheid: het aandeel bevestigde wedstrijden, met Laplace-smoothing zodat één ongelukkige
 *    betwisting iemand niet meteen onderuit haalt (en één toevallige bevestiging niet meteen adelt);
 *  - ervaring: wie pas begint, weegt bewust lichter — pas na ~5 wedstrijden telt de trefzekerheid vol.
 */
export function trustScore(u: UserTrust): number {
  const t = sanitizeUserTrust(u)
  const accuracy = (t.confirmed + 1) / (t.confirmed + t.disputed + 2)
  const experience = Math.min(1, t.matches / 5)
  return Math.round(accuracy * (0.5 + 0.5 * experience) * 1000) / 1000
}

export type TrustLevel = 'nieuw' | 'gekend' | 'vertrouwd'

/** Leesbaar niveau. Enkel 'vertrouwd' is zichtbaar (als bijdrager-badge); de score zelf niet. */
export function trustLevel(score: number): TrustLevel {
  if (score >= TRUSTED_SCORE) return 'vertrouwd'
  if (score >= 0.4) return 'gekend'
  return 'nieuw'
}

/** Het gewicht van je stem: een vertrouwde gebruiker weegt driemaal een gloednieuwe. */
export function voteWeight(score: number): number {
  const s = Math.min(1, Math.max(0, score))
  return Math.round((0.5 + s) * 100) / 100
}

/** Boek het resultaat van een aangetekende wedstrijd op de trust-historiek van de scorer. */
export function applyMatchOutcome(u: UserTrust, label: TrustLabel): UserTrust {
  const t = sanitizeUserTrust(u)
  if (label === 'disputed') return { ...t, disputed: t.disputed + 1, matches: t.matches + 1 }
  if (label === 'unconfirmed') return { ...t, matches: t.matches + 1 }
  return { ...t, confirmed: t.confirmed + 1, matches: t.matches + 1 }
}

// ── Claim van de official scorer ─────────────────────────────────────────────────────────────

/** Leeft de claim nog (iemand geclaimd én recent actief)? */
export function claimActive(t: MatchTrust, now: number = Date.now()): boolean {
  if (t.scorerId == null) return false
  const last = t.lastActiveAt ?? t.claimedAt ?? 0
  return now - last < CLAIM_IDLE_MS
}

/**
 * Houdt iemand de wedstrijd vast als aantekenaar? Zolang de wedstrijd LIVE is, vervalt de claim
 * niet: wie de wedstrijd startte, tekent ze ook af. Twee mensen die door elkaar scoren is erger
 * dan een stilgevallen tafel — de houder kan op een ander toestel gewoon verder (de claim hangt
 * aan de gebruiker, niet aan het toestel). Vrijgeven gebeurt enkel door "Wedstrijd was nog niet
 * bezig" (resetMatch wist de claim). Vóór de start geldt de gewone inactiviteitsregel.
 */
export function claimHeld(t: MatchTrust, live: boolean, now: number = Date.now()): boolean {
  if (t.scorerId == null) return false
  return live || claimActive(t, now)
}

/** Acties die een wedstrijd live zetten — wie die doet, wordt de aantekenaar. */
const START_ACTIES = new Set(['start', 'simplestart', 'simplegoal'])

/**
 * Wat doet de actie-route met de aantekenclaim bij deze actie?
 *  • 'blokkeer' — iemand anders tekent deze lopende wedstrijd aan;
 *  • 'claim'    — na een gelukte actie wordt deze gebruiker de aantekenaar (hij start de
 *                 wedstrijd, of tekent als eerste aan op een lopende wedstrijd zonder houder);
 *  • 'vrij'     — niets te bewaken (demo, analyse, reset, of hij is zelf de houder).
 * Admin/federatie worden nooit geblokkeerd: de noodrem voor een aantekenaar die vertrok zonder
 * terug te zetten. Ze nemen de claim dan ook niet over.
 */
export function aantekenClaim(o: {
  trust: MatchTrust
  live: boolean
  action: string
  userId: number | null
  federatie: boolean
  vrijeWedstrijd: boolean
  now?: number
}): 'blokkeer' | 'claim' | 'vrij' {
  if (o.userId == null || o.vrijeWedstrijd || o.action === 'reset') return 'vrij'
  if (!o.live && !START_ACTIES.has(o.action)) return 'vrij'
  if (o.trust.scorerId === o.userId) return 'vrij'
  if (o.live && claimHeld(o.trust, true, o.now)) return o.federatie ? 'vrij' : 'blokkeer'
  return 'claim'
}

/**
 * Mag deze gebruiker de wedstrijd (over)nemen als official scorer?
 * Vrij als niemand claimde of als de vorige claim uitgeteld is; de houder zelf mag altijd. Een
 * claim op een lopende wedstrijd telt nooit uit (zie claimHeld).
 */
export function mayClaim(t: MatchTrust, userId: number, now: number = Date.now(), live = false): boolean {
  if (t.scorerId === userId) return true
  return !claimHeld(t, live, now)
}

/** Claim de wedstrijd. Een nieuwe claim wist de stemmen: die gingen over de vórige stand. */
export function claimScorer(
  t: MatchTrust,
  user: { id: number; name: string; trust: number },
  now: number = Date.now(),
): MatchTrust {
  const same = t.scorerId === user.id
  return {
    ...t,
    scorerId: user.id,
    scorerName: user.name,
    scorerTrust: Math.min(1, Math.max(0, user.trust)),
    claimedAt: same ? (t.claimedAt ?? now) : now,
    lastActiveAt: now,
    confirms: same ? t.confirms : [],
    disputes: same ? t.disputes : [],
  }
}

/** Geef de claim terug vrij (enkel de houder). Bijdragen en stemmen blijven staan. */
export function releaseScorer(t: MatchTrust, userId: number): MatchTrust {
  if (t.scorerId !== userId) return t
  return { ...t, scorerId: null, scorerName: null, scorerTrust: 0, claimedAt: null, lastActiveAt: null }
}

/** Registreer een aantekenactie: houdt de claim levend en telt de bijdrage mee. */
export function recordContribution(
  t: MatchTrust,
  user: { id: number; name: string },
  now: number = Date.now(),
): MatchTrust {
  const contributors = t.contributors.slice()
  const i = contributors.findIndex((c) => c.userId === user.id)
  if (i >= 0) contributors[i] = { ...contributors[i], name: user.name || contributors[i].name, ops: contributors[i].ops + 1, at: now }
  else contributors.push({ userId: user.id, name: user.name, ops: 1, at: now })
  return {
    ...t,
    contributors: contributors.slice(-50),
    lastActiveAt: t.scorerId === user.id ? now : t.lastActiveAt,
  }
}

// ── Bevestigen / betwisten ───────────────────────────────────────────────────────────────────

export type VoteKind = 'confirm' | 'dispute'

/** Bevestigen/betwisten kan tijdens de wedstrijd en nog een dag erna — daarna sluit het oordeel. */
export const VOTE_WINDOW_MS = 24 * 60 * 60 * 1000

/** Staat het bevestig-/betwistvenster nog open voor deze wedstrijd? */
export function voteWindowOpen(
  status: string | null | undefined,
  finishedAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (status === 'live') return true
  if (status !== 'finished') return false
  if (!finishedAt) return false
  const t = new Date(finishedAt).getTime()
  return !Number.isNaN(t) && now - t < VOTE_WINDOW_MS
}

/** Mag deze gebruiker stemmen? Niet op je eigen aantekenwerk — dat is geen onafhankelijke controle. */
export function mayVote(t: MatchTrust, userId: number): boolean {
  if (t.scorerId === userId) return false
  return !t.contributors.some((c) => c.userId === userId)
}

/**
 * Breng een stem uit (of wissel van kant). Eén stem per persoon per wedstrijd — een tweede
 * stem van dezelfde soort trekt ze terug, zodat de knop als schakelaar werkt.
 */
export function castVote(
  t: MatchTrust,
  user: { id: number; name: string; trust: number },
  kind: VoteKind,
  now: number = Date.now(),
): MatchTrust {
  const without = (list: TrustVote[]) => list.filter((v) => v.userId !== user.id)
  const had = (list: TrustVote[]) => list.some((v) => v.userId === user.id)
  const vote: TrustVote = { userId: user.id, name: user.name, at: now, w: voteWeight(user.trust) }

  if (kind === 'confirm') {
    if (had(t.confirms)) return { ...t, confirms: without(t.confirms) }
    return { ...t, confirms: [...without(t.confirms), vote], disputes: without(t.disputes) }
  }
  if (had(t.disputes)) return { ...t, disputes: without(t.disputes) }
  return { ...t, disputes: [...without(t.disputes), vote], confirms: without(t.confirms) }
}

const weight = (votes: TrustVote[]): number => Math.round(votes.reduce((s, v) => s + v.w, 0) * 100) / 100

/** Gewogen bevestigingskracht (som van de stemgewichten). */
export const confirmWeight = weight
/** Gewogen betwistingskracht. */
export const disputeWeight = weight

/**
 * Het label waarmee de stand getoond wordt.
 *  - 'official'    🟢 aangetekend in de federatieflow (opstelling + scheidsrechter) — de officiële uitslag
 *  - 'confirmed'   🟢 fan-score, bevestigd door genoeg kijkers óf door een vertrouwde aantekenaar ingevoerd
 *  - 'unconfirmed' 🟡 fan-score, nog niet bevestigd
 *  - 'disputed'    🔴 er zijn meer betwistingen dan bevestigingen
 */
export function trustLabel(t: MatchTrust, opts: { official: boolean }): TrustLabel {
  if (opts.official) return 'official'
  const dw = disputeWeight(t.disputes)
  const cw = confirmWeight(t.confirms)
  if (dw >= 1 && dw > cw) return 'disputed'
  if (cw >= CONFIRM_THRESHOLD) return 'confirmed'
  if (t.scorerId != null && t.scorerTrust >= TRUSTED_SCORE) return 'confirmed'
  return 'unconfirmed'
}

/**
 * Moet het oordeel over deze wedstrijd nog op de trust-historiek van de scorer geboekt worden?
 * Pas ná het bevestigingsvenster: tot dan kan het label nog kantelen. Eenmalig (settledAt).
 */
export function needsSettling(
  t: MatchTrust,
  status: string | null | undefined,
  finishedAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (t.settledAt != null) return false
  if (t.scorerId == null) return false
  if (status !== 'finished') return false
  return !voteWindowOpen(status, finishedAt, now)
}

export function markSettled(t: MatchTrust, now: number = Date.now()): MatchTrust {
  return { ...t, settledAt: now }
}

/** Korte Nederlandse omschrijving per label (UI + push). */
export const TRUST_TEXT: Record<TrustLabel, { emoji: string; short: string; long: string }> = {
  official: {
    emoji: '🟢',
    short: 'Officiële uitslag',
    long: 'Aangetekend in de officiële wedstrijdflow.',
  },
  confirmed: {
    emoji: '🟢',
    short: 'Bevestigd',
    long: 'Door supporters doorgegeven en bevestigd.',
  },
  unconfirmed: {
    emoji: '🟡',
    short: 'Nog niet bevestigd',
    long: 'Door een supporter doorgegeven — nog niet bevestigd.',
  },
  disputed: {
    emoji: '🔴',
    short: 'Betwist',
    long: 'Kijkers zijn het oneens over deze stand.',
  },
}

/** Het volledige blokje dat naar de client gaat (scorebord + wedstrijdpagina). */
export interface TrustView {
  label: TrustLabel
  emoji: string
  short: string
  long: string
  scorerId: number | null
  scorerName: string | null
  /** Leeft de claim nog? Zo niet, dan mag iemand anders overnemen. */
  claimActive: boolean
  confirms: number
  disputes: number
}

export function trustView(t: MatchTrust, opts: { official: boolean; now?: number; live?: boolean }): TrustView {
  const now = opts.now ?? Date.now()
  const label = trustLabel(t, { official: opts.official })
  const text = TRUST_TEXT[label]
  return {
    label,
    emoji: text.emoji,
    short: text.short,
    long: text.long,
    scorerId: t.scorerId,
    scorerName: t.scorerName,
    claimActive: claimHeld(t, opts.live ?? false, now),
    confirms: t.confirms.length,
    disputes: t.disputes.length,
  }
}
