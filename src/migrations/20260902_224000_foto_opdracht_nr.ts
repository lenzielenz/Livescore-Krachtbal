import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Het hoeveelste van de vijftig een foto beantwoordde, voor die ene inzender op die ene dag.
//
// Hierop berust de voortgang: de volgende opdracht van een deelnemer is die van zijn hoogste
// nummer + 1. Voordien stond die voortgang in de localStorage van één toestel — wie op zijn
// tablet keek begon opnieuw, en wie zijn browsergeschiedenis wiste ook.
//
// Bestaande foto's houden NULL. Dat is het juiste antwoord en geen gat: hun inzender begint dan
// gewoon vooraan in zijn eigen geschudde reeks, en de opdrachttekst die toen gold staat nog
// altijd in `opdracht`.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "tornooi_fotos" ADD COLUMN IF NOT EXISTS "opdracht_nr" numeric;
  CREATE INDEX IF NOT EXISTS "tornooi_fotos_opdracht_nr_idx" ON "tornooi_fotos" USING btree ("opdracht_nr");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "tornooi_fotos_opdracht_nr_idx";
  ALTER TABLE "tornooi_fotos" DROP COLUMN IF EXISTS "opdracht_nr";`)
}
