import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Audit-trail + PDF-archief (AUDIT-2026-06.md follow-ups):
// - throws.created_by_id / match_events.created_by_id: WIE registreerde elke score-mutatie.
// - matchsheets.pdf_id: het ingediende officiële wedstrijdblad als opgeslagen media (archief).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "throws" ADD COLUMN "created_by_id" integer;
  ALTER TABLE "throws" ADD CONSTRAINT "throws_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "throws_created_by_idx" ON "throws" USING btree ("created_by_id");

  ALTER TABLE "match_events" ADD COLUMN "created_by_id" integer;
  ALTER TABLE "match_events" ADD CONSTRAINT "match_events_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "match_events_created_by_idx" ON "match_events" USING btree ("created_by_id");

  ALTER TABLE "matchsheets" ADD COLUMN "pdf_id" integer;
  ALTER TABLE "matchsheets" ADD CONSTRAINT "matchsheets_pdf_id_media_id_fk" FOREIGN KEY ("pdf_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "matchsheets_pdf_idx" ON "matchsheets" USING btree ("pdf_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "matchsheets_pdf_idx";
  ALTER TABLE "matchsheets" DROP CONSTRAINT IF EXISTS "matchsheets_pdf_id_media_id_fk";
  ALTER TABLE "matchsheets" DROP COLUMN "pdf_id";

  DROP INDEX IF EXISTS "match_events_created_by_idx";
  ALTER TABLE "match_events" DROP CONSTRAINT IF EXISTS "match_events_created_by_id_users_id_fk";
  ALTER TABLE "match_events" DROP COLUMN "created_by_id";

  DROP INDEX IF EXISTS "throws_created_by_idx";
  ALTER TABLE "throws" DROP CONSTRAINT IF EXISTS "throws_created_by_id_users_id_fk";
  ALTER TABLE "throws" DROP COLUMN "created_by_id";`)
}
