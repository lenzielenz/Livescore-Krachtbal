import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Nieuwe trainingdoelen-tabel: streefwaarde per speler/meetwaarde. Enkel de nieuwe objecten
// (de snapshot-json's lopen achter sinds 'wedstrijdblad', vandaar handmatig getrimd).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TYPE "public"."enum_trainingdoelen_metriek" AS ENUM('snelheidVooruit', 'snelheidAchteruit', 'worp4', 'worp9', 'worp18');
  CREATE TABLE "trainingdoelen" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"speler_id" integer NOT NULL,
  	"metriek" "enum_trainingdoelen_metriek" NOT NULL,
  	"doel" numeric NOT NULL,
  	"notitie" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "trainingdoelen_id" integer;
  ALTER TABLE "trainingdoelen" ADD CONSTRAINT "trainingdoelen_speler_id_players_id_fk" FOREIGN KEY ("speler_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "trainingdoelen_speler_idx" ON "trainingdoelen" USING btree ("speler_id");
  CREATE INDEX "trainingdoelen_updated_at_idx" ON "trainingdoelen" USING btree ("updated_at");
  CREATE INDEX "trainingdoelen_created_at_idx" ON "trainingdoelen" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_trainingdoelen_fk" FOREIGN KEY ("trainingdoelen_id") REFERENCES "public"."trainingdoelen"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_trainingdoelen_id_idx" ON "payload_locked_documents_rels" USING btree ("trainingdoelen_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_trainingdoelen_fk";
  DROP INDEX "payload_locked_documents_rels_trainingdoelen_id_idx";
  ALTER TABLE "trainingdoelen" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "trainingdoelen" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "trainingdoelen_id";
  DROP TYPE "public"."enum_trainingdoelen_metriek";`)
}
