import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Eigen doelpunt (§6.6): een bal die in het EIGEN doelgebied aan de grond komt, is een doelpunt
// voor de tegenpartij. Dat was tot nu toe geen aparte uitkomst — zo'n tik werd als 'in_field'
// afgedaan en telde dus niet mee. Nieuwe enum-waarde op de worpen én op het balbezit.
//
// Postgres kan een enum-waarde niet verwijderen; de down-migratie zet daarom enkel de gegevens
// terug op een bestaande waarde en laat het type ongemoeid (anders zou ze kunnen falen op rijen
// die de waarde nog gebruiken).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TYPE "public"."enum_throws_outcome" ADD VALUE IF NOT EXISTS 'own_goal' AFTER 'goal';
  ALTER TYPE "public"."enum_possessions_end_outcome" ADD VALUE IF NOT EXISTS 'own_goal' AFTER 'goal';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  UPDATE "throws" SET "outcome" = 'in_field' WHERE "outcome" = 'own_goal';
  UPDATE "possessions" SET "end_outcome" = 'throws_exhausted' WHERE "end_outcome" = 'own_goal';`)
}
