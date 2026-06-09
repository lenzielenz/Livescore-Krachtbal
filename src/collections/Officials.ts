import type { CollectionConfig } from 'payload'

import { isFederationLevel } from '../lib/access'

export const OFFICIAL_TYPE_OPTIONS = [
  { label: 'Scheidsrechter', value: 'scheidsrechter' },
  { label: 'Grensrechter', value: 'grensrechter' },
  { label: 'Aantekenaar', value: 'aantekenaar' },
  { label: 'Tijdopnemer', value: 'tijdopnemer' },
] as const

// Officials (scheidsrechters, grensrechters, ...) worden door comité/federatie beheerd en
// aan wedstrijden toegewezen (WEDSTRIJDBLAD-PROMPT §Officials).
export const Officials: CollectionConfig = {
  slug: 'officials',
  labels: { singular: 'Official', plural: 'Officials' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'type', 'federationNumber', 'user'],
    group: 'Federatie',
  },
  access: {
    read: () => true,
    create: ({ req }) => isFederationLevel(req.user),
    update: ({ req }) => isFederationLevel(req.user),
    delete: ({ req }) => isFederationLevel(req.user),
  },
  hooks: {
    // Houd de omgekeerde koppeling (users.official) in sync. Het scheidsrechtersportaal en de
    // toegangscontrole zoeken het dossier op via het gebruikersaccount (user.official); door hier
    // bij het koppelen het account terug te laten wijzen, ziet de scheidsrechter meteen z'n
    // toegewezen wedstrijden en QR. Users heeft geen tegenhook → geen lus.
    afterChange: [
      async ({ doc, previousDoc, req }) => {
        const relId = (v: unknown): number | null =>
          v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null
        const newUser = relId((doc as { user?: unknown }).user)
        const oldUser = relId((previousDoc as { user?: unknown } | undefined)?.user)
        if (newUser === oldUser) return
        if (newUser != null) {
          await req.payload
            .update({ collection: 'users', id: newUser, data: { official: doc.id }, overrideAccess: true })
            .catch(() => {})
        }
        if (oldUser != null && oldUser !== newUser) {
          const prev = await req.payload.findByID({ collection: 'users', id: oldUser, depth: 0 }).catch(() => null)
          if (prev && relId((prev as { official?: unknown }).official) === doc.id) {
            await req.payload
              .update({ collection: 'users', id: oldUser, data: { official: null }, overrideAccess: true })
              .catch(() => {})
          }
        }
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
      // Koppel dit dossier aan een gebruikersaccount. Zo weet je wie de official is én ziet hij/zij
      // de toegewezen wedstrijden en de persoonlijke QR in het scheidsrechtersportaal. De omgekeerde
      // koppeling (users.official) wordt automatisch bijgehouden (afterChange-hook hierboven).
      name: 'user',
      label: 'Gekoppeld account',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        description: "Koppel aan het login-account van deze persoon, zodat die z'n wedstrijden en QR ziet.",
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'type',
          label: 'Type',
          type: 'select',
          options: [...OFFICIAL_TYPE_OPTIONS],
          required: true,
        },
        {
          name: 'federationNumber',
          label: 'Federatie-lidnummer',
          type: 'text',
        },
      ],
    },
  ],
}
