import type { CollectionConfig, FieldHook } from 'payload'

import { isFederationLevel } from '../lib/access'
import { CATEGORY_OPTIONS } from '../lib/categories'
import { REEKS_OPTIONS, reeksCategorie, type Reeks } from '../lib/reeksen'
import { seasonFromDate } from '../lib/seasons'

// Vul het seizoen automatisch in uit de datum wanneer het leeg gelaten wordt (de admin mag het
// expliciet overschrijven). Zo heeft elke wedstrijd een seizoen zonder extra werk.
const deriveSeizoen: FieldHook = ({ value, siblingData }) => {
  if (typeof value === 'string' && value.trim()) return value
  const raw = (siblingData as { date?: string | null })?.date
  if (!raw) return value
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? value : seasonFromDate(d)
}

export const MATCH_STATUS_OPTIONS = [
  { label: 'Gepland', value: 'scheduled' },
  { label: 'Live', value: 'live' },
  { label: 'Afgelopen', value: 'finished' },
] as const

export const Matches: CollectionConfig = {
  slug: 'matches',
  labels: {
    singular: 'Wedstrijd',
    plural: 'Wedstrijden',
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'date', 'reeks', 'status'],
    group: 'Wedstrijden',
  },
  access: {
    // Iedereen mag wedstrijden lezen (publiek live-bord). Aanmaken/wijzigen/verwijderen
    // is voorbehouden aan federatie/admin — zoals bij teams, clubs en officials.
    read: () => true,
    create: ({ req }) => isFederationLevel(req.user),
    update: ({ req }) => isFederationLevel(req.user),
    delete: ({ req }) => isFederationLevel(req.user),
  },
  hooks: {
    // Een wedstrijd verwijderen moet ook de eraan vastgekoppelde live-data opruimen.
    // Noodzakelijk omdat het wedstrijdblad (matchsheets.match) verplicht is: de
    // Postgres-FK staat op ON DELETE SET NULL, wat botst met de NOT NULL-kolom en
    // anders een 500/400 geeft. We ruimen daarom expliciet op vóór het verwijderen.
    // Ongevallen (verzekeringsdossiers) laten we bewust staan (match wordt losgekoppeld).
    beforeDelete: [
      async ({ req, id }) => {
        const where = { match: { equals: id } }
        await Promise.all(
          (['matchsheets', 'match-events', 'throws', 'possessions'] as const).map((collection) =>
            req.payload
              .delete({ collection, where, req, overrideAccess: true })
              .catch(() => undefined),
          ),
        )
      },
    ],
  },
  fields: [
    {
      // Snelkoppeling naar het tablet-aantekenscherm vanuit de admin.
      name: 'scorekeeperLink',
      type: 'ui',
      admin: {
        components: {
          Field: '/components/admin/ScorekeeperLink#ScorekeeperLink',
        },
      },
    },
    {
      // Leesbare titel, samengesteld uit de ploegen. Niet handmatig in te vullen.
      name: 'title',
      label: 'Titel',
      type: 'text',
      admin: {
        readOnly: true,
        hidden: true,
      },
      hooks: {
        beforeChange: [
          async ({ siblingData, req }) => {
            const { homeTeam, awayTeam } = siblingData as {
              homeTeam?: string
              awayTeam?: string
            }
            if (!homeTeam || !awayTeam) return undefined
            const [home, away] = await Promise.all([
              req.payload.findByID({ collection: 'teams', id: homeTeam, depth: 0 }).catch(() => null),
              req.payload.findByID({ collection: 'teams', id: awayTeam, depth: 0 }).catch(() => null),
            ])
            if (!home || !away) return undefined
            return `${home.name} — ${away.name}`
          },
        ],
      },
    },
    {
      // Eerste keuze: de reeks. Die bepaalt de categorie én filtert de kiesbare ploegen.
      name: 'reeks',
      label: 'Reeks / niveau',
      type: 'select',
      options: [...REEKS_OPTIONS],
      required: true,
      admin: {
        description: 'Kies eerst de reeks. De categorie volgt automatisch en de ploegen worden hierop gefilterd.',
      },
    },
    {
      name: 'seizoen',
      label: 'Seizoen',
      type: 'text',
      admin: {
        position: 'sidebar',
        description: 'Bv. 2025-2026. Leeg laten = automatisch afgeleid uit de datum (juli–juni).',
      },
      hooks: { beforeChange: [deriveSeizoen] },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'homeTeam',
          label: 'Thuisploeg',
          type: 'relationship',
          relationTo: 'teams',
          required: true,
          // Toon enkel ploegen uit de gekozen reeks (kies dus eerst de reeks).
          filterOptions: ({ siblingData }) => {
            const r = (siblingData as { reeks?: string })?.reeks
            return r ? { reeks: { equals: r } } : false
          },
          admin: { description: 'Kies eerst een reeks hierboven.' },
        },
        {
          name: 'awayTeam',
          label: 'Uitploeg',
          type: 'relationship',
          relationTo: 'teams',
          required: true,
          filterOptions: ({ siblingData }) => {
            const r = (siblingData as { reeks?: string })?.reeks
            return r ? { reeks: { equals: r } } : false
          },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'date',
          label: 'Datum',
          type: 'date',
          required: true,
          admin: {
            date: { pickerAppearance: 'dayAndTime' },
          },
        },
        {
          name: 'status',
          label: 'Status',
          type: 'select',
          options: [...MATCH_STATUS_OPTIONS],
          defaultValue: 'scheduled',
          required: true,
        },
        {
          name: 'goalAreaDepth',
          label: 'Diepte doelgebied (m)',
          type: 'number',
          defaultValue: 10,
          min: 5,
          max: 25,
          required: true,
          admin: {
            description: 'Min. 10 m (15 m voor nieuwe terreinen). Bepaalt de veldlengte en de afstandsberekening.',
          },
        },
      ],
    },
    {
      // Demo/oefenwedstrijd: bedoeld om de live-registratie uit te leggen. Een demo mag
      // altijd geopend worden (geen opstelling-/scheidsrechtercontrole) en toont in het
      // aantekenscherm een stap-voor-stap uitleg.
      name: 'isDemo',
      label: 'Demo / oefenwedstrijd',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description: 'Aanvinken voor een oefen-/uitlegwedstrijd. Mensen kunnen die starten om de live-registratie te leren; alle startcontroles worden overgeslagen.',
        position: 'sidebar',
      },
    },
    {
      // Enkel-voor-analyse: een wedstrijd die je manueel opneemt om data te verzamelen,
      // maar die NIET publiek/live getoond wordt (niet op de startpagina, het live-bord,
      // de rangschikking …). Dient puur om in de analysemodule te bekijken.
      name: 'analyseOnly',
      label: 'Enkel voor analyse (niet live tonen)',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description: 'Aanvinken voor een wedstrijd die je enkel opneemt voor analyse. Ze verschijnt niet live of in de rangschikking — alleen in de analysemodule.',
        position: 'sidebar',
      },
    },
    {
      // Aangeduide verantwoordelijke per club (coach/aantekenaar) die deze wedstrijd "claimt"
      // via Mijn club, zodat iedereen in de club ziet wie waar staat. Thuis en bezoek apart.
      type: 'row',
      fields: [
        {
          name: 'homeCoach',
          label: 'Verantwoordelijke thuis',
          type: 'relationship',
          relationTo: 'users',
          admin: { readOnly: true, position: 'sidebar', description: 'Geclaimd via Mijn club.' },
        },
        {
          name: 'awayCoach',
          label: 'Verantwoordelijke bezoek',
          type: 'relationship',
          relationTo: 'users',
          admin: { readOnly: true, position: 'sidebar', description: 'Geclaimd via Mijn club.' },
        },
      ],
    },
    {
      // Categorie volgt automatisch uit de reeks (leeftijdsniveau voor de spelregels) —
      // niet meer handmatig te kiezen.
      name: 'category',
      label: 'Categorie (afgeleid uit reeks)',
      type: 'select',
      options: CATEGORY_OPTIONS,
      admin: { readOnly: true },
      hooks: {
        beforeChange: [
          ({ siblingData, value }) => {
            const r = (siblingData as { reeks?: Reeks })?.reeks
            return r ? reeksCategorie(r) : (value ?? 'senioren')
          },
        ],
      },
    },
    {
      // Actieve opstelling: de spelers die momenteel op het veld staan (max. 4 per ploeg).
      // Alleen deze spelers kunnen werpen; wissels passen deze lijst aan.
      type: 'row',
      fields: [
        {
          name: 'homeLineup',
          label: 'Opstelling thuis (op het veld)',
          type: 'relationship',
          relationTo: 'players',
          hasMany: true,
          admin: {
            components: {
              Field: {
                path: '/components/admin/LineupSelector#LineupSelector',
                clientProps: { teamPath: 'homeTeam', label: 'Opstelling thuis (op het veld)' },
              },
            },
          },
        },
        {
          name: 'awayLineup',
          label: 'Opstelling uit (op het veld)',
          type: 'relationship',
          relationTo: 'players',
          hasMany: true,
          admin: {
            components: {
              Field: {
                path: '/components/admin/LineupSelector#LineupSelector',
                clientProps: { teamPath: 'awayTeam', label: 'Opstelling uit (op het veld)' },
              },
            },
          },
        },
      ],
    },
    {
      // Kapitein per ploeg (één van de veldspelers). Reglement: een eigen doelpunt
      // wordt op naam/nummer van de kapitein genoteerd. Wordt aangeduid bij de opstelling
      // en getoond met een 'K'-badge op scorebord/matchpagina.
      type: 'row',
      fields: [
        {
          name: 'homeCaptain',
          label: 'Kapitein thuis',
          type: 'relationship',
          relationTo: 'players',
          filterOptions: ({ siblingData }) => {
            const t = (siblingData as { homeTeam?: string })?.homeTeam
            return t ? { team: { equals: t } } : false
          },
        },
        {
          name: 'awayCaptain',
          label: 'Kapitein uit',
          type: 'relationship',
          relationTo: 'players',
          filterOptions: ({ siblingData }) => {
            const t = (siblingData as { awayTeam?: string })?.awayTeam
            return t ? { team: { equals: t } } : false
          },
        },
      ],
    },
    {
      // Klokstaat — runtime live-state. De definitieve tijdlijn blijft afleidbaar uit MatchEvents.
      label: 'Klokstaat',
      type: 'collapsible',
      admin: {
        initCollapsed: true,
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'currentHalf',
              label: 'Helft',
              type: 'number',
              defaultValue: 1,
              min: 1,
              max: 2,
            },
            {
              name: 'clockSeconds',
              label: 'Klok (sec, telt op vanaf 0)',
              type: 'number',
              defaultValue: 0,
              min: 0,
            },
            {
              name: 'clockRunning',
              label: 'Klok loopt',
              type: 'checkbox',
              defaultValue: false,
            },
          ],
        },
        {
          // Tijdstip waarop de klok voor het laatst is gestart/bijgewerkt — om de live
          // verstreken tijd te berekenen wanneer clockRunning = true.
          name: 'clockUpdatedAt',
          label: 'Klok bijgewerkt op',
          type: 'date',
          admin: {
            date: { pickerAppearance: 'dayAndTime' },
          },
        },
      ],
    },
    {
      // Simpele aantekenmodus (snelscoremodus): snelle doelpunten +1/+2 en kruisjes,
      // los van het worp-/balbezit-model. Vorm: { goals: [...], crosses: {home,away} }.
      // Zie src/lib/simple-score.ts. buildMatchState telt dit mee in de stand.
      name: 'simpleScore',
      label: 'Simpele score (Starter-modus)',
      type: 'json',
      admin: {
        hidden: true,
        description: 'Beheerd via het simpele aantekenscherm. Niet handmatig bewerken.',
      },
    },
    {
      // Live tribune — persistente opslag zodat de emoji-tellers en shoutouts NIET verdwijnen
      // wanneer (even) niemand kijkt of de server herstart. Het live-kanaal hydrateert hieruit.
      name: 'liveReactions',
      label: 'Live reacties (tellers)',
      type: 'json',
      admin: {
        hidden: true,
        description: 'Cumulatieve emoji-tellers van de live tribune. Automatisch beheerd.',
      },
    },
    {
      name: 'liveShoutouts',
      label: 'Live shoutouts',
      type: 'json',
      admin: {
        hidden: true,
        description: 'Recente supporter-berichten van de live tribune. Automatisch beheerd.',
      },
    },
    {
      // Tijdstip waarop de wedstrijd afgelopen is. Wordt automatisch gezet zodra de status op
      // 'finished' gaat en bepaalt het 1-uur-navenster waarin supporters nog kunnen reageren.
      name: 'finishedAt',
      label: 'Afgelopen op',
      type: 'date',
      admin: {
        position: 'sidebar',
        readOnly: true,
        date: { pickerAppearance: 'dayAndTime' },
        description: 'Automatisch gezet bij het beëindigen. Bepaalt het 1u-navenster van de live tribune.',
      },
      hooks: {
        beforeChange: [
          ({ siblingData, value }) => {
            const status = (siblingData as { status?: string })?.status
            if (status === 'finished') return value || new Date().toISOString()
            // Niet (meer) afgelopen → geen eindtijd (bv. heropend).
            return null
          },
        ],
      },
    },
  ],
}
