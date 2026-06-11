import type { CollectionConfig } from 'payload'

import { isFederationLevel } from '../lib/access'

// Web-push-abonnementen (één per browser/toestel). Aanmaken/verwijderen gebeurt enkel via de
// /api/push-routes (met overrideAccess) — niet rechtstreeks via de API — zodat een bezoeker enkel
// zijn eigen toestel kan in- of uitschrijven. Lezen/beheren is voor federatie/admin.
export const PushSubscriptions: CollectionConfig = {
  slug: 'push-subscriptions',
  labels: { singular: 'Push-abonnement', plural: 'Push-abonnementen' },
  admin: {
    useAsTitle: 'endpoint',
    defaultColumns: ['endpoint', 'user', 'updatedAt'],
    group: 'Systeem',
    hidden: ({ user }) => !isFederationLevel(user),
  },
  access: {
    read: ({ req }) => isFederationLevel(req.user),
    create: () => false,
    update: () => false,
    delete: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    // Het endpoint is de unieke identiteit van een abonnement (de push-URL van de browser).
    { name: 'endpoint', type: 'text', required: true, unique: true, index: true },
    { name: 'p256dh', type: 'text', required: true },
    { name: 'auth', type: 'text', required: true },
    // Optioneel gekoppeld aan een ingelogde gebruiker (een bezoeker zonder account mag ook).
    { name: 'user', type: 'relationship', relationTo: 'users', required: false },
    { name: 'userAgent', type: 'text', required: false },
  ],
}
