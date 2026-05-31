import type { Access, CollectionConfig, FieldHook } from 'payload'

export const ROLE_OPTIONS = [
  { label: 'Admin (volledige toegang)', value: 'admin' },
  { label: 'Aantekenaar (scorekeeper)', value: 'scorekeeper' },
  { label: 'Kijker (alleen lezen)', value: 'viewer' },
] as const

export type UserRole = 'admin' | 'scorekeeper' | 'viewer'

const hasRole = (user: unknown, role: UserRole): boolean =>
  Boolean(user && Array.isArray((user as { roles?: string[] }).roles) && (user as { roles: string[] }).roles.includes(role))

const isAdmin: Access = ({ req }) => hasRole(req.user, 'admin')

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
    defaultColumns: ['email', 'name', 'roles'],
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
  ],
}
