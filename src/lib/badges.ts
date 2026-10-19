// ── Supporter-achievements / badges ──────────────────────────────────────────────────────────
// Berekent welke badges een supporter verdiende uit eenvoudige signalen: aanwezigheid (check-ins),
// tribunefoto's, pronostiek (deelnames + punten), 'held van de match'-stemmen, de fanscore, een
// volledig profiel en een bonusrad-winst. Pure functie → los testbaar; de UI haalt de stats op.
//
// 2026-10-19: "het is te makkelijk om alles te behalen". Elke reeks kreeg zware toptrappen erbij,
// er kwamen badges die echte inzet vragen (uitwedstrijden, verschillende terreinen, weekends op
// rij, exacte voorspellingen, het pronostiekpodium), elke badge kreeg een zeldzaamheid (brons →
// legende), en de Erelijst beloont wie álles verzamelt.

export interface BadgeStats {
  checkins: number
  photos: number
  /** Aantal pronostiek-deelnames (wedstrijden waarop je een uitslag voorspelde). */
  predictions: number
  /** Verzamelde pronostiekpunten dit seizoen. */
  predictionPoints: number
  /** Uitgebrachte 'held van de match'-stemmen. */
  mvpVotes: number
  /** Seizoens-fanscore (aanwezigheid + pronostiekpunten). */
  fanScore: number
  profileComplete: boolean
  boosterWon: boolean
  /** Wedstrijden die je zelf aantekende en die bevestigd werden (zie score-trust.ts). */
  scoredMatches: number
  /** Trust-niveau 'vertrouwd' bereikt: je invoer gaat meteen als bevestigd door. */
  trustedScorer: boolean
  /** Bijgewoonde uitwedstrijden van je eigen club (zie aanwezigheidStats). */
  awayCheckins?: number
  /** Verschillende terreinen (thuisclubs) waar je een wedstrijd bijwoonde. */
  grounds?: number
  /** Langste reeks opeenvolgende weken met minstens één bijgewoonde wedstrijd. */
  weekStreak?: number
  /** Exact juist voorspelde eindstanden dit seizoen. */
  exactPredictions?: number
  /** Je plaats in het pronostiekklassement van dit seizoen (1 = eerste), of null. */
  predictionRank?: number | null
}

/** Hoe zeldzaam een badge is — zichtbaar op de kaart, zodat je ziet wat écht iets voorstelt. */
export type Rarity = 'brons' | 'zilver' | 'goud' | 'legende'

export interface Badge {
  key: string
  emoji: string
  title: string
  desc: string
  earned: boolean
  /** Categorie voor de groepering in de UI. */
  group: string
  rarity: Rarity
  /** Voortgang naar de drempel (enkel bij telbare badges). */
  progress?: { have: number; need: number }
}

const tier = (group: string, rarity: Rarity, key: string, emoji: string, title: string, desc: string, have: number, need: number): Badge => ({
  key,
  emoji,
  title,
  desc,
  group,
  rarity,
  earned: have >= need,
  progress: { have: Math.min(Math.max(0, have), need), need },
})

const flag = (group: string, rarity: Rarity, key: string, emoji: string, title: string, desc: string, earned: boolean): Badge => ({
  key,
  emoji,
  title,
  desc,
  group,
  rarity,
  earned,
})

/** De groep met badges over badges — telt zelf niet mee om de Erelijst te halen. */
export const ERELIJST = 'Erelijst'

