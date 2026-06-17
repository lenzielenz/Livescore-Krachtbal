import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Idempotentie-logboek 'processed-ops' (offline-hardening): per aantekenaar-actie één opId met de
// bewaarde response, zodat een herverzonden actie (offline-wachtrij, at-least-once) niet dubbel
// wordt toegepast. Schema volgens dezelfde aanpak als eerdere collecties: de tabel, de FK naar
// matches, de (unieke) indexen en de relatie-kolom in payload_locked_documents_rels.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE "processed_ops" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"match_id" integer NOT NULL,
  	"op_id" varchar NOT NULL,
  	"response" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "processed_ops_id" integer;

  ALTER TABLE "processed_ops" ADD CONSTRAINT "processed_ops_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;

  CREATE UNIQUE INDEX "processed_ops_op_id_idx" ON "processed_ops" USING btree ("op_id");
  CREATE INDEX "processed_ops_match_idx" ON "processed_ops" USING btree ("match_id");
  CREATE INDEX "processed_ops_updated_at_idx" ON "processed_ops" USING btree ("updated_at");
  CREATE INDEX "processed_ops_created_at_idx" ON "processed_ops" USING btree ("created_at");

  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_processed_ops_fk" FOREIGN KEY ("processed_ops_id") REFERENCES "public"."processed_ops"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_processed_ops_id_idx" ON "payload_locked_documents_rels" USING btree ("processed_ops_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_processed_ops_fk";
  DROP INDEX "payload_locked_documents_rels_processed_ops_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "processed_ops_id";
  DROP TABLE "processed_ops" CASCADE;`)
}
