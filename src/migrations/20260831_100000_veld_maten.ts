import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Echte terreinmaten per wedstrijd: opgemeten veldbreedte en speelveldlengte (tussen de
// doellijnen). Leeg = reglementair 14 m / 26 m. Samen met de bestaande doelgebied-diepte weet
// het platform dan de echte lengtes en breedtes, en kloppen afstand en landingspunt in meters —
// ook op niet-reglementaire terreinen (jeugdvelden, krappe zalen). Idempotent raw-SQL.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "veld_breedte" numeric;
  ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "veld_speelveld" numeric;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" DROP COLUMN IF EXISTS "veld_breedte";
  ALTER TABLE "matches" DROP COLUMN IF EXISTS "veld_speelveld";`)
}
