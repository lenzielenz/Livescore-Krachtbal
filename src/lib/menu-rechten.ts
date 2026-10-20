// Wie ziet wat in de navigatie (SiteHeader). Eén plek, zodat de regels per rol kloppen en getest
// zijn. De navigatie toont enkel ingangen; de pagina's en routes controleren zelf nog eens.
//
//   supporter / speler   wedstrijden volgen en meespelen — niets van de club (geen schermen,
//                        geen training): een speler is met zijn wedstrijd bezig
//   coach / trainer /    "Mijn club" (opstelling van zijn ploegen) en training
//   jeugdverantwoordelijke
//   clubstaf             "Mijn club" (alles van de club, ook kantine- en veldscherm) en training
//   scheidsrechter       het scheidsrechtersportaal
//   federatie / admin    alles

import { canAnalyse, hasRole, isFederationLevel } from './access'
import { clubFunctiesVan } from './club-functies'

export type MenuRechten = {
  loggedIn: boolean
  canAnalyse: boolean
  canTraining: boolean
  isClub: boolean
  isCoach: boolean
  isReferee: boolean
  isFed: boolean
}

export function menuRechten(user: unknown): MenuRechten {
  const u = user as { trainingAccess?: unknown } | null | undefined
  const fed = isFederationLevel(user)
  const club = hasRole(user, 'club-beheerder', 'club-medewerker')
  const functies = clubFunctiesVan(user)
  const coach = functies.some((f) => f === 'coach' || f === 'trainer' || f === 'jeugdverantwoordelijke')
  return {
    loggedIn: Boolean(user),
    canAnalyse: canAnalyse(user),
    canTraining: fed || club || coach || Boolean(u?.trainingAccess),
    isClub: club,
    isCoach: coach,
    isReferee: hasRole(user, 'scheidsrechter'),
    isFed: fed,
  }
}
