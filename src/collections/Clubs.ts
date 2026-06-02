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
    // Verwijder eerst de ploegen van deze club (die op hun beurt hun spelers opruimen),
    // anders blokkeert de NOT NULL-FK op teams.club_id het verwijderen van de club.
    beforeDelete: [
      async ({ req, id }) => {
        await req.payload.delete({ collection: 'teams', where: { club: { equals: id } }, overrideAccess: true })
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
      label: 'Logo',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: 'Clublogo — wordt professioneel weergegeven op de site.',
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
