import { describe, it, expect } from 'vitest'

import {
  aantekenClaim,
  applyMatchOutcome,
  castVote,
  CLAIM_IDLE_MS,
  claimActive,
  claimHeld,
  claimScorer,
  confirmWeight,
  emptyTrust,
  emptyUserTrust,
  markSettled,
  mayClaim,
  mayVote,
  needsSettling,
  recordContribution,
  releaseScorer,
  sanitizeTrust,
  sanitizeUserTrust,
  trustLabel,
  trustLevel,
  trustScore,
  trustView,
  voteWeight,
  voteWindowOpen,
  VOTE_WINDOW_MS,
} from '@/lib/score-trust'

const T0 = 1_800_000_000_000
const supporter = (id: number, trust = 0.25) => ({ id, name: `Supporter ${id}`, trust })

describe('sanitizeTrust', () => {
  it('rommel → lege staat', () => {
    expect(sanitizeTrust(null)).toEqual(emptyTrust())
    expect(sanitizeTrust('nope')).toEqual(emptyTrust())
  })
  it('dedupliceert stemmen per gebruiker en knipt gewichten bij', () => {
    const t = sanitizeTrust({
      scorerId: 3,
      scorerName: ' Jan ',
      confirms: [
        { userId: 7, name: 'A', at: T0, w: 99 },
        { userId: 7, name: 'A', at: T0, w: 1 },
        { userId: 0, name: 'B' },
      ],
    })
    expect(t.scorerName).toBe('Jan')
    expect(t.confirms).toHaveLength(1)
    expect(t.confirms[0].w).toBe(1.5)
  })
})

describe('trustScore', () => {
  it('een nieuwe gebruiker weegt licht', () => {
    expect(trustScore(emptyUserTrust())).toBeCloseTo(0.25, 3)
    expect(trustLevel(trustScore(emptyUserTrust()))).toBe('nieuw')
  })
  it('groeit met bevestigde wedstrijden', () => {
    const rookie = trustScore({ confirmed: 1, disputed: 0, matches: 1 })
    const veteran = trustScore({ confirmed: 8, disputed: 0, matches: 8 })
    expect(veteran).toBeGreaterThan(rookie)
    expect(trustLevel(veteran)).toBe('vertrouwd')
  })
  it('betwistingen drukken de score', () => {
    const clean = trustScore({ confirmed: 8, disputed: 0, matches: 8 })
    const messy = trustScore({ confirmed: 4, disputed: 4, matches: 8 })
    expect(messy).toBeLessThan(clean)
    expect(trustLevel(messy)).not.toBe('vertrouwd')
  })
  it('sanitizeUserTrust houdt matches minstens gelijk aan het beoordeelde aantal', () => {
    expect(sanitizeUserTrust({ confirmed: 3, disputed: 2, matches: 1 }).matches).toBe(5)
  })
})

describe('voteWeight', () => {
  it('een vertrouwde stem weegt zwaarder dan een nieuwe', () => {
    expect(voteWeight(0)).toBe(0.5)
    expect(voteWeight(1)).toBe(1.5)
    expect(voteWeight(0.8)).toBeGreaterThan(voteWeight(0.25))
  })
})

describe('claim van de official scorer', () => {
  it('claimen zet de scorer en houdt hem actief', () => {
    const t = claimScorer(emptyTrust(), supporter(4), T0)
    expect(t.scorerId).toBe(4)
    expect(claimActive(t, T0 + 1000)).toBe(true)
  })
  it('een claim vervalt na lange stilte — dan mag iemand anders overnemen', () => {
    const t = claimScorer(emptyTrust(), supporter(4), T0)
    const later = T0 + CLAIM_IDLE_MS + 1
    expect(claimActive(t, later)).toBe(false)
    expect(mayClaim(t, 9, T0 + 1000)).toBe(false)
    expect(mayClaim(t, 9, later)).toBe(true)
    expect(mayClaim(t, 4, T0 + 1000)).toBe(true) // de houder zelf mag altijd
  })
  it('op een lopende wedstrijd vervalt de claim nooit — enkel terugzetten geeft ze vrij', () => {
    const t = claimScorer(emptyTrust(), supporter(4), T0)
    const veelLater = T0 + 5 * CLAIM_IDLE_MS
    expect(claimHeld(t, true, veelLater)).toBe(true)
    expect(claimHeld(t, false, veelLater)).toBe(false)
    expect(mayClaim(t, 9, veelLater, true)).toBe(false)
    expect(mayClaim(t, 4, veelLater, true)).toBe(true)
    expect(trustView(t, { official: true, now: veelLater, live: true }).claimActive).toBe(true)
    // resetMatch wist de claim (scoreTrust = null): dan is de wedstrijd weer vrij.
    expect(claimHeld(sanitizeTrust(null), true, veelLater)).toBe(false)
  })
  it('een aantekenactie van de houder houdt de claim levend', () => {
    let t = claimScorer(emptyTrust(), supporter(4), T0)
    t = recordContribution(t, { id: 4, name: 'Supporter 4' }, T0 + CLAIM_IDLE_MS - 1000)
    expect(claimActive(t, T0 + CLAIM_IDLE_MS + 1)).toBe(true)
    expect(t.contributors[0].ops).toBe(1)
  })
  it('een nieuwe scorer wist de stemmen over de vórige stand', () => {
    let t = claimScorer(emptyTrust(), supporter(4), T0)
    t = castVote(t, supporter(9), 'confirm', T0)
    expect(t.confirms).toHaveLength(1)
    t = claimScorer(t, supporter(5), T0 + CLAIM_IDLE_MS + 1)
    expect(t.confirms).toHaveLength(0)
  })
  it('vrijgeven kan enkel door de houder', () => {
    const t = claimScorer(emptyTrust(), supporter(4), T0)
    expect(releaseScorer(t, 9).scorerId).toBe(4)
    expect(releaseScorer(t, 4).scorerId).toBeNull()
  })
})

