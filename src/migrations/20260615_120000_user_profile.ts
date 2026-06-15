import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Eigen profiel per gebruiker: profielfoto (relatie naar media) + bijsnijden (zoom/verschuiving,
// zelfde model als clublogo's) en de eigen speelpositie. Zo kan elk lid zijn profiel/scorecard
// zelf samenstellen. De enum-waarden lopen gelijk met POSITION_OPTIONS (incl. legacy "vleugel").
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_users_position" AS ENUM('achter', 'vleugel-links', 'vleugel-rechts', 'barage', 'vleugel');
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "photo_id" integer;
  ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "photo_zoom" numeric DEFAULT 1;
  ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "photo_offset_x" numeric DEFAULT 0;
  ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "photo_offset_y" numeric DEFAULT 0;
  ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "position" "enum_users_position";

  DO $$ BEGIN
    ALTER TABLE "users" ADD CONSTRAINT "users_photo_id_media_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE INDEX IF NOT EXISTS "users_photo_idx" ON "users" USING btree ("photo_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_photo_id_media_id_fk";
  DROP INDEX IF EXISTS "users_photo_idx";
  ALTER TABLE "users" DROP COLUMN IF EXISTS "photo_id";
  ALTER TABLE "users" DROP COLUMN IF EXISTS "photo_zoom";
  ALTER TABLE "users" DROP COLUMN IF EXISTS "photo_offset_x";
  ALTER TABLE "users" DROP COLUMN IF EXISTS "photo_offset_y";
  ALTER TABLE "users" DROP COLUMN IF EXISTS "position";
  DROP TYPE IF EXISTS "public"."enum_users_position";`)
}
