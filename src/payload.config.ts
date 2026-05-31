import { postgresAdapter } from '@payloadcms/db-postgres'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Teams } from './collections/Teams'
import { Players } from './collections/Players'
import { Matches } from './collections/Matches'
import { Possessions } from './collections/Possessions'
import { Throws } from './collections/Throws'
import { MatchEvents } from './collections/MatchEvents'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// Postgres in productie (Railway-service), SQLite-bestand lokaal — afgeleid uit DATABASE_URL.
const databaseUrl = process.env.DATABASE_URL || 'file:./krachtbal.db'
const isPostgres = /^postgres(ql)?:\/\//.test(databaseUrl)
const db = isPostgres
  ? postgresAdapter({ pool: { connectionString: databaseUrl } })
  : sqliteAdapter({ client: { url: databaseUrl } })

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Media, Teams, Players, Matches, Possessions, Throws, MatchEvents],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db,
  sharp,
  plugins: [],
})
