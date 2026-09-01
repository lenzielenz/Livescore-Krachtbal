import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Herkomst op de worp: met de hand aangetekend, of afgespeeld uit de video-analyse.
//
// Zonder dit merk staat een uit video afgespeelde wedstrijd erbij als handwerk. Twee dingen gaan
// dan stil fout: de modelscore vergelijkt het model met zijn eigen voorstellen (en meldt altijd
// 100%), en niemand ziet nog dat de spelersnamen bij zo'n worp een gok waren.
//
// Bestaande worpen zijn met de hand aangetekend — zo werkte het tot nu toe.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_throws_bron" AS ENUM('manueel', 'video');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  ALTER TABLE "throws" ADD COLUMN IF NOT EXISTS "bron" "enum_throws_bron" DEFAULT 'manueel';
  UPDATE "throws" SET "bron" = 'manueel' WHERE "bron" IS NULL;
  CREATE INDEX IF NOT EXISTS "throws_bron_idx" ON "throws" ("bron");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "throws_bron_idx";
  ALTER TABLE "throws" DROP COLUMN IF EXISTS "bron";
  DROP TYPE IF EXISTS "public"."enum_throws_bron";`)
}
