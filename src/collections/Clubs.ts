import type { CollectionConfig } from 'payload'

import { isFederationLevel } from '../lib/access'

// Bovenste niveau van de hiërarchie: Club → Ploegen (per categorie) → Spelers.
export const Clubs: CollectionConfig = {
  slug: 'clubs',
  labels: {
    singular: 'Club',
    plural: 'Clubs',
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name'],
    group: 'Beheer',
  },
  access: {
    read: () => true,
    create: ({ req }) => isFederationLevel(req.user),
    update: ({ req }) => isFederationLevel(req.user),
    delete: ({ req }) => isFederationLevel(req.user),
  },
  hooks: {
    // Een club verwijderen ruimt alles netjes op, anders blokkeren FK's het verwijderen:
    //  1) de wedstrijden van haar ploegen (+ worpen/balbezit/wedstrijdblad/…),
    //  2) accounts die aan de club hingen worden losgekoppeld (niet verwijderd),
    //  3) de ploegen zelf (die op hun beurt hun spelers opruimen via de teams-hook).
    beforeDelete: [
      async ({ req, id }) => {
        const payload = req.payload
        const teamsRes = await payload
          .find({ collection: 'teams', where: { club: { equals: id } }, depth: 0, limit: 1000 })
          .catch(() => ({ docs: [] as { id: number }[] }))
        const teamIds = teamsRes.docs.map((t) => (t as { id: number }).id)

        if (teamIds.length) {
          const matchesRes = await payload
            .find({ collection: 'matches', where: { or: [{ homeTeam: { in: teamIds } }, { awayTeam: { in: teamIds } }] }, depth: 0, limit: 2000 })
            .catch(() => ({ docs: [] as { id: number }[] }))
          const deps: ('throws' | 'possessions' | 'match-events' | 'matchsheets' | 'accidents')[] = [
            'throws',
            'possessions',
            'match-events',
            'matchsheets',
            'accidents',
          ]
          for (const m of matchesRes.docs) {
            const mid = (m as { id: number }).id
            for (const coll of deps) {
              await payload.delete({ collection: coll, where: { match: { equals: mid } }, overrideAccess: true }).catch(() => {})
            }
            await payload.delete({ collection: 'matches', id: mid, overrideAccess: true }).catch(() => {})
          }
        }

        // Accounts loskoppelen (niet verwijderen) zodat de FK de club niet blokkeert.
        await payload.update({ collection: 'users', where: { club: { equals: id } }, data: { club: null }, overrideAccess: true }).catch(() => {})
        // Ploegen verwijderen (ruimt hun spelers op via de teams-hook).
        await payload.delete({ collection: 'teams', where: { club: { equals: id } }, overrideAccess: true }).catch(() => {})
      },
    ],
  },
  fields: [
    {
      name: 'name',
      label: 'Naam',
      type: 'text',
      required: true,
    },
    {
      name: 'email',
      label: 'Contact-e-mail',
      type: 'email',
      admin: {
        description: 'Ontvangt het PDF-wedstrijdblad na indienen.',
      },
    },
    {
      name: 'logo',
      label: 'Logo (bestand)',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: 'Clublogo uploaden. Of gebruik hieronder een logo-URL.',
      },
    },
    {
      name: 'logoUrl',
      label: 'Logo via URL',
      type: 'text',
      admin: {
        description: 'Alternatief: directe URL naar een logo-afbeelding (gebruikt als er geen bestand is geüpload).',
        placeholder: 'https://…/logo.png',
      },
    },
    // Weergave-instelling: zoom + positie binnen de ronde badge. De aangepaste
    // Field-component toont een live ronde voorvertoning (exact zoals op de site)
    // met een zoom-schuifregelaar en sleep-om-te-positioneren.
    {
      name: 'logoZoom',
      label: 'Logo bijsnijden',
      type: 'number',
      defaultValue: 1,
      min: 1,
      max: 3,
      admin: {
        components: {
          Field: '/components/admin/LogoFitEditor#LogoFitEditor',
        },
      },
    },
    {
      name: 'logoOffsetX',
      type: 'number',
      defaultValue: 0,
      admin: { hidden: true },
    },
    {
      name: 'logoOffsetY',
      type: 'number',
      defaultValue: 0,
      admin: { hidden: true },
    },
    // Clubkleuren (primair + secundair). De aangepaste Field-component leidt ze
    // automatisch uit het logo af en laat ze handmatig bijstellen. Het secundaire
    // veld wordt door diezelfde component beheerd en is daarom verborgen.
    {
      name: 'colorPrimary',
      label: 'Clubkleuren',
      type: 'text',
      admin: {
        components: {
          Field: '/components/admin/LogoColorsEditor#LogoColorsEditor',
        },
      },
    },
    {
      name: 'colorSecondary',
      type: 'text',
      admin: { hidden: true },
    },
    {
      type: 'collapsible',
      label: 'Accommodatie & contact',
      admin: { initCollapsed: true },
      fields: [
        { name: 'accommodatie', label: 'Terrein / accommodatie', type: 'textarea', admin: { description: 'Naam stadion, adres, type terrein (bv. kunstgras).' } },
        {
          name: 'plaats',
          label: 'Gemeente / plaats (voor het weer)',
          type: 'text',
          admin: { description: 'Bv. "Brugge" of "Snellegem". Wordt gebruikt voor de buienradar van de thuiswedstrijden.', placeholder: 'Brugge' },
        },
        {
          type: 'row',
          fields: [
            { name: 'lat', label: 'Breedtegraad (optioneel)', type: 'number', admin: { description: 'Exacte locatie van het terrein (optioneel, nauwkeuriger dan de gemeente).' } },
            { name: 'lng', label: 'Lengtegraad (optioneel)', type: 'number' },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'telefoon', label: 'Telefoon', type: 'text' },
            { name: 'website', label: 'Website', type: 'text' },
          ],
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Secretaris',
      admin: { initCollapsed: true },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'secretarisNaam', label: 'Naam', type: 'text' },
            { name: 'secretarisEmail', label: 'E-mail', type: 'email' },
            { name: 'secretarisTelefoon', label: 'Telefoon', type: 'text' },
          ],
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Jeugdverantwoordelijke',
      admin: { initCollapsed: true },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'jeugdNaam', label: 'Naam', type: 'text' },
            { name: 'jeugdEmail', label: 'E-mail', type: 'email' },
            { name: 'jeugdTelefoon', label: 'Telefoon', type: 'text' },
          ],
        },
      ],
    },
  ],
}
