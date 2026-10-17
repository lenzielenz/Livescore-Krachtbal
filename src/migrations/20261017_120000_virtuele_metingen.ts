import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Hoe vlot het virtuele stadion loopt: één anoniem record per bezoek (zie
// collections/VirtueleMetingen.ts en lib/virtueel-meting.ts).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "virtuele_metingen" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"sessie" varchar,
  	"gpu" varchar,
  	"licht" boolean,
  	"duur" numeric,
  	"fps" numeric,
  	"data" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "virtuele_metingen_id" integer;

  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_virtuele_metingen_fk" FOREIGN KEY ("virtuele_metingen_id") REFERENCES "public"."virtuele_metingen"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE INDEX IF NOT EXISTS "virtuele_metingen_sessie_idx" ON "virtuele_metingen" USING btree ("sessie");
  CREATE INDEX IF NOT EXISTS "virtuele_metingen_updated_at_idx" ON "virtuele_metingen" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "virtuele_metingen_created_at_idx" ON "virtuele_metingen" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_virtuele_metingen_id_idx" ON "payload_locked_documents_rels" USING btree ("virtuele_metingen_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_virtuele_metingen_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_virtuele_metingen_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "virtuele_metingen_id";
  DROP TABLE IF EXISTS "virtuele_metingen" CASCADE;`)
}
