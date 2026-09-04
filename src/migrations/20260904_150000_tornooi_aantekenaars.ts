import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Auditspoor op tornooiwedstrijden: wie tekende ze aan, en wie sloot ze af.
//
// Uit de doelpunten valt niet te herleiden wie ze intikte, dus is dit een echt feit dat bewaard
// moet worden — geen afgeleide staat. Twee json-kolommen: de lijst van aantekenaars en de ene
// persoon die het eindsignaal gaf (zie src/lib/aantekenaars.ts). Idempotent raw-SQL naar het
// huis-patroon.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "tournament_matches" ADD COLUMN IF NOT EXISTS "aantekenaars" jsonb;
  ALTER TABLE "tournament_matches" ADD COLUMN IF NOT EXISTS "afgesloten_door" jsonb;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "tournament_matches" DROP COLUMN IF EXISTS "aantekenaars";
  ALTER TABLE "tournament_matches" DROP COLUMN IF EXISTS "afgesloten_door";`)
}
