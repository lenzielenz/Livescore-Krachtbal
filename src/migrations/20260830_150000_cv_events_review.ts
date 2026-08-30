import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Review-velden op cv_events (fase 1 van de computer-vision-pipeline): 'verdict' — het menselijke
// oordeel via PATCH /api/cv/events/[id] (bevestigd/afgewezen, leeg = nog te reviewen) — en
// 'worp_type_origineel' — de claim van het model, bevroren bij aanmaak zodat retraining "model
// zei X, mens zei Y" kan vergelijken. Idempotent raw-SQL naar het huis-patroon van
// 20260830_120000_cv_events; enum-namen volgen de Payload-conventie (enum_<tabel>_<veld>).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_cv_events_verdict" AS ENUM('bevestigd', 'afgewezen');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_cv_events_worp_type_origineel" AS ENUM('nek', 'rug');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`)

  await db.execute(sql`
  ALTER TABLE "cv_events" ADD COLUMN IF NOT EXISTS "verdict" "public"."enum_cv_events_verdict";
  ALTER TABLE "cv_events" ADD COLUMN IF NOT EXISTS "worp_type_origineel" "public"."enum_cv_events_worp_type_origineel";
  CREATE INDEX IF NOT EXISTS "cv_events_verdict_idx" ON "cv_events" USING btree ("verdict");`)

  // Backfill: voorstellen die vóór deze deploy binnenkwamen dragen in worp_type nog exact de
  // ongewijzigde modelclaim (de PATCH bestond nog niet en aanmaken kan enkel via de POST-route).
  // Zonder deze stap zou een latere correctie op zo'n oud voorstel "model zei X" voorgoed wissen.
  // De reviewed=false-guard maakt een her-run onschadelijk voor al gecorrigeerde rijen.
  //
  // De cast via text is nodig, niet cosmetisch: worp_type en worp_type_origineel zijn twee
  // afzonderlijke enum-types (Payload maakt er één per veld), en Postgres weigert een waarde
  // van het ene enum-type rechtstreeks in een kolom van het andere te zetten. Zonder cast
  // faalt deze migratie — en daarmee de hele deploy. Op SQLite (lokaal) is dat onzichtbaar.
  await db.execute(sql`
  UPDATE "cv_events"
  SET "worp_type_origineel" = "worp_type"::text::"public"."enum_cv_events_worp_type_origineel"
  WHERE "worp_type_origineel" IS NULL AND "reviewed" = false;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "cv_events_verdict_idx";
  ALTER TABLE "cv_events" DROP COLUMN IF EXISTS "verdict";
  ALTER TABLE "cv_events" DROP COLUMN IF EXISTS "worp_type_origineel";
  DROP TYPE IF EXISTS "public"."enum_cv_events_verdict";
  DROP TYPE IF EXISTS "public"."enum_cv_events_worp_type_origineel";`)
}
