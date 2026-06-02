import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Forfait (FF)-uitslag op het wedstrijdblad: welke ploeg gaf forfait. De niet-forfaiterende
// ploeg wint; bij dubbel forfait verliezen beide. Aangeduid door de scheidsrechter.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TYPE "public"."enum_matchsheets_forfait_uitslag" AS ENUM('geen', 'thuis', 'uit', 'dubbel');
  ALTER TABLE "matchsheets" ADD COLUMN "forfait_uitslag" "enum_matchsheets_forfait_uitslag" DEFAULT 'geen';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matchsheets" DROP COLUMN "forfait_uitslag";
  DROP TYPE "public"."enum_matchsheets_forfait_uitslag";`)
}
