import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Live tribune persistent: bewaar de emoji-tellers en supporter-shoutouts op de wedstrijd,
// zodat ze niet verdwijnen wanneer (even) niemand kijkt of de server herstart. Het in-memory
// live-kanaal (src/lib/match-channel.ts) hydrateert hieruit en schrijft terug.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" ADD COLUMN "live_reactions" jsonb;
  ALTER TABLE "matches" ADD COLUMN "live_shoutouts" jsonb;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" DROP COLUMN "live_reactions";
  ALTER TABLE "matches" DROP COLUMN "live_shoutouts";`)
}
