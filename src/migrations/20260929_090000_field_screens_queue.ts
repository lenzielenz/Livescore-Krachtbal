import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Wachtrij voor het volgende veld: terwijl een veldscherm bezet is door een lopende wedstrijd, kan
// de VOLGENDE wedstrijd zich via dezelfde koppelcode alvast klaarzetten (queuedMatch/queuedAt) —
// neemt automatisch over zodra de lopende wedstrijd afloopt. Zie collections/FieldScreens.ts en
// lib/field-screens-data.ts.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "field_screens" ADD COLUMN IF NOT EXISTS "queued_match_id" integer;
  ALTER TABLE "field_screens" ADD COLUMN IF NOT EXISTS "queued_at" timestamp(3) with time zone;

  ALTER TABLE "field_screens" ADD CONSTRAINT "field_screens_queued_match_id_matches_id_fk" FOREIGN KEY ("queued_match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "field_screens_queued_match_idx" ON "field_screens" USING btree ("queued_match_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "field_screens_queued_match_idx";
  ALTER TABLE "field_screens" DROP CONSTRAINT IF EXISTS "field_screens_queued_match_id_matches_id_fk";
  ALTER TABLE "field_screens" DROP COLUMN IF EXISTS "queued_at";
  ALTER TABLE "field_screens" DROP COLUMN IF EXISTS "queued_match_id";`)
}
