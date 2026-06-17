import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Eindstand-bevestiging door de scheidsrechter (officieel federatie-record): group-veld
// `wedstrijdeinde` op match_sheets. Group-velden worden als aparte kolommen opgeslagen
// (zelfde patroon als `wedstrijdstart`).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matchsheets" ADD COLUMN IF NOT EXISTS "wedstrijdeinde_akkoord" boolean DEFAULT false;
  ALTER TABLE "matchsheets" ADD COLUMN IF NOT EXISTS "wedstrijdeinde_naam" varchar;
  ALTER TABLE "matchsheets" ADD COLUMN IF NOT EXISTS "wedstrijdeinde_tijdstip" timestamp(3) with time zone;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matchsheets" DROP COLUMN IF EXISTS "wedstrijdeinde_akkoord";
  ALTER TABLE "matchsheets" DROP COLUMN IF EXISTS "wedstrijdeinde_naam";
  ALTER TABLE "matchsheets" DROP COLUMN IF EXISTS "wedstrijdeinde_tijdstip";`)
}
