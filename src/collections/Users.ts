import type { CollectionConfig, FieldHook } from 'payload'

import { ROLE_OPTIONS, hasRole, isAdmin, isFederationLevel } from '../lib/access'
import { POSITION_OPTIONS } from '../lib/positions'

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
  // De sessie moet een kantineavond overleven — en een uitrol.
  //
  // Payload's standaard is 7200 seconden: twee uur. Wie het kantinescherm 's middags klaarzet,
  // is tegen de tweede helft uitgelogd, en dat merk je pas wanneer je de pagina herlaadt — bv.
  // net na een update. Vandaar dat het lang leek alsof de uitrol je uitlogde; de uitrol doet
  // dat niet, de klok deed het.
  //
  // Dertig dagen kan hier veilig omdat Payload de sessies in de database bijhoudt
  // (`useSessions` staat standaard aan): uitloggen verwijdert de sessie écht, en een gestolen
  // cookie is met één uitlog-actie waardeloos. Zou de token alleen op zijn handtekening
  // vertrouwen, dan was dertig dagen wél roekeloos.
  auth: {
    tokenExpiration: 60 * 60 * 24 * 30,
  },
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
    // BELANGRIJK: geef `req` door aan élke nestede operatie. Zonder req draait de nestede update
    // in een eigen transactie, en die blokkeert op Postgres: de FK-check op users_rels wil een
    // lock op de rij van de deler, die nog vast zit in de open buitenste transactie → wederzijds
    // wachten tot de lock-timeout ("Failed query" bij het bewaren, inverses nooit geschreven).
    //
    // ÉN: de inverse-sync schrijft naar de users-collectie VANUIT de afterChange van users zelf.
    // Elke nestede users-update triggert deze hook dus opnieuw. Zonder rem cascadeert dat (zeker bij
    // een account met analyse-deelrelaties): het formulier blijft "Submitting…" hangen. Daarom een
    // re-entrancy-guard via `req.context`: de nestede updates zetten een vlag waardoor deze hook bij
    // hen meteen leeg terugkeert. Eén niveau diep volstaat — de doel-velden zijn dan al bijgewerkt.
    afterChange: [
      async ({ doc, previousDoc, req }) => {
        if ((req.context as { skipAnalyseInverse?: boolean } | undefined)?.skipAnalyseInverse) return
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
            const u = await req.payload.findByID({ collection: 'users', id: uid, depth: 0, req }).catch(() => null)
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
                .update({ collection: 'users', id: uid, data: { [doel]: nieuw }, overrideAccess: true, req, context: { skipAnalyseInverse: true } })
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
      // Eigen ploeg binnen de gekozen club (optioneel): voedt de lichte highlight op het live-bord
      // (LiveBoard) zodat je eigen wedstrijd meteen opvalt tussen alle andere. Bewust apart van
      // `myTeams` verderop (dat is een COACH-voorkeur, een lijst waarop "Mijn club" focust) — dit
      // is de ene persoonlijke ploeg van een supporter/speler/ouder. Zelfbeheerd via "Mijn profiel".
      name: 'team',
      label: 'Mijn ploeg',
      type: 'relationship',
      relationTo: 'teams',
      admin: {
        description: 'Eigen ploeg binnen de gekozen club — highlight haar wedstrijden op het live-bord. De gebruiker stelt dit zelf in via "Mijn profiel".',
      },
    },
    {
      // Voor een supporter zonder eigen club (bv. "gewoon fan" of nog geen lid ergens): welke
      // club(s) hij toch wil volgen. Zo toont "Mijn club" op de hub en elders alsnog iets zinvols
      // i.p.v. de lege "stel je club in"-melding. Bewust apart van `club` (dat blijft de ÉÉN eigen
      // club voor leden/beheerders) en bewust hasMany: een supporter mag meerdere clubs volgen.
      // Zelfbeheerd via de registratie ("Alleen supporter") of nadien via "Mijn profiel".
      name: 'followedClubs',
      label: 'Gevolgde clubs (supporter zonder eigen club)',
      type: 'relationship',
      relationTo: 'clubs',
      hasMany: true,
      admin: {
        description: 'Clubs die deze supporter volgt i.p.v. een eigen club te kiezen. De gebruiker beheert dit zelf.',
      },
    },
    {
      // Eigen profielfoto: elk lid kan een foto uploaden en die op zijn profiel/scorecard tonen.
      // De foto zelf staat in de media-collectie; bijsnijden gebeurt — net als bij clublogo's —
      // met zoom + verschuiving (geen serverbewerking, de weergave gebruikt dezelfde CSS-transform).
      name: 'photo',
      label: 'Profielfoto',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'Eigen profielfoto (de gebruiker beheert dit zelf via "Mijn profiel").' },
    },
    {
      name: 'photoZoom',
      label: 'Foto-zoom',
      type: 'number',
      defaultValue: 1,
      admin: { description: 'Inzoomfactor van de profielfoto (1–3). De gebruiker stelt dit zelf in.' },
    },
    { name: 'photoOffsetX', label: 'Foto-verschuiving X', type: 'number', defaultValue: 0, admin: { hidden: true } },
    { name: 'photoOffsetY', label: 'Foto-verschuiving Y', type: 'number', defaultValue: 0, admin: { hidden: true } },
    {
      // Eigen speelpositie (krachtbal): tonen we op het profiel en later op de scorecard.
      name: 'position',
      label: 'Positie in het spel',
      type: 'select',
      options: [...POSITION_OPTIONS],
      admin: { description: 'De eigen speelpositie. De gebruiker stelt dit zelf in via "Mijn profiel".' },
    },
    {
      // Koppeling account → speler-dossier. Is het lid gekoppeld én heeft die speler wedstrijddata,
      // dan toont de scorecard de échte matchstatistiek (percentiel binnen de reeks). Zo niet, dan
      // valt de radar terug op de zelf-/coachbeoordeling (scorecardSkills).
      name: 'player',
      label: 'Mijn speler (voor matchstatistiek)',
      type: 'relationship',
      relationTo: 'players',
      admin: { description: 'Koppel je account aan je spelersdossier zodat je scorecard je echte cijfers toont.' },
    },
    {
      // Zelf-/coachbeoordeling per radar-as (0..100). Vult de scorecard wanneer er (nog) geen
      // wedstrijddata is. De gebruiker (of zijn coach) beheert dit zelf via de scorecard.
      name: 'scorecardSkills',
      label: 'Scorecard-beoordeling',
      type: 'json',
      admin: { description: 'Eigen/coach-beoordeling per as (0–100) voor de scorecard. De gebruiker beheert dit zelf.' },
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
      // Persoonlijk kantinescherm: welke club(s), ploeg(en) en losse wedstrijden op de tv van
      // deze gebruiker komen. Vorm: { clubIds: number[], teamIds: number[], matchIds: number[] }
      // — zie src/lib/kantine-selectie.ts, dat alles wat hier staat eerst opschoont.
      //
      // Bewust json en niet drie relationships: dit is een persoonlijke voorkeur die de gebruiker
      // zelf beheert (zelfde patroon als myTeams hierboven), geen redactionele data waar de admin
      // op filtert.
      name: 'kantineScherm',
      label: 'Kantinescherm',
      type: 'json',
      admin: {
        description:
          'Eigen keuze: welke clubs, ploegen en losse wedstrijden op het kantinescherm van deze gebruiker komen. De gebruiker stelt dit zelf in via /kantine.',
      },
    },
    {
      // Persoonlijk voedingsprofiel: de gegevens die de gebruiker in de voedingsplanner invult
      // (geslacht, leeftijd, lengte, gewicht, activiteit, doel, tempo, macro-stijl, dieet,
      // streefgewicht). De gebruiker bewaart dit zelf zodat hij het niet telkens opnieuw invult.
      name: 'nutritionProfile',
      label: 'Voedingsprofiel',
      type: 'json',
      admin: {
        description: 'Eigen voorkeur: de bewaarde gegevens van de voedingsplanner. De gebruiker beheert dit zelf.',
      },
    },
    {
      // Persoonlijke calorie-tracker: de dagelijkse voedingslog en gewichtsmetingen die de gebruiker
      // bijhoudt. Vorm: { days: { 'YYYY-MM-DD': [{name,kcal,p,c,f}] }, weights: [{d,kg}] }.
      name: 'nutritionTracker',
      label: 'Calorie-tracker',
      type: 'json',
      admin: {
        description: 'Eigen voorkeur: bewaarde dagelijkse voedingslog + gewichtsmetingen. De gebruiker beheert dit zelf.',
      },
    },
    {
      // "Ik ben erbij": wedstrijden die deze supporter bijwoonde — voedt het seizoenspaspoort.
      // Vorm: [{ m: matchId, d: ISO-datum }]. De gebruiker beheert dit zelf via de wedstrijdpagina.
      name: 'checkins',
      label: 'Bijgewoonde wedstrijden',
      type: 'json',
      admin: { description: 'Eigen check-ins ("ik ben erbij"). De gebruiker beheert dit zelf.' },
    },
    {
      // Bonusrad-booster: de top 3 van het weekend winnen een persoonlijke vermenigvuldiger die ze
      // op hun eigen voorspellingen kunnen gebruiken. Vorm: { mult, remaining, wonAt }. Automatisch beheerd.
      name: 'pronostiekPower',
      label: 'Bonusrad-booster',
      type: 'json',
      admin: {
        hidden: true,
        description: 'Gewonnen pronostiek-booster: { mult, remaining, wonAt }. Automatisch beheerd.',
      },
    },
    {
      // Trust-historiek van een aantekenaar in supporters-modus: hoeveel van zijn aangetekende
      // wedstrijden bevestigd dan wel betwist werden. Bewust ONZICHTBAAR voor de gebruiker zelf
      // (enkel federatie/admin leest ze): een zichtbare score nodigt uit tot spelen met het systeem.
      // Vorm: { confirmed, disputed, matches } — zie src/lib/score-trust.ts. Automatisch beheerd.
      name: 'scoreTrust',
      label: 'Trust-historiek (aantekenen)',
      type: 'json',
      access: {
        read: ({ req }) => isFederationLevel(req.user),
        update: ({ req }) => isFederationLevel(req.user),
      },
      admin: {
        hidden: true,
        description: 'Bevestigde/betwiste aangetekende wedstrijden: { confirmed, disputed, matches }. Automatisch beheerd.',
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
      // Aantekenrechten voor tornooien: op een tornooidag zit er iemand achter de tafel die geen
      // scheidsrechter en geen federatielid is (een ouder, een ploegverantwoordelijke). Bewust
      // géén bestaande rol: élk vers account krijgt standaard 'scorekeeper', dus die zou het
      // recht aan iedereen geven. Zie magTornooiAantekenen in lib/access.ts.
      name: 'aantekenRechten',
      label: 'Tornooi-aantekenrechten',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description: 'Dit account mag tornooiwedstrijden aantekenen (starten, scoren, beëindigen). Een tornooi aanmaken of loten blijft bij de federatie.',
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