describe('bevestigen en betwisten', () => {
  it('wie zelf meetekende, mag niet stemmen', () => {
    let t = claimScorer(emptyTrust(), supporter(4), T0)
    t = recordContribution(t, { id: 8, name: 'Supporter 8' }, T0)
    expect(mayVote(t, 4)).toBe(false)
    expect(mayVote(t, 8)).toBe(false)
    expect(mayVote(t, 9)).toBe(true)
  })
  it('tweemaal dezelfde stem trekt ze terug', () => {
    let t = castVote(emptyTrust(), supporter(9), 'confirm', T0)
    expect(t.confirms).toHaveLength(1)
    t = castVote(t, supporter(9), 'confirm', T0)
    expect(t.confirms).toHaveLength(0)
  })
  it('van bevestigen naar betwisten wisselen laat geen dubbele stem achter', () => {
    let t = castVote(emptyTrust(), supporter(9), 'confirm', T0)
    t = castVote(t, supporter(9), 'dispute', T0)
    expect(t.confirms).toHaveLength(0)
    expect(t.disputes).toHaveLength(1)
  })
  it('telt gewogen op', () => {
    let t = castVote(emptyTrust(), supporter(9, 1), 'confirm', T0)
    t = castVote(t, supporter(10, 0), 'confirm', T0)
    expect(confirmWeight(t.confirms)).toBe(2)
  })
})

describe('voteWindowOpen', () => {
  const finishedAt = new Date(T0).toISOString()
  it('open tijdens de wedstrijd', () => expect(voteWindowOpen('live', null, T0)).toBe(true))
  it('gesloten voor een geplande wedstrijd', () => expect(voteWindowOpen('scheduled', null, T0)).toBe(false))
  it('open tot een dag na het einde', () => {
    expect(voteWindowOpen('finished', finishedAt, T0 + VOTE_WINDOW_MS - 1)).toBe(true)
    expect(voteWindowOpen('finished', finishedAt, T0 + VOTE_WINDOW_MS + 1)).toBe(false)
  })
  it('afgelopen zonder bekend eindtijdstip → gesloten', () => expect(voteWindowOpen('finished', null, T0)).toBe(false))
})

describe('trustLabel', () => {
  it('federatieflow is altijd de officiële uitslag', () => {
    expect(trustLabel(emptyTrust(), { official: true })).toBe('official')
  })
  it('een verse fan-score staat op nog-niet-bevestigd', () => {
    const t = claimScorer(emptyTrust(), supporter(4), T0)
    expect(trustLabel(t, { official: false })).toBe('unconfirmed')
  })
  it('genoeg gewogen bevestigingen maken de stand bevestigd', () => {
    let t = claimScorer(emptyTrust(), supporter(4), T0)
    t = castVote(t, supporter(9, 1), 'confirm', T0)
    expect(trustLabel(t, { official: false })).toBe('unconfirmed')
    t = castVote(t, supporter(10, 1), 'confirm', T0)
    expect(trustLabel(t, { official: false })).toBe('confirmed')
  })
  it('een vertrouwde aantekenaar is meteen bevestigd', () => {
    const t = claimScorer(emptyTrust(), supporter(4, 0.9), T0)
    expect(trustLabel(t, { official: false })).toBe('confirmed')
  })
  it('meer betwisting dan bevestiging → betwist', () => {
    let t = claimScorer(emptyTrust(), supporter(4), T0)
    t = castVote(t, supporter(9, 1), 'dispute', T0)
    expect(trustLabel(t, { official: false })).toBe('disputed')
  })
  it('betwisting weegt niet op tegen meer bevestiging', () => {
    let t = claimScorer(emptyTrust(), supporter(4), T0)
    t = castVote(t, supporter(9, 1), 'dispute', T0)
    t = castVote(t, supporter(10, 1), 'confirm', T0)
    t = castVote(t, supporter(11, 1), 'confirm', T0)
    expect(trustLabel(t, { official: false })).toBe('confirmed')
  })
})

