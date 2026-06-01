import type { CollectionConfig, FieldHook } from 'payload'

import { ROLE_OPTIONS, hasRole, isAdmin } from '../lib/access'

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
  access: {
    // Alleen admins beheren gebruikers; de eerste gebruiker mag aangemaakt worden bij lege db.
    create: isAdmin,
    read: ({ req }) => Boolean(req.user),
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
      // Enkel admins mogen rollen wijzigen.
      access: {
        update: ({ req }) => hasRole(req.user, 'admin'),
      },
      hooks: {
        beforeChange: [ensureFirstUserAdmin],
      },
    },
    {
      // Koppelt een club-beheerder aan zijn/haar club, zodat de toegang tot leden en
      // opstellingen tot de eigen club beperkt blijft (WEDSTRIJDBLAD-PROMPT §Rollen).
      name: 'club',
      label: 'Club (voor club-beheerder)',
      type: 'relationship',
      relationTo: 'clubs',
      admin: {
        description: 'Enkel relevant voor de rol "Club-beheerder".',
        condition: (data) => Array.isArray(data?.roles) && data.roles.includes('club-beheerder'),
      },
    },
  ],
}
