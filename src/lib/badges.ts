// ── Supporter-achievements / badges ──────────────────────────────────────────────────────────
// Berekent welke badges een supporter verdiende uit eenvoudige signalen (check-ins, tribunefoto's,
// een volledig profiel, een bonusrad-winst). Pure functie → los testbaar; de UI haalt de stats op.

export interface BadgeStats {
  checkins: number
  photos: number
  profileComplete: boolean
  boosterWon: boolean
}

export interface Badge {
  key: string
  emoji: string
  title: string
  desc: string
  earned: boolean
  /** Voortgang naar de volgende drempel (enkel bij telbare badges). */
  progress?: { have: number; need: number }
}

const tier = (key: string, emoji: string, title: string, desc: string, have: number, need: number): Badge => ({
  key,
  emoji,
  title,
  desc,
  earned: have >= need,
  progress: { have: Math.min(have, need), need },
})

/** Alle badges met hun verdiend/vergrendeld-status, op basis van de supporter-stats. */
export function computeBadges(stats: BadgeStats): Badge[] {
  return [
    { key: 'welcome', emoji: '🟢', title: 'Welkom in de tribune', desc: 'Je hebt een account — welkom!', earned: true },
    tier('checkin1', '🎟️', 'Eerste keer erbij', 'Woon 1 wedstrijd bij', stats.checkins, 1),
    tier('checkin5', '🔥', 'Trouwe supporter', 'Woon 5 wedstrijden bij', stats.checkins, 5),
    tier('checkin15', '🏟️', 'Vaste klant', 'Woon 15 wedstrijden bij', stats.checkins, 15),
    tier('checkin30', '👑', 'Seizoenskaart', 'Woon 30 wedstrijden bij', stats.checkins, 30),
    tier('photo1', '📷', 'Eerste sfeerbeeld', 'Plaats 1 foto in de tribune', stats.photos, 1),
    tier('photo10', '📸', 'Clubfotograaf', 'Plaats 10 foto’s', stats.photos, 10),
    tier('photo25', '🖼️', 'Tribune-artiest', 'Plaats 25 foto’s', stats.photos, 25),
    { key: 'profile', emoji: '🧑', title: 'Profiel compleet', desc: 'Foto, club én positie ingevuld', earned: stats.profileComplete },
    { key: 'booster', emoji: '🎡', title: 'Bonusrad-winnaar', desc: 'Win een bonusrad-booster', earned: stats.boosterWon },
  ]
}

export function earnedCount(badges: Badge[]): number {
  return badges.filter((b) => b.earned).length
}
