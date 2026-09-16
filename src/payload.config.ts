import { postgresAdapter } from '@payloadcms/db-postgres'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { TornooiFotos } from './collections/TornooiFotos'
import { Clubs } from './collections/Clubs'
import { Teams } from './collections/Teams'
import { Players } from './collections/Players'
import { Matches } from './collections/Matches'
import { Possessions } from './collections/Possessions'
import { Throws } from './collections/Throws'
import { MatchEvents } from './collections/MatchEvents'
import { MatchInstants } from './collections/MatchInstants'
import { Officials } from './collections/Officials'
import { MatchSheets } from './collections/MatchSheets'
import { Accidents } from './collections/Accidents'
import { CupFinals } from './collections/CupFinals'
import { Sanctions } from './collections/Sanctions'
import { Tournaments } from './collections/Tournaments'
import { TournamentMatches } from './collections/TournamentMatches'
import { Trainingmetingen } from './collections/Trainingmetingen'
import { Trainingdoelen } from './collections/Trainingdoelen'
import { Trainingen } from './collections/Trainingen'
import { Oefeningen } from './collections/Oefeningen'
import { Sessiesjablonen } from './collections/Sessiesjablonen'
import { PushSubscriptions } from './collections/PushSubscriptions'
import { Advertenties } from './collections/Advertenties'
import { News } from './collections/News'
import { Ideas } from './collections/Ideas'
import { IdeaScreenshots } from './collections/IdeaScreenshots'
import { MatchMvpVotes } from './collections/MatchMvpVotes'
import { ProcessedOps } from './collections/ProcessedOps'
import { CvEvents } from './collections/CvEvents'
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

// CSRF/CORS-beperking is OPT-IN via PUBLIC_SERVER_URL: enkel wanneer het productiedomein
// expliciet gezet is, vergrendelen we credentialed admin/REST-calls tot dat domein. Zonder die
// env-var laten we Payload z'n standaard (same-origin) gedrag staan — anders breekt de admin-login
// lokaal en op een nog-niet-geconfigureerde deploy.
const serverURL = process.env.PUBLIC_SERVER_URL || process.env.NEXT_PUBLIC_SERVER_URL || ''
const originConfig = serverURL ? { serverURL, cors: [serverURL], csrf: [serverURL] } : {}
// Productie (Postgres): schema via migraties (railway voert `payload migrate` uit bij deploy).
// Lokaal (SQLite): dev-push maakt het schema automatisch aan.
//
// Harde tijdslimieten op de pool. Zónder deze wacht een geblokkeerde query ONEINDIG: laat een
// afgebroken migratie ooit een lock op een tabel achter, dan blijft élke paginalading die de tabel
// raakt eeuwig hangen — de site "laadt" maar de response eindigt nooit. Met deze grenzen faalt zo'n
// query snel en zichtbaar, en ruimt Postgres een achtergebleven transactie zélf op:
//  - statement_timeout (30s): een enkele query mag max 30s duren (normaal: milliseconden).
//  - lock_timeout (10s): max 10s wachten op een lock i.p.v. oneindig — vangt lock-strijd bij een
//    rolling deploy (precies wat de FK-migratie deed hangen: die was na 10s gefaald i.p.v. te hangen).
//  - idle_in_transaction_session_timeout (60s): dood een transactie die 60s "idle in transaction"
//    blijft hangen — net de zombie die een gecrashte migratie achterlaat → locks komen vanzelf vrij.
// LET OP: migraties draaien op dezelfde pool; houd elke migratie ruim onder statement_timeout.
const db = isPostgres
  ? postgresAdapter({
      pool: {
        connectionString: databaseUrl,
        statement_timeout: 30_000,
        lock_timeout: 10_000,
        idle_in_transaction_session_timeout: 60_000,
      },
    })
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
    TornooiFotos,
    Trainingmetingen,
    Trainingdoelen,
    Trainingen,
    Oefeningen,
    Sessiesjablonen,
    Possessions,
    Throws,
    MatchEvents,
    MatchInstants,
    Users,
    Media,
    PushSubscriptions,
    Advertenties,
    News,
    Ideas,
    IdeaScreenshots,
    MatchMvpVotes,
    ProcessedOps,
    CvEvents,
  ],
  globals: [Season, Settings],
  /**
   * GraphQL staat uit.
   *
   * Niets in dit project bevraagt het — de app praat met Payload via de Local API en met de eigen
   * routes onder /api. Wat er wél stond, was een tweede publieke deur naar élke operatie: Payload
   * genereert voor een auth-collectie onder meer de ongeauthenticeerde mutaties
   * `forgotPasswordUser` en `resetPasswordUser`. Die omzeilden de afscherming in src/middleware.ts
   * volledig — dus zonder rate limit, zonder de minimumlengte van acht tekens en zonder het
   * intrekken van sessies. Eén ongeauthenticeerde POST volstond om de herstellink die een beheerder
   * net had doorgestuurd ongeldig te maken, eindeloos herhaalbaar.
   *
   * De routebestanden onder src/app/(payload)/api/graphql* zijn mee verwijderd: die vlag hier is de
   * gordel, de verwijderde route de bretellen.
   */
  graphQL: { disable: true },
  // serverURL + cors/csrf enkel wanneer PUBLIC_SERVER_URL gezet is (zie hierboven).
  ...originConfig,
  editor: lexicalEditor(),
  secret: payloadSecret,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db,
  sharp,
  plugins: [],
})
