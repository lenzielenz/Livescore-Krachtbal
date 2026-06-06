import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Training krijgt een reeks/leeftijdsgroep (U12, U14, dames, heren …) zodat je de aanwezigheid
// per groep kan bekijken. Leeg = clubbreed (bestaande trainingen).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TYPE "public"."enum_trainingen_reeks" AS ENUM('1NAH', '1NAHB', '1NAD', '2NAH', '2NAHB', 'LH', 'LD', 'RHA', 'RHB', 'RDA', 'RDB', 'U18J', 'U18M', 'U16J', 'U16M', 'U14J', 'U14M', 'U12', 'recreatief', 'beker', 'andere');
  ALTER TABLE "trainingen" ADD COLUMN "reeks" "enum_trainingen_reeks";
  CREATE INDEX "trainingen_reeks_idx" ON "trainingen" USING btree ("reeks");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "trainingen_reeks_idx";
  ALTER TABLE "trainingen" DROP COLUMN IF EXISTS "reeks";
  DROP TYPE "public"."enum_trainingen_reeks";`)
}
