import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Twee camera's per wedstrijd + vanger-attributie + tracking-toewijzing.
//
// Een veld van 46 m past zelden in één beeld: er wordt vaak met twee toestellen gefilmd, elk op
// één kant. Op matches komen daarvoor de tweede opname (video2_url), haar tijdsverschil met
// camera 1 (video2_offset_s — negatief mag, camera 2 kan later gestart zijn), een eigen
// kalibratie (cv_kalibratie2) en de toewijzing tracking-spoor → speler (cv_sporen, voor de
// fysieke stats). Op cv_events komt de camera die het voorstel zag (review-frames uit het juiste
// beeld) en de vanger (ploeg + rugnummer) — eigen kolommen, want side/rugnummer zijn van de
// werper. Idempotent raw-SQL naar het huis-patroon.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "video2_url" varchar;
  ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "video2_offset_s" numeric;
  ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "cv_kalibratie2" jsonb;
  ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "cv_sporen" jsonb;`)

  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_cv_events_vanger_side" AS ENUM('home', 'away');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  ALTER TABLE "cv_events" ADD COLUMN IF NOT EXISTS "camera" numeric DEFAULT 1;
  ALTER TABLE "cv_events" ADD COLUMN IF NOT EXISTS "beide_cameras" boolean DEFAULT false;
  ALTER TABLE "cv_events" ADD COLUMN IF NOT EXISTS "vanger_side" "public"."enum_cv_events_vanger_side";
  ALTER TABLE "cv_events" ADD COLUMN IF NOT EXISTS "vanger_rugnummer" numeric;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "cv_events" DROP COLUMN IF EXISTS "vanger_rugnummer";
  ALTER TABLE "cv_events" DROP COLUMN IF EXISTS "vanger_side";
  ALTER TABLE "cv_events" DROP COLUMN IF EXISTS "beide_cameras";
  ALTER TABLE "cv_events" DROP COLUMN IF EXISTS "camera";
  DROP TYPE IF EXISTS "public"."enum_cv_events_vanger_side";
  ALTER TABLE "matches" DROP COLUMN IF EXISTS "cv_sporen";
  ALTER TABLE "matches" DROP COLUMN IF EXISTS "cv_kalibratie2";
  ALTER TABLE "matches" DROP COLUMN IF EXISTS "video2_offset_s";
  ALTER TABLE "matches" DROP COLUMN IF EXISTS "video2_url";`)
}
