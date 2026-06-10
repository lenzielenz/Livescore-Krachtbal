import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// "Keuring bevestigd"-vlag op het wedstrijdblad: de scheidsrechter vergrendelt de materiële
// keuring zodra alles gecontroleerd is — duidelijk signaal voor iedereen dat ze in orde is.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matchsheets" ADD COLUMN IF NOT EXISTS "keuring_bevestigd" boolean DEFAULT false;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matchsheets" DROP COLUMN IF EXISTS "keuring_bevestigd";`)
}
