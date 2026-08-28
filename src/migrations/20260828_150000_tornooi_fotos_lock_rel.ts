import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Hotfix op 20260828_130000_tornooi_fotos: elke nieuwe collectie hoort óók een relatiekolom in
// payload_locked_documents_rels te krijgen (zie bv. processed_ops). Die ontbrak, waardoor élke
// bewerking die Payloads document-lock raakt (bv. een veld toewijzen aan een tornooiwedstrijd)
// in productie crashte op de onbestaande kolom "tornooi_fotos_id".
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "tornooi_fotos_id" integer;
  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tornooi_fotos_fk" FOREIGN KEY ("tornooi_fotos_id") REFERENCES "public"."tornooi_fotos"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_tornooi_fotos_id_idx" ON "payload_locked_documents_rels" USING btree ("tornooi_fotos_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_tornooi_fotos_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_tornooi_fotos_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "tornooi_fotos_id";`)
}
