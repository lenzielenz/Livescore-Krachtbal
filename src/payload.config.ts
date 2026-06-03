import { postgresAdapter } from '@payloadcms/db-postgres'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Clubs } from './collections/Clubs'
import { Teams } from './collections/Teams'
import { Players } from './collections/Players'
import { Matches } from './collections/Matches'
import { Possessions } from './collections/Possessions'
import { Throws } from './collections/Throws'
import { MatchEvents } from './collections/MatchEvents'
import { Officials } from './collections/Officials'
import { MatchSheets } from './collections/MatchSheets'
import { Accidents } from './collections/Accidents'
import { CupFinals } from './collections/CupFinals'
import { Sanctions } from './collections/Sanctions'
import { Tournaments } from './collections/Tournaments'
import { TournamentMatches } from './collections/TournamentMatches'
import { Season } from './globals/Season'
import { Settings } from './globals/Settings'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// Postgres in productie (Railway-service), SQLite-bestand lokaal — afgeleid uit DATABASE_URL.
const databaseUrl = process.env.DATABASE_URL || 'file:./krachtbal.db'
const isPostgres = /^postgres(ql)?:\/\//.test(databaseUrl)

// PAYLOAD_SECRET tekent de auth-JWT's. Payload crasht al bij een leeg secret, maar een ZWAK
// (kort) secret wordt anders aanvaard — dwing daarom in productie minimale entropie af.
const payloadSecret = process.env.PAYLOAD_SECRET || ''
if (process.env.NODE_ENV === 'production' && payloadSecret.length < 32) {
  throw new Error('PAYLOAD_SECRET ontbreekt of is te kort (min. 32 tekens). Zet hem in de Railway-omgeving.')
}

// Origins die credentialed admin/REST-calls mogen doen. In prod beperkt tot het eigen domein
// (CSRF-bescherming); lokaal staan we localhost + LAN-IP toe voor het tablet bij het veld.
const serverURL = process.env.PUBLIC_SERVER_URL || process.env.NEXT_PUBLIC_SERVER_URL || ''
const allowedOrigins = [
  serverURL,
  ...(process.env.NODE_ENV === 'production'
    ? []
    : ['http://localhost:3000', 'http://192.168.0.65:3000']),
].filter(Boolean)
// Productie (Postgres): schema via migraties (railway voert `payload migrate` uit bij deploy).
// Lokaal (SQLite): dev-push maakt het schema automatisch aan.
const db = isPostgres
  ? postgresAdapter({ pool: { connectionString: databaseUrl } })
  : sqliteAdapter({ client: { url: databaseUrl } })

export default buildConfig({
  admin: {
    user: Users.slug,
    // Gebruik het ingebouwde standaard-avatar i.p.v. Gravatar. Voorkomt de externe
    // gravatar.com-call die door tracking-preventie van browsers geblokkeerd wordt.
    avatar: 'default',
    importMap: {
      baseDir: path.resolve(dirname),
    },
    components: {
      beforeNavLinks: ['/components/admin/BackToSite#BackToSite'],
    },
  },
  collections: [
    Clubs,
    Teams,
    Players,
    Matches,
    MatchSheets,
    Officials,
    Accidents,
    CupFinals,
    Sanctions,
    Tournaments,
    TournamentMatches,
    Possessions,
    Throws,
    MatchEvents,
    Users,
    Media,
  ],
  globals: [Season, Settings],
  ...(serverURL ? { serverURL } : {}),
  // CSRF/CORS: enkel eigen origin(s) mogen credentialed admin/REST-calls doen.
  cors: allowedOrigins.length ? allowedOrigins : undefined,
  csrf: allowedOrigins,
  editor: lexicalEditor(),
  secret: payloadSecret,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db,
  sharp,
  plugins: [],
})
