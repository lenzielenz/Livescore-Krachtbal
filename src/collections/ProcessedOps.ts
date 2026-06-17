import type { CollectionConfig } from 'payload'

// Idempotentie-logboek voor aantekenaar-acties (AUDIT §2 / offline-hardening).
//
// Elke muterende actie via /api/match/[id]/action draagt een client-gegenereerde `opId`. De
// action-route bewaart hier de eerste response per opId. Levert de offline-wachtrij dezelfde actie
// een tweede keer af (at-least-once: de server verwerkte de worp al, maar het antwoord ging verloren
// toen het netwerk wegviel), dan herkent de route de opId en geeft exact dezelfde response terug
// zónder de actie opnieuw toe te passen. Zo telt een wegvallend netwerk midden in een match nooit
// een dubbele worp/doelpunt — en een dubbele undo verwijdert nooit een extra worp.
//
// Puur intern: geen publieke toegang, alles loopt via overrideAccess vanuit de action-route.
export const ProcessedOps: CollectionConfig = {
  slug: 'processed-ops',
  labels: { singular: 'Verwerkte actie', plural: 'Verwerkte acties' },
  admin: {
    useAsTitle: 'opId',
    group: 'Systeem',
    hidden: true,
    description: 'Idempotentie-logboek — herverzonden aantekenaar-acties niet dubbel toepassen.',
  },
  access: {
    read: () => false,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: 'match',
      label: 'Wedstrijd',
      type: 'relationship',
      relationTo: 'matches',
      required: true,
      index: true,
    },
    {
      name: 'opId',
      label: 'Actie-id',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      // De eerste response van deze actie — letterlijk teruggegeven bij een herverzending.
      name: 'response',
      label: 'Response',
      type: 'json',
    },
  ],
}
