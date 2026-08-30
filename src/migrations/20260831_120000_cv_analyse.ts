import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Server-side video-analyse: de aangeklikte veldkalibratie (cv_kalibratie) en de stand van de
// analysetaak (cv_analyse). Beide json, beheerd via /api/cv/match/[id]/…; idempotent raw-SQL.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "cv_kalibratie" jsonb;
  ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "cv_analyse" jsonb;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" DROP COLUMN IF EXISTS "cv_kalibratie";
  ALTER TABLE "matches" DROP COLUMN IF EXISTS "cv_analyse";`)
}
