// Kijkmodus: een beheerder bekijkt de site zoals een VERS geregistreerd lid ze ziet — zonder
// rollen, club of analyse-toegang. Puur visueel: de cookie kan rechten enkel AFNEMEN (de echte
// sessie en alle API-permissies blijven onaangeroerd), dus ze mag zonder extra auth gezet en
// gehonoreerd worden. Niet-httpOnly: ook de client-navigatie (SiteHeader) leest ze.

export const KIJKMODUS_COOKIE = 'kb-kijkmodus'

/** Staat de kijkmodus aan volgens deze cookiewaarde? */
export function kijkmodusAan(waarde: string | undefined | null): boolean {
  return waarde === '1'
}

/**
 * Strip een account tot wat een zelfregistratie standaard krijgt: de basisrol (scorekeeper —
 * iedereen mag de score doorgeven), geen club, geen scheidsrechter-koppeling, geen analyse.
 * Identiteit (id, e-mail, naam) blijft, zodat de "ingelogd"-ervaring klopt.
 */
export function alsVersLid<T extends object>(user: T): T {
  return {
    ...user,
    roles: ['scorekeeper'],
    club: null,
    official: null,
    analyseAccess: false,
    trainingAccess: false,
    analyseToegangTot: [],
    analyseBewerkTot: [],
    analyseDeeltMet: [],
  } as T
}
