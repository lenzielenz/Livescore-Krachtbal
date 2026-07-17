import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Aantekenmodus centraliseren: één knop voor ALLE wedstrijden i.p.v. per wedstrijd.
// De per-wedstrijd kolom (matches.score_mode, uit de vorige stap) verdwijnt; in de plaats
// komt één globale instelling settings.score_mode ('federatie' | 'supporters').
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" DROP COLUMN IF EXISTS "score_mode";
  DROP TYPE IF EXISTS "public"."enum_matches_score_mode";
  CREATE TYPE "public"."enum_settings_score_mode" AS ENUM('federatie', 'supporters');
  ALTER TABLE "settings" ADD COLUMN "score_mode" "enum_settings_score_mode" DEFAULT 'federatie';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "settings" DROP COLUMN IF EXISTS "score_mode";
  DROP TYPE IF EXISTS "public"."enum_settings_score_mode";
  CREATE TYPE "public"."enum_matches_score_mode" AS ENUM('federatie', 'supporters');
  ALTER TABLE "matches" ADD COLUMN "score_mode" "enum_matches_score_mode" DEFAULT 'federatie';`)
}
