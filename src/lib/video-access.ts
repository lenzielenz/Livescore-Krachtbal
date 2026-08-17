import { canViewAnalyseMatch } from './analyse-access'
import { isFederationLevel } from './access'

/** Wie mag de video van een wedstrijd koppelen, uploaden en ijken?
 *  - federatie/admin: elke wedstrijd
 *  - privé analyse-opname: de eigenaar (en met wie hij ze deelde) — exact de kring die ze al ziet
 *
 *  Eén bron van waarheid voor de API én de knoppen in de UI, zodat er nooit een knop staat die de
 *  server daarna weigert (of omgekeerd). */
export function mayEditMatchVideo(
  user: unknown,
  match: { analyseOnly?: boolean | null; analyseOwner?: unknown } | null,
): boolean {
  if (!user || !match) return false
  if (isFederationLevel(user)) return true
  return Boolean(match.analyseOnly) && canViewAnalyseMatch(user, match)
}