/** Alle badges met hun verdiend/vergrendeld-status, op basis van de supporter-stats. */
export function computeBadges(stats: BadgeStats): Badge[] {
  const away = stats.awayCheckins ?? 0
  const grounds = stats.grounds ?? 0
  const streak = stats.weekStreak ?? 0
  const exact = stats.exactPredictions ?? 0
  const rank = stats.predictionRank ?? null

  const gewoon: Badge[] = [
    flag('Start', 'brons', 'welcome', '🟢', 'Welkom in de tribune', 'Je hebt een account — welkom!', true),

    // Aanwezigheid ("ik ben erbij").
    tier('Aanwezigheid', 'brons', 'checkin1', '🎟️', 'Eerste keer erbij', 'Woon 1 wedstrijd bij', stats.checkins, 1),
    tier('Aanwezigheid', 'brons', 'checkin5', '🔥', 'Trouwe supporter', 'Woon 5 wedstrijden bij', stats.checkins, 5),
    tier('Aanwezigheid', 'zilver', 'checkin15', '🏟️', 'Vaste klant', 'Woon 15 wedstrijden bij', stats.checkins, 15),
    tier('Aanwezigheid', 'zilver', 'checkin30', '👑', 'Seizoenskaart', 'Woon 30 wedstrijden bij', stats.checkins, 30),
    tier('Aanwezigheid', 'goud', 'checkin50', '🦁', 'Clublegende', 'Woon 50 wedstrijden bij', stats.checkins, 50),
    tier('Aanwezigheid', 'legende', 'checkin100', '🗿', 'Monument van de tribune', 'Woon 100 wedstrijden bij', stats.checkins, 100),

    // Op verplaatsing: echte supporters rijden mee.
    tier('Op verplaatsing', 'zilver', 'away3', '🚌', 'Meegereisd', 'Woon 3 uitwedstrijden van je club bij', away, 3),
    tier('Op verplaatsing', 'goud', 'away10', '🧳', 'Uitsupporter', 'Woon 10 uitwedstrijden van je club bij', away, 10),
    tier('Op verplaatsing', 'legende', 'away25', '🛣️', 'Altijd op de baan', 'Woon 25 uitwedstrijden van je club bij', away, 25),
    tier('Op verplaatsing', 'zilver', 'grounds5', '🗺️', 'Terreinverkenner', 'Bezoek wedstrijden op 5 verschillende terreinen', grounds, 5),
    tier('Op verplaatsing', 'goud', 'grounds10', '🧭', 'Krachtbaltoerist', 'Bezoek wedstrijden op 10 verschillende terreinen', grounds, 10),
    tier('Op verplaatsing', 'legende', 'grounds20', '🌍', 'Alle velden gezien', 'Bezoek wedstrijden op 20 verschillende terreinen', grounds, 20),

    // Trouw: weken op rij.
    tier('Trouw', 'zilver', 'streak4', '📆', 'Vier op een rij', 'Woon 4 weken na elkaar een wedstrijd bij', streak, 4),
    tier('Trouw', 'goud', 'streak8', '⛓️', 'Niet weg te slaan', 'Woon 8 weken na elkaar een wedstrijd bij', streak, 8),
    tier('Trouw', 'legende', 'streak15', '🧱', 'IJzeren supporter', 'Woon 15 weken na elkaar een wedstrijd bij', streak, 15),

    // Foto-tribune.
    tier('Foto-tribune', 'brons', 'photo1', '📷', 'Eerste sfeerbeeld', 'Plaats 1 foto in de tribune', stats.photos, 1),
    tier('Foto-tribune', 'zilver', 'photo10', '📸', 'Clubfotograaf', 'Plaats 10 foto’s', stats.photos, 10),
    tier('Foto-tribune', 'goud', 'photo25', '🖼️', 'Tribune-artiest', 'Plaats 25 foto’s', stats.photos, 25),
    tier('Foto-tribune', 'legende', 'photo75', '🎞️', 'Huisfotograaf', 'Plaats 75 foto’s', stats.photos, 75),

    // Pronostiek: meedoen, maar vooral juist zitten.
    tier('Pronostiek', 'brons', 'pred1', '🔮', 'Eerste voorspelling', 'Voorspel 1 uitslag', stats.predictions, 1),
    tier('Pronostiek', 'brons', 'pred10', '🎯', 'Vaste voorspeller', 'Voorspel 10 uitslagen', stats.predictions, 10),
    tier('Pronostiek', 'zilver', 'pred25', '🧙', 'Orakel', 'Voorspel 25 uitslagen', stats.predictions, 25),
    tier('Pronostiek', 'goud', 'pred75', '📜', 'Profeet', 'Voorspel 75 uitslagen', stats.predictions, 75),
    tier('Pronostiek', 'zilver', 'predpoints100', '💎', 'Pronostiek-kanon', 'Verzamel 100 pronostiekpunten', stats.predictionPoints, 100),
    tier('Pronostiek', 'goud', 'predpoints300', '💰', 'Puntenmachine', 'Verzamel 300 pronostiekpunten', stats.predictionPoints, 300),
    tier('Pronostiek', 'legende', 'predpoints600', '🏦', 'Pronostiekbank', 'Verzamel 600 pronostiekpunten', stats.predictionPoints, 600),
    tier('Pronostiek', 'zilver', 'exact1', '🎯', 'Voltreffer', 'Voorspel 1 eindstand exact juist', exact, 1),
    tier('Pronostiek', 'goud', 'exact5', '🏹', 'Scherpschutter', 'Voorspel 5 eindstanden exact juist', exact, 5),
    tier('Pronostiek', 'legende', 'exact15', '🔭', 'Helderziende', 'Voorspel 15 eindstanden exact juist', exact, 15),
    flag('Pronostiek', 'goud', 'podium', '🥉', 'Op het podium', 'Sta in de top 3 van het pronostiekklassement', rank != null && rank <= 3),
    flag('Pronostiek', 'legende', 'koning', '🥇', 'Pronostiekkoning', 'Sta eerste in het pronostiekklassement', rank === 1),

    // Held van de match (stemmen uitbrengen).
    tier('Held van de match', 'brons', 'mvp1', '🗳️', 'Jurylid', 'Stem 1 keer voor de held van de match', stats.mvpVotes, 1),
    tier('Held van de match', 'zilver', 'mvp10', '⚖️', 'Vaste jury', 'Stem 10 keer voor de held van de match', stats.mvpVotes, 10),
    tier('Held van de match', 'goud', 'mvp30', '🏛️', 'Hoofdjury', 'Stem 30 keer voor de held van de match', stats.mvpVotes, 30),

    // Fanscore (gecombineerde betrokkenheid).
    tier('Superfan', 'zilver', 'superfan', '📣', 'Superfan', 'Bereik een fanscore van 200', stats.fanScore, 200),
    tier('Superfan', 'goud', 'megafan', '🌟', 'Megafan', 'Bereik een fanscore van 500', stats.fanScore, 500),
    tier('Superfan', 'legende', 'ultrafan', '☄️', 'Ultra', 'Bereik een fanscore van 1000', stats.fanScore, 1000),

    // Aantekenen: badges belonen hier bewust NIEUW gedrag (zelf de score doorgeven), niet het
    // kijken zelf — dat vinden supporters al leuk uit zichzelf.
    tier('Aantekenen', 'brons', 'score1', '✏️', 'Eerste keer aangetekend', 'Teken 1 wedstrijd aan die bevestigd wordt', stats.scoredMatches, 1),
    tier('Aantekenen', 'zilver', 'score5', '📝', 'Vaste aantekenaar', 'Teken 5 bevestigde wedstrijden aan', stats.scoredMatches, 5),
    tier('Aantekenen', 'goud', 'score20', '🗂️', 'Wedstrijdsecretaris', 'Teken 20 bevestigde wedstrijden aan', stats.scoredMatches, 20),
    tier('Aantekenen', 'legende', 'score50', '🏅', 'Gouden potlood', 'Teken 50 bevestigde wedstrijden aan', stats.scoredMatches, 50),
    flag('Aantekenen', 'goud', 'trusted', '🛡️', 'Vertrouwde aantekenaar', 'Jouw scores gaan meteen als bevestigd door', stats.trustedScorer),

    // Profiel & bonusrad.
    flag('Profiel', 'brons', 'profile', '🧑', 'Profiel compleet', 'Foto, club én positie ingevuld', stats.profileComplete),
    flag('Profiel', 'zilver', 'booster', '🎡', 'Bonusrad-winnaar', 'Win een bonusrad-booster', stats.boosterWon),
  ]

  // ── Erelijst: badges over badges ──
  const groepen = [...new Set(gewoon.map((b) => b.group))].filter((g) => g !== 'Start')
  const groepenMetBadge = groepen.filter((g) => gewoon.some((b) => b.group === g && b.earned)).length
  const groepenMetGoud = groepen.filter((g) => gewoon.some((b) => b.group === g && b.earned && (b.rarity === 'goud' || b.rarity === 'legende'))).length
  const verdiend = gewoon.filter((b) => b.earned).length
  const legendes = gewoon.filter((b) => b.earned && b.rarity === 'legende').length
  return [
    ...gewoon,
    tier(ERELIJST, 'zilver', 'allrounder', '🎖️', 'Allrounder', `Verdien een badge in elk van de ${groepen.length} categorieën`, groepenMetBadge, groepen.length),
    tier(ERELIJST, 'goud', 'verzamelaar', '🗃️', 'Verzamelaar', 'Verdien 30 badges', verdiend, 30),
    tier(ERELIJST, 'goud', 'goudenhand', '🥇', 'Gouden hand', 'Verdien een gouden (of legendarische) badge in 6 categorieën', groepenMetGoud, 6),
    tier(ERELIJST, 'legende', 'legende3', '🐉', 'Levende legende', 'Verdien 3 legendarische badges', legendes, 3),
    tier(ERELIJST, 'legende', 'halloffame', '🏆', 'Hall of Fame', 'Verdien álle andere badges', verdiend, gewoon.length),
  ]
}

