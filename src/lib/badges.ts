// ── Supporter-achievements / badges ──────────────────────────────────────────────────────────
// Berekent welke badges een supporter verdiende uit eenvoudige signalen: aanwezigheid (check-ins),
// tribunefoto's, pronostiek (deelnames + punten), 'held van de match'-stemmen, de fanscore, een
// volledig profiel en een bonusrad-winst. Pure functie → los testbaar; de UI haalt de stats op.

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
}

export interface Badge {
  key: string
  emoji: string
  title: string
  desc: string
  earned: boolean
  /** Categorie voor de groepering in de UI. */
  group: string
  /** Voortgang naar de drempel (enkel bij telbare badges). */
  progress?: { have: number; need: number }
}

const tier = (group: string, key: string, emoji: string, title: string, desc: string, have: number, need: number): Badge => ({
  key,
  emoji,
  title,
  desc,
  group,
  earned: have >= need,
  progress: { have: Math.min(Math.max(0, have), need), need },
})

const flag = (group: string, key: string, emoji: string, title: string, desc: string, earned: boolean): Badge => ({
  key,
  emoji,
  title,
  desc,
  group,
  earned,
})

/** Alle badges met hun verdiend/vergrendeld-status, op basis van de supporter-stats. */
export function computeBadges(stats: BadgeStats): Badge[] {
  return [
    flag('Start', 'welcome', '🟢', 'Welkom in de tribune', 'Je hebt een account — welkom!', true),

    // Aanwezigheid ("ik ben erbij").
    tier('Aanwezigheid', 'checkin1', '🎟️', 'Eerste keer erbij', 'Woon 1 wedstrijd bij', stats.checkins, 1),
    tier('Aanwezigheid', 'checkin5', '🔥', 'Trouwe supporter', 'Woon 5 wedstrijden bij', stats.checkins, 5),
    tier('Aanwezigheid', 'checkin15', '🏟️', 'Vaste klant', 'Woon 15 wedstrijden bij', stats.checkins, 15),
    tier('Aanwezigheid', 'checkin30', '👑', 'Seizoenskaart', 'Woon 30 wedstrijden bij', stats.checkins, 30),
    tier('Aanwezigheid', 'checkin50', '🦁', 'Clublegende', 'Woon 50 wedstrijden bij', stats.checkins, 50),

    // Foto-tribune.
    tier('Foto-tribune', 'photo1', '📷', 'Eerste sfeerbeeld', 'Plaats 1 foto in de tribune', stats.photos, 1),
    tier('Foto-tribune', 'photo10', '📸', 'Clubfotograaf', 'Plaats 10 foto’s', stats.photos, 10),
    tier('Foto-tribune', 'photo25', '🖼️', 'Tribune-artiest', 'Plaats 25 foto’s', stats.photos, 25),

    // Pronostiek.
    tier('Pronostiek', 'pred1', '🔮', 'Eerste voorspelling', 'Voorspel 1 uitslag', stats.predictions, 1),
    tier('Pronostiek', 'pred10', '🎯', 'Vaste voorspeller', 'Voorspel 10 uitslagen', stats.predictions, 10),
    tier('Pronostiek', 'pred25', '🧙', 'Orakel', 'Voorspel 25 uitslagen', stats.predictions, 25),
    tier('Pronostiek', 'predpoints100', '💎', 'Pronostiek-kanon', 'Verzamel 100 pronostiekpunten', stats.predictionPoints, 100),

    // Held van de match (stemmen uitbrengen).
    tier('Held van de match', 'mvp1', '🗳️', 'Jurylid', 'Stem 1 keer voor de held van de match', stats.mvpVotes, 1),
    tier('Held van de match', 'mvp10', '⚖️', 'Vaste jury', 'Stem 10 keer voor de held van de match', stats.mvpVotes, 10),

    // Fanscore (gecombineerde betrokkenheid).
    tier('Superfan', 'superfan', '📣', 'Superfan', 'Bereik een fanscore van 200', stats.fanScore, 200),
    tier('Superfan', 'megafan', '🌟', 'Megafan', 'Bereik een fanscore van 500', stats.fanScore, 500),

    // Aantekenen: badges belonen hier bewust NIEUW gedrag (zelf de score doorgeven), niet het
    // kijken zelf — dat vinden supporters al leuk uit zichzelf.
    tier('Aantekenen', 'score1', '✏️', 'Eerste keer aangetekend', 'Teken 1 wedstrijd aan die bevestigd wordt', stats.scoredMatches, 1),
    tier('Aantekenen', 'score5', '📝', 'Vaste aantekenaar', 'Teken 5 bevestigde wedstrijden aan', stats.scoredMatches, 5),
    flag('Aantekenen', 'trusted', '🛡️', 'Vertrouwde aantekenaar', 'Jouw scores gaan meteen als bevestigd door', stats.trustedScorer),

    // Profiel & bonusrad.
    flag('Profiel', 'profile', '🧑', 'Profiel compleet', 'Foto, club én positie ingevuld', stats.profileComplete),
    flag('Profiel', 'booster', '🎡', 'Bonusrad-winnaar', 'Win een bonusrad-booster', stats.boosterWon),
  ]
}

export function earnedCount(badges: Badge[]): number {
  return badges.filter((b) => b.earned).length
}
