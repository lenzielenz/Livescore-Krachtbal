import type { CollectionConfig, FieldHook } from 'payload'

import { ROLE_OPTIONS, hasRole, isAdmin, isFederationLevel } from '../lib/access'

// Eerste gebruiker (bij lege database) wordt automatisch admin; daarna erft de waarde
// die de admin instelt.
const ensureFirstUserAdmin: FieldHook = async ({ req, operation, value }) => {
  if (operation !== 'create') return value
  const existing = await req.payload.count({ collection: 'users' })
  if (existing.totalDocs === 0) return ['admin']
  return value && Array.isArray(value) && value.length > 0 ? value : ['scorekeeper']
}

export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'Gebruiker', plural: 'Gebruikers' },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'name', 'roles', 'club'],
    group: 'Beheer',
  },
  auth: true,
  hooks: {
    // Een verwijderde gebruiker mag geen verweesde analyse-entiteiten achterlaten. Clubs/ploegen/
    // spelers hebben bewust geen DB-FK op analyse_owner_id (zie migratie 20260609_260000 — vermijdt
    // deploy-locks), dus we maken ze hier op app-niveau eigenaarloos — analoog aan de ON DELETE SET
    // NULL die matches.analyse_owner_id wél via z'n FK krijgt. Zo blijft het model consistent.
    beforeDelete: [
      async ({ req, id }) => {
        for (const collection of ['clubs', 'teams', 'players'] as const) {
          await req.payload
            .update({ collection, where: { analyseOwner: { equals: id } }, data: { analyseOwner: null }, overrideAccess: true })
            .catch(() => {})
        }
      },
    ],
    // Houd de inverses van "analyse delen met" bij op de ONTVANGER (analyseToegangTot voor
    // kijkers, analyseBewerkTot voor meedoeners), zodat de analyse-queries de gedeelde eigenaars
    // rechtstreeks uit het ingelogde user-object kunnen lezen (geen extra opzoeking per pagina).
    // De nestede updates wijzigen de bronvelden niet, dus deze hook loopt daarbij meteen leeg
    // (geen oneindige lus).
    afterChange: [
      async ({ doc, previousDoc, req }) => {
        const ids = (v: unknown): number[] =>
          Array.isArray(v)
            ? v
                .map((x) => Number(x && typeof x === 'object' ? (x as { id?: unknown }).id : x))
                .filter((n) => Number.isFinite(n) && n > 0)
            : []
        const me = Number((doc as { id: number | string }).id)
        const paren: { bron: string; doel: string }[] = [
          { bron: 'analyseDeeltMet', doel: 'analyseToegangTot' },
          { bron: 'analyseDeeltBewerkMet', doel: 'analyseBewerkTot' },
        ]
        for (const { bron, doel } of paren) {
          const voor = ids((previousDoc as Record<string, unknown> | undefined)?.[bron])
          const na = ids((doc as unknown as Record<string, unknown>)[bron])
          const erbij = na.filter((x) => !voor.includes(x))
          const eraf = voor.filter((x) => !na.includes(x))
          if (!erbij.length && !eraf.length) continue
          for (const uid of [...erbij, ...eraf]) {
            const u = await req.payload.findByID({ collection: 'users', id: uid, depth: 0 }).catch(() => null)
            if (!u) continue
            const huidig = ids((u as unknown as Record<string, unknown>)[doel])
            const nieuw = erbij.includes(uid)
              ? huidig.includes(me)
                ? null
                : [...huidig, me]
              : huidig.includes(me)
                ? huidig.filter((x) => x !== me)
                : null
            if (nieuw) {
              await req.payload
                .update({ collection: 'users', id: uid, data: { [doel]: nieuw }, overrideAccess: true })
                .catch(() => {})
            }
          }
        }
      },
    ],
  },
  access: {
    // Alleen admins beheren gebruikers; de eerste gebruiker mag aangemaakt worden bij lege db.
    create: isAdmin,
    // Privacy: enkel admin/federatie ziet álle accounts; een gewone gebruiker enkel zichzelf
    // (zodat /me en eigen profiel blijven werken, maar niemand andermans e-mails kan opvragen).
    read: ({ req }) => {
      if (isFederationLevel(req.user)) return true
      if (req.user) return { id: { equals: req.user.id } }
      return false
    },
    update: ({ req, id }) => hasRole(req.user, 'admin') || req.user?.id === id,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'name',
      label: 'Naam',
      type: 'text',
    },
    {
      name: 'roles',
      label: 'Rollen / rechten',
      type: 'select',
      hasMany: true,
      options: [...ROLE_OPTIONS],
      defaultValue: ['scorekeeper'],
      admin: {
        description:
          'Elke rol geeft eigen rechten. Hiërarchie: Admin (volledige toegang, beheert gebruikers) staat boven Federatie (beheert competitie/vergunningen). Supporters registreren zichzelf; enkel een admin kent hier hogere rollen toe.',
      },
      // Enkel admins mogen rollen wijzigen.
      access: {
        update: ({ req }) => hasRole(req.user, 'admin'),
      },
      hooks: {
        beforeChange: [ensureFirstUserAdmin],
      },
    },
    {
      // De club waar deze gebruiker bij hoort. Een supporter kiest ze (optioneel) bij
      // registratie en wordt er overal naartoe gestuurd; voor een club-beheerder bepaalt
      // ze de toegang tot leden en opstellingen (WEDSTRIJDBLAD-PROMPT §Rollen).
      name: 'club',
      label: 'Club',
      type: 'relationship',
      relationTo: 'clubs',
      admin: {
        description: 'De eigen club (supporter volgt ze; club-beheerder beheert ze).',
      },
    },
    {
      // "Mijn ploegen": een trainer/coach duidt aan welke ploeg(en) van zijn club hij volgt,
      // zodat "Mijn club" meteen op die ploeg(en) focust (de selectie is al gebeurd). Een lijst
      // van team-ids (json) — de gebruiker beheert dit zelf via "Mijn club".
      name: 'myTeams',
      label: 'Mijn ploegen',
      type: 'json',
      admin: {
        description: 'Eigen voorkeur: op welke ploeg(en) "Mijn club" focust. De gebruiker stelt dit zelf in.',
      },
    },
    {
      // Analyse-toegang: een admin kan een geregistreerd account toegang geven tot de
      // analysemodule (data per speler/ploeg), zonder admin te worden.
      name: 'analyseAccess',
      label: 'Analyse-toegang',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description: 'Geef dit account toegang tot de analyse (naast de admin-rol).',
      },
      access: {
        update: ({ req }) => hasRole(req.user, 'admin'),
      },
    },
    {
      // Idem voor het trainingsluik (progressie + aanwezigheid): toegang los van de admin-rol.
      name: 'trainingAccess',
      label: 'Training-toegang',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description: 'Geef dit account toegang tot het trainingsluik (progressie + aanwezigheid).',
      },
      access: {
        update: ({ req }) => hasRole(req.user, 'admin'),
      },
    },
    {
      // Koppelt een scheidsrechter-account aan zijn/haar official-dossier, zodat hij enkel z'n
      // EIGEN kwitantie/forfaitblad kan ophalen en enkel toegewezen wedstrijden kan tekenen
      // (voorkomt IDOR op financiële PII — zie AUDIT-2026-06.md §4/§5).
      name: 'official',
      label: 'Officialdossier (voor scheidsrechter/grensrechter)',
      type: 'relationship',
      relationTo: 'officials',
      admin: {
        description: 'Enkel relevant voor de rol "Scheidsrechter". Beperkt de toegang tot de eigen kwitantie.',
        condition: (data) => Array.isArray(data?.roles) && data.roles.includes('scheidsrechter'),
      },
    },
    {
      // Analyse delen (alleen lezen): deze gebruikers mogen MIJN analyse-data (wedstrijden,
      // rapporten) mee bekijken. De eigenaar beheert dit zelf op de analyse-hub.
      name: 'analyseDeeltMet',
      label: 'Analyse delen met (lezen)',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
      admin: {
        description: 'Deze accounts zien jouw analysewedstrijden en -rapporten mee (alleen-lezen).',
      },
    },
    {
      // Analyse delen (meedoen): deze gebruikers mogen MIJN analyse-data ook aanpassen —
      // wedstrijden aantekenen, spelers/ploegen bewerken, opnames toevoegen aan mijn set.
      name: 'analyseDeeltBewerkMet',
      label: 'Analyse delen met (meedoen & aanpassen)',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
      admin: {
        description: 'Deze accounts mogen jouw analyses ook aantekenen en aanpassen.',
      },
    },
    {
      // Automatisch bijgehouden inverses (wiens analyses mag IK zien/bewerken) — zie de
      // afterChange-hook. Hidden: deze velden beheer je nooit rechtstreeks.
      name: 'analyseToegangTot',
      label: 'Analyse-toegang tot (lezen)',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
      admin: { hidden: true, readOnly: true },
    },
    {
      name: 'analyseBewerkTot',
      label: 'Analyse-toegang tot (bewerken)',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
      admin: { hidden: true, readOnly: true },
    },
  ],
}