export function earnedCount(badges: Badge[]): number {
  return badges.filter((b) => b.earned).length
}

/** Maandag (UTC-datum) van de week waarin een tijdstip valt, als sleutel "YYYY-MM-DD". */
function weekSleutel(iso: string): string | null {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  const d = new Date(t)
  const dag = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - dag)
  return d.toISOString().slice(0, 10)
}

/**
 * De aanwezigheidsbadges die meer vragen dan tellen: uitwedstrijden van je eigen club, het aantal
 * verschillende terreinen (thuisclubs) en de langste reeks opeenvolgende weken met een bijgewoonde
 * wedstrijd. `matches` zijn de wedstrijden waarop je incheckte, met hun datum en de club van beide
 * ploegen.
 */
export function aanwezigheidStats(
  matches: { date: string; homeClubId: number | null; awayClubId: number | null }[],
  eigenClubId: number | null,
): { awayCheckins: number; grounds: number; weekStreak: number } {
  const awayCheckins = eigenClubId == null ? 0 : matches.filter((m) => m.awayClubId === eigenClubId && m.homeClubId !== eigenClubId).length
  const grounds = new Set(matches.map((m) => m.homeClubId).filter((c): c is number => c != null)).size
  const weken = [...new Set(matches.map((m) => weekSleutel(m.date)).filter((w): w is string => w != null))].sort()
  let weekStreak = 0
  let reeks = 0
  let vorige: number | null = null
  for (const w of weken) {
    const t = Date.parse(`${w}T00:00:00Z`)
    reeks = vorige != null && t - vorige === 7 * 86_400_000 ? reeks + 1 : 1
    weekStreak = Math.max(weekStreak, reeks)
    vorige = t
  }
  return { awayCheckins, grounds, weekStreak }
}
