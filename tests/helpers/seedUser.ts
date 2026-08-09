import { getPayload } from 'payload'
import config from '../../src/payload.config.js'

export const testUser = {
  email: 'dev@payloadcms.com',
  password: 'test',
}

/**
 * Seeds a test user for e2e admin tests.
 */
export async function seedTestUser(): Promise<void> {
  const payload = await getPayload({ config })

  // Delete existing test user if any
  await payload.delete({
    collection: 'users',
    where: {
      email: {
        equals: testUser.email,
      },
    },
  })

  // Create fresh test user. Rol 'admin' is nodig: de admin-tests openen het gebruikersbeheer, en
  // `users.access.create` staat enkel voor admins open — met de standaardrol (aantekenaar) rendert
  // het aanmaakformulier zonder velden en falen de tests op iets dat geen bug is.
  await payload.create({
    collection: 'users',
    data: { ...testUser, roles: ['admin'] },
  })
}

/**
 * Cleans up test user after tests
 */
export async function cleanupTestUser(): Promise<void> {
  const payload = await getPayload({ config })

  await payload.delete({
    collection: 'users',
    where: {
      email: {
        equals: testUser.email,
      },
    },
  })
}