describe('needsSettling', () => {
  const finishedAt = new Date(T0).toISOString()
  const scored = () => claimScorer(emptyTrust(), supporter(4), T0)
  it('pas ná het bevestigingsvenster', () => {
    expect(needsSettling(scored(), 'finished', finishedAt, T0 + 1000)).toBe(false)
    expect(needsSettling(scored(), 'finished', finishedAt, T0 + VOTE_WINDOW_MS + 1)).toBe(true)
  })
  it('niet voor een lopende wedstrijd', () => {
    expect(needsSettling(scored(), 'live', null, T0 + VOTE_WINDOW_MS + 1)).toBe(false)
  })
  it('niet zonder aangeduide aantekenaar', () => {
    expect(needsSettling(emptyTrust(), 'finished', finishedAt, T0 + VOTE_WINDOW_MS + 1)).toBe(false)
  })
  it('en maar één keer', () => {
    const t = markSettled(scored(), T0)
    expect(needsSettling(t, 'finished', finishedAt, T0 + VOTE_WINDOW_MS + 1)).toBe(false)
  })
})

describe('applyMatchOutcome', () => {
  it('boekt bevestigd, betwist en onbeslist correct', () => {
    expect(applyMatchOutcome(emptyUserTrust(), 'confirmed')).toEqual({ confirmed: 1, disputed: 0, matches: 1 })
    expect(applyMatchOutcome(emptyUserTrust(), 'official')).toEqual({ confirmed: 1, disputed: 0, matches: 1 })
    expect(applyMatchOutcome(emptyUserTrust(), 'disputed')).toEqual({ confirmed: 0, disputed: 1, matches: 1 })
    expect(applyMatchOutcome(emptyUserTrust(), 'unconfirmed')).toEqual({ confirmed: 0, disputed: 0, matches: 1 })
  })
})

describe('trustView', () => {
  it('levert een compleet blokje voor de UI', () => {
    let t = claimScorer(emptyTrust(), supporter(4), T0)
    t = castVote(t, supporter(9), 'confirm', T0)
    const v = trustView(t, { official: false, now: T0 + 1000 })
    expect(v.label).toBe('unconfirmed')
    expect(v.emoji).toBe('🟡')
    expect(v.scorerName).toBe('Supporter 4')
    expect(v.claimActive).toBe(true)
    expect(v.confirms).toBe(1)
    expect(v.disputes).toBe(0)
  })
})

describe('aantekenClaim — één aantekenaar per lopende wedstrijd', () => {
  const houder = claimScorer(emptyTrust(), supporter(4), T0)
  const basis = { live: true, action: 'simplegoal', federatie: false, vrijeWedstrijd: false, now: T0 + 5 * CLAIM_IDLE_MS }

  it('blokkeert iemand anders op een lopende wedstrijd, ook na lange stilte', () => {
    expect(aantekenClaim({ ...basis, trust: houder, userId: 9 })).toBe('blokkeer')
    expect(aantekenClaim({ ...basis, trust: houder, userId: 9, action: 'clock' })).toBe('blokkeer')
  })
  it('laat de houder zelf gewoon verder doen', () => {
    expect(aantekenClaim({ ...basis, trust: houder, userId: 4 })).toBe('vrij')
  })
  it('wie de wedstrijd start, wordt de aantekenaar', () => {
    expect(aantekenClaim({ ...basis, live: false, action: 'simplestart', trust: emptyTrust(), userId: 9 })).toBe('claim')
    expect(aantekenClaim({ ...basis, live: false, action: 'start', trust: houder, userId: 9 })).toBe('claim')
  })
  it('vóór de start claimen gewone acties niets', () => {
    expect(aantekenClaim({ ...basis, live: false, action: 'setlineup', trust: emptyTrust(), userId: 9 })).toBe('vrij')
  })
  it('na terugzetten (claim gewist) kan iemand anders overnemen', () => {
    expect(aantekenClaim({ ...basis, trust: sanitizeTrust(null), userId: 9 })).toBe('claim')
  })
  it('federatie/admin is de noodrem; demo en analyse zijn vrij; reset wordt hier niet bewaakt', () => {
    expect(aantekenClaim({ ...basis, trust: houder, userId: 9, federatie: true })).toBe('vrij')
    expect(aantekenClaim({ ...basis, trust: houder, userId: 9, vrijeWedstrijd: true })).toBe('vrij')
    expect(aantekenClaim({ ...basis, trust: houder, userId: 9, action: 'reset' })).toBe('vrij')
  })
})
