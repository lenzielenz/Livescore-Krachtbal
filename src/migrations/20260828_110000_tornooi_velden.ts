import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Dagprogramma per tornooidag: het evenement krijgt een aantal velden en elke wedstrijd kan aan
// een veld toegewezen worden — het programma-overzicht toont per veld wat er speelt/komt.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "veld_count" numeric;
  ALTER TABLE "tournament_matches" ADD COLUMN IF NOT EXISTS "veld" numeric;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "tournaments" DROP COLUMN IF EXISTS "veld_count";
  ALTER TABLE "tournament_matches" DROP COLUMN IF EXISTS "veld";`)
}
