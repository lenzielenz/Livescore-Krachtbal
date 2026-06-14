import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Voorspel-poll persistent: bewaar de live "wie wint?"-stemmen (home/draw/away) op de wedstrijd,
// zodat ze niet verdwijnen bij een refresh of herstart. Het live-kanaal (src/lib/match-channel.ts)
// hydrateert hieruit en schrijft terug.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "live_poll" jsonb;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" DROP COLUMN IF EXISTS "live_poll";`)
}
