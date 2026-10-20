import type { CollectionBeforeChangeHook, CollectionConfig, Field, Where } from 'payload'

import { fieldIsFederation, hasRole, isFederationLevel, userClubId, userRoles } from '../lib/access'
import { KEURING_ITEMS, KEURING_OPTIONS } from '../lib/keuring'
import {
  MATCHSHEET_STATUS_OPTIONS,
  type MatchSheetStatus,
  canTransition,
  nextStatus,
} from '../lib/matchsheet-workflow'
import { SYSTEEM_STATUS } from '../lib/blad-status'

// Eén opstellingsregel (per speler op het blad).
const lineupFields: Field[] = [
  { name: 'player', label: 'Speler', type: 'relationship', relationTo: 'players', required: true },
  { name: 'rugnummer', label: 'Rugnummer', type: 'number', min: 0 },
  {
    name: 'deelgenomen',
    label: 'Deelgenomen (O)',
    type: 'checkbox',
    defaultValue: false,
    admin: { description: 'O-markering: heeft effectief deelgenomen.' },
  },
  { name: 'ibGecontroleerd', label: 'IB gecontroleerd', type: 'checkbox', defaultValue: false },
]

// Genereer bij aanmaak een geheime per-wedstrijd vrijgavecode (6 cijfers). De federatie
// bezorgt die aan de toegewezen (of backup-)scheidsrechter; enkel met die code kan de SR
// groen licht geven om de wedstrijd te starten (federatie/admin kan altijd zonder code).
const ensureVrijgaveCode: CollectionBeforeChangeHook = ({ data, operation }) => {
  if (operation === 'create' && !data.vrijgaveCode) {
    data.vrijgaveCode = String(Math.floor(100000 + Math.random() * 900000))
  }
  return data
}

// Status-machine afdwingen + override-log bijhouden (WEDSTRIJDBLAD-PROMPT §workflow, Item 37).
const enforceWorkflow: CollectionBeforeChangeHook = async ({ data, originalDoc, req, operation, context }) => {
  if (operation === 'create') return data
  const from = originalDoc?.status as MatchSheetStatus | undefined
  const to = data?.status as MatchSheetStatus | undefined

  // Na indienen is niets meer wijzigbaar (reglement Item 37).
  if (from === 'ingediend') {
    throw new Error('Het wedstrijdblad is ingediend en kan niet meer gewijzigd worden (Item 37).')
  }

  if (!from || !to || from === to) return data
  // De status volgt de wedstrijd (lib/blad-status.ts): die overgang is geen manuele keuze.
  if (context?.[SYSTEEM_STATUS]) return data

  const roles = userRoles(req.user)
  const check = canTransition(from, to, { roles, isAssignedReferee: false })
  if (!check.allowed) {
    throw new Error(check.reason || 'Ongeldige statusovergang.')
  }

  // Manuele (niet-lineaire) overgang → loggen in de override-log.
  if (nextStatus(from) !== to) {
    const entry = {
      wie: req.user?.id ?? null,
      wanneer: new Date().toISOString(),
      wat: `Manuele statuswijziging: ${from} → ${to}`,
    }
    data.overrideLog = [...((originalDoc?.overrideLog as unknown[]) ?? []), entry]
  }

  return data
}

/** Bladen van wedstrijden waarin een ploeg van de club van deze gebruiker speelt. */
const eigenClubBladen = (user: unknown): Where | false => {
  const club = userClubId(user)
  if (club == null) return false
  return { or: [{ 'match.homeTeam.club': { equals: club } }, { 'match.awayTeam.club': { equals: club } }] }
}

