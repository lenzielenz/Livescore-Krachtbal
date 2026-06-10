import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Per kant een "bevestigd"-vlag op het wedstrijdblad: de club kan haar opstelling vergrendelen
// (duidelijk signaal "deze is af"), en weer ontgrendelen. Los van de blad-status.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matchsheets" ADD COLUMN IF NOT EXISTS "home_lineup_confirmed" boolean DEFAULT false;
  ALTER TABLE "matchsheets" ADD COLUMN IF NOT EXISTS "away_lineup_confirmed" boolean DEFAULT false;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matchsheets" DROP COLUMN IF EXISTS "home_lineup_confirmed";
  ALTER TABLE "matchsheets" DROP COLUMN IF EXISTS "away_lineup_confirmed";`)
}
