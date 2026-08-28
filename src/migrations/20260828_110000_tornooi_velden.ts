import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Dagprogramma per tornooidag: het evenement krijgt een aantal velden en elke wedstrijd kan aan
// een veld toegewezen worden — het programma-overzicht toont per veld wat er speelt/komt.
// Elke categorie kan bovendien een eigen wedstrijdduur krijgen (minuten per helft, bv. 2×10).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "veld_count" numeric;
  ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "half_minutes" numeric;
  ALTER TABLE "tournament_matches" ADD COLUMN IF NOT EXISTS "veld" numeric;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "tournaments" DROP COLUMN IF EXISTS "veld_count";
  ALTER TABLE "tournaments" DROP COLUMN IF EXISTS "half_minutes";
  ALTER TABLE "tournament_matches" DROP COLUMN IF EXISTS "veld";`)
}
