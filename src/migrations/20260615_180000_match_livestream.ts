import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Optionele live-uitzending per wedstrijd: een link naar de externe stream (YouTube/Facebook/Twitch),
// zodat supporters de wedstrijd live op de wedstrijdpagina kunnen volgen. Eén tekstkolom.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "livestream_url" varchar;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" DROP COLUMN IF EXISTS "livestream_url";`)
}