export const MatchSheets: CollectionConfig = {
  slug: 'matchsheets',
  labels: { singular: 'Wedstrijdblad', plural: 'Wedstrijdbladen' },
  admin: {
    useAsTitle: 'titel',
    defaultColumns: ['titel', 'status'],
    group: 'Wedstrijden',
  },
  access: {
    // Intern document: federatie en scheidsrechters zien alles, een club enkel de bladen van haar
    // eigen wedstrijden. Vroeger las élke ingelogde gebruiker (ook een supporter) elk blad, met de
    // opstellingen en de officials erop.
    read: ({ req }) => {
      if (isFederationLevel(req.user) || hasRole(req.user, 'scheidsrechter')) return true
      if (!hasRole(req.user, 'club-beheerder', 'club-medewerker', 'kapitein')) return false
      return eigenClubBladen(req.user)
    },
    create: ({ req }) =>
      isFederationLevel(req.user) || hasRole(req.user, 'scheidsrechter', 'club-beheerder', 'club-medewerker'),
    // Zelfde afbakening bij bewerken: een club kon anders de opstelling van een andere club
    // aanpassen via de REST-API of de admin.
    update: ({ req }) => {
      if (isFederationLevel(req.user) || hasRole(req.user, 'scheidsrechter')) return true
      if (!hasRole(req.user, 'club-beheerder', 'club-medewerker')) return false
      return eigenClubBladen(req.user)
    },
    delete: ({ req }) => isFederationLevel(req.user),
  },
  hooks: {
    beforeChange: [ensureVrijgaveCode, enforceWorkflow],
  },
  fields: [
    {
      name: 'titel',
      type: 'text',
      admin: { readOnly: true, hidden: true },
      hooks: {
        beforeChange: [
          async ({ siblingData, req }) => {
            const matchId = (siblingData as { match?: string | number }).match
            if (!matchId) return undefined
            const m = await req.payload
              .findByID({ collection: 'matches', id: matchId, depth: 0 })
              .catch(() => null)
            return m && typeof m.title === 'string' ? `Blad — ${m.title}` : undefined
          },
        ],
      },
    },
    {
      name: 'match',
      label: 'Wedstrijd',
      type: 'relationship',
      relationTo: 'matches',
      required: true,
      unique: true,
    },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      options: MATCHSHEET_STATUS_OPTIONS,
      defaultValue: 'concept',
      required: true,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'assignedReferee',
          label: 'Toegewezen scheidsrechter',
          type: 'relationship',
          relationTo: 'officials',
        },
        {
          name: 'backupReferee',
          label: 'Backup-scheidsrechter',
          type: 'relationship',
          relationTo: 'officials',
          admin: { description: 'Mag de wedstrijd óók vrijgeven (met dezelfde vrijgavecode) als de toegewezen SR afwezig is.' },
        },
        {
          // Wie floot effectief: gezet bij het aftekenen door de scheidsrechter (de toegewezen óf de
          // backup). De kwitantie telt de wedstrijd voor díe official (lib/vergoeding-data.ts).
          name: 'geflotenDoor',
          label: 'Gefloten door',
          type: 'relationship',
          relationTo: 'officials',
          admin: { readOnly: true, description: 'Gezet bij het aftekenen. Leeg = de toegewezen scheidsrechter.' },
        },
        {
          name: 'assignedLinesman',
          label: 'Toegewezen grensrechter',
          type: 'relationship',
          relationTo: 'officials',
        },
      ],
    },
    {
      name: 'vrijgaveCode',
      label: 'Vrijgavecode (geef door aan de scheidsrechter)',
      type: 'text',
      // Wie de code kent, kan de wedstrijd vrijgeven: enkel de federatie ziet ze (en geeft ze door).
      access: { read: fieldIsFederation, update: () => false },
      admin: {
        description: 'Geheime per-wedstrijd code. De federatie bezorgt die aan de (backup-)scheidsrechter; enkel met deze code kan de SR groen licht geven.',
        readOnly: true,
      },
    },
    {
      // Officials-functies (volledige naam + voornaam). Welke verplicht zijn hangt af van het
      // reekstype (Wedstrijdblad_invullen.pdf) — zie de hint op het scheidsrechterscherm.
      label: 'Officials (functies)',
      type: 'collapsible',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'officials',
          type: 'group',
          label: false,
          fields: [
            { name: 'aantekenaar', label: 'Aantekenaar / scorer', type: 'text' },
            { name: 'tijdopnemer', label: 'Tijdopnemer', type: 'text' },
            { name: 'grensrechterThuis', label: 'Grensrechter (thuis)', type: 'text' },
            { name: 'grensrechterUit', label: 'Grensrechter (uit)', type: 'text' },
            { name: 'terreinafgevaardigde', label: 'Terreinafgevaardigde', type: 'text' },
            { name: 'coachThuis', label: 'Coach (thuis)', type: 'text' },
            { name: 'coachUit', label: 'Coach (uit)', type: 'text' },
          ],
        },
      ],
    },
    {
      label: 'Opstellingen',
      type: 'collapsible',
      admin: { initCollapsed: true },
      fields: [
        { name: 'homeLineup', label: 'Opstelling thuis', type: 'array', fields: lineupFields },
        { name: 'awayLineup', label: 'Opstelling uit', type: 'array', fields: lineupFields },
        {
          type: 'row',
          fields: [
            {
              // Per kant: de club bevestigt ("vergrendelt") haar opstelling. Puur een duidelijk
              // signaal "deze is af" — los van de blad-status. Kan weer ontgrendeld worden.
              name: 'homeLineupConfirmed',
              label: 'Opstelling thuis bevestigd',
              type: 'checkbox',
              defaultValue: false,
            },
            {
              name: 'awayLineupConfirmed',
              label: 'Opstelling uit bevestigd',
              type: 'checkbox',
              defaultValue: false,
            },
          ],
        },
      ],
    },
    {
      // Akkoord van de scheidsrechter dat de wedstrijd mag starten (controle vooraf):
      // pas wanneer dit aanstaat — én beide opstellingen ingevuld zijn — wordt het
      // aantekenscherm ontgrendeld. Zie src/lib/match-readiness.ts.
      name: 'wedstrijdstart',
      label: 'Wedstrijdstart — akkoord scheidsrechter',
      type: 'group',
      fields: [
        {
          name: 'akkoord',
          label: 'Scheidsrechter geeft akkoord om te starten',
          type: 'checkbox',
          defaultValue: false,
          admin: { description: 'Opstellingen gecontroleerd, terrein in orde — de wedstrijd mag geopend worden.' },
        },
        { name: 'naam', label: 'Naam scheidsrechter', type: 'text' },
        { name: 'tijdstip', label: 'Tijdstip akkoord', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime', displayFormat: 'dd/MM/yyyy HH:mm', timeFormat: 'HH:mm' } } },
      ],
    },
    {
      // Eindstand — bevestiging scheidsrechter (officieel federatie-record): de SR keurt de
      // afgeleide eindscore expliciet goed. Los van de start-akkoord (§12/§19): pas hiermee is de
      // uitslag scheidsrechterlijk bekrachtigd. Vrijgave via dezelfde QR/code als wedstrijdstart.
      name: 'wedstrijdeinde',
      label: 'Eindstand — bevestiging scheidsrechter',
      type: 'group',
      fields: [
        {
          name: 'akkoord',
          label: 'Scheidsrechter bevestigt de eindstand',
          type: 'checkbox',
          defaultValue: false,
          admin: { description: 'De afgeleide eindscore klopt en is scheidsrechterlijk bekrachtigd.' },
        },
        { name: 'naam', label: 'Naam scheidsrechter', type: 'text' },
        { name: 'tijdstip', label: 'Tijdstip bevestiging', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime', displayFormat: 'dd/MM/yyyy HH:mm', timeFormat: 'HH:mm' } } },
      ],
    },
    {
      // Scheidsrechtersvergoeding (kwitantie, formulier_2) + forfait-onkostenblad (formulier_3).
      label: 'Scheidsrechter — vergoeding & forfait',
      type: 'collapsible',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'refereeKm',
          label: 'Afgelegde km (scheidsrechter)',
          type: 'number',
          min: 0,
          admin: {
            description: 'Aantal km voor deze wedstrijd — telt mee op de kwitantie (€0,4327/km).',
          },
        },
        {
          name: 'forfait',
          label: false,
          type: 'group',
          fields: [
            {
              // Welke ploeg gaf forfait (FF) — de eigenlijke forfait-aanduiding van de wedstrijd.
              // De niet-forfaiterende ploeg wint; bij dubbel forfait verliezen beide.
              name: 'uitslag',
              label: 'Forfait (FF) — welke ploeg?',
              type: 'select',
              options: [
                { label: 'Geen forfait', value: 'geen' },
                { label: 'Thuis gaf forfait', value: 'thuis' },
                { label: 'Bezoekers gaven forfait', value: 'uit' },
                { label: 'Dubbel forfait', value: 'dubbel' },
              ],
              defaultValue: 'geen',
            },
            {
              name: 'vanToepassing',
              label: 'Forfait-onkostenblad van toepassing',
              type: 'checkbox',
              defaultValue: false,
              admin: { description: 'Enkel invullen bij FF wanneer de scheidsrechter betaald/verplaatst is.' },
            },
            {
              type: 'row',
              fields: [
                { name: 'gemeldThuis', label: 'Forfait gemeld — thuis', type: 'checkbox', defaultValue: false },
                { name: 'gemeldUit', label: 'Forfait gemeld — bezoekers', type: 'checkbox', defaultValue: false },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'aantalAutos',
                  label: "Aantal auto's",
                  type: 'number',
                  min: 0,
                  max: 2,
                  admin: { description: 'Maximaal 2.' },
                },
                {
                  name: 'km',
                  label: 'Verplaatsing (km)',
                  type: 'number',
                  min: 0,
                  admin: { description: 'Telt mee op het forfait-onkostenblad (€0,4259/km).' },
                },
              ],
            },
          ],
        },
      ],
    },
    {
      label: 'Materiële keuring',
      type: 'collapsible',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'keuring',
          type: 'group',
          label: false,
          fields: KEURING_ITEMS.map((item) => ({
            name: item.name,
            label: item.label,
            type: 'select' as const,
            options: [...KEURING_OPTIONS],
            defaultValue: 'ok',
          })),
        },
        {
          // De scheidsrechter bevestigt ("vergrendelt") de keuring: duidelijk signaal voor
          // iedereen dat ze gecontroleerd en in orde is. Kan weer ontgrendeld worden.
          name: 'keuringBevestigd',
          label: 'Keuring bevestigd',
          type: 'checkbox',
          defaultValue: false,
        },
      ],
    },
    {
      label: 'Uitsluitingen & voorbehoud',
      type: 'collapsible',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'uitsluitingen',
          label: 'Uitsluitingen',
          type: 'array',
          fields: [
            { name: 'player', label: 'Speler', type: 'relationship', relationTo: 'players' },
            { name: 'naam', label: 'Naam (indien geen lid)', type: 'text' },
            { name: 'reden', label: 'Reden', type: 'text' },
            { name: 'score', label: 'Score op dat moment', type: 'text' },
            { name: 'speeltijd', label: 'Speeltijd', type: 'text' },
          ],
        },
        {
          name: 'voorbehoud',
          label: 'Voorbehoud',
          type: 'array',
          fields: [
            { name: 'naam', label: 'Naam', type: 'text' },
            { name: 'reden', label: 'Reden', type: 'text' },
            { name: 'score', label: 'Score op dat moment', type: 'text' },
          ],
        },
        { name: 'opmerkingen', label: 'Opmerkingen / kwetsuren', type: 'textarea' },
      ],
    },
    {
      label: 'Handtekeningen',
      type: 'collapsible',
      admin: { initCollapsed: true },
      fields: [
        signatureGroup('kapiteinThuis', 'Kapitein thuis'),
        signatureGroup('kapiteinUit', 'Kapitein uit'),
        signatureGroup('scheidsrechter', 'Scheidsrechter'),
      ],
    },
    {
      // Bevroren PDF-snapshot van het ingediende blad (archief). De her-export-route regenereert
      // óók on-demand uit de (onwijzigbare) data, dus dit is een snapshot, geen single point of failure.
      name: 'pdf',
      label: 'Ingediend wedstrijdblad (PDF)',
      type: 'upload',
      relationTo: 'media',
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      name: 'overrideLog',
      label: 'Override-log',
      type: 'array',
      admin: {
        readOnly: true,
        initCollapsed: true,
        description: 'Automatisch: elke manuele overschrijving (wie/wanneer/wat).',
      },
      fields: [
        { name: 'wie', type: 'relationship', relationTo: 'users' },
        { name: 'wanneer', type: 'text' },
        { name: 'wat', type: 'text' },
      ],
    },
  ],
}

// Handtekening-blok: akkoord + naam + getekende handtekening (canvas → data-URL) + tijdstip.
function signatureGroup(name: string, label: string): Field {
  return {
    name,
    label,
    type: 'group',
    fields: [
      { name: 'akkoord', label: 'Akkoord', type: 'checkbox', defaultValue: false },
      { name: 'naam', label: 'Naam', type: 'text' },
      {
        name: 'handtekening',
        label: 'Handtekening (canvas)',
        type: 'textarea',
        admin: { description: 'Data-URL van de getekende handtekening.', hidden: true },
      },
      { name: 'tijdstip', label: 'Tijdstip', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime', displayFormat: 'dd/MM/yyyy HH:mm', timeFormat: 'HH:mm' } } },
    ],
  }
}
