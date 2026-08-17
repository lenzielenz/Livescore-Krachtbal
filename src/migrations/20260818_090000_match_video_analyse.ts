import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Video-analyse per wedstrijd: de opname (YouTube-link of direct videobestand) plus één ijkpunt per
// helft — op welke seconde in de video staat de aftrap? Daarmee springt de analysepagina van elk
// doelpunt/worp naar het juiste beeld (zie src/lib/video-sync.ts). Drie kolommen, allemaal optioneel.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "video_url" varchar;
  ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "video_offset_h1" numeric;
  ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "video_offset_h2" numeric;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" DROP COLUMN IF EXISTS "video_url";
  ALTER TABLE "matches" DROP COLUMN IF EXISTS "video_offset_h1";
  ALTER TABLE "matches" DROP COLUMN IF EXISTS "video_offset_h2";`)
}
