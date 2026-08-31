import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Twee wegen naar een analyse: manueel aantekenen of alles uit de video laten rekenen. De keuze
// staat op de wedstrijd zelf, want ze bepaalt welke stappen het voortgangsbord vraagt.
//
// Payload maakt voor een select-veld een enum-type aan; bestaande rijen krijgen 'manueel',
// want zo werkte élke analyse tot nu toe.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_matches_analyse_modus" AS ENUM('manueel', 'video');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "analyse_modus" "enum_matches_analyse_modus" DEFAULT 'manueel';
  UPDATE "matches" SET "analyse_modus" = 'manueel' WHERE "analyse_modus" IS NULL;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" DROP COLUMN IF EXISTS "analyse_modus";
  DROP TYPE IF EXISTS "public"."enum_matches_analyse_modus";`)
}
