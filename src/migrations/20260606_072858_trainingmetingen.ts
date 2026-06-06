import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Enkel de nieuwe trainingmetingen-tabel. (De auto-gegenereerde diff bevatte ook al-toegepaste
// wijzigingen omdat de snapshot-json's sinds 'wedstrijdblad' niet meer bijgewerkt waren; die zijn
// hier verwijderd zodat deze migratie idempotent samenwerkt met de bestaande migraties. De
// meegeleverde .json-snapshot is wél de volledige, correcte schema-staat voor latere diffs.)
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE "trainingmetingen" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"speler_id" integer NOT NULL,
  	"datum" timestamp(3) with time zone NOT NULL,
  	"snelheid_vooruit" numeric,
  	"snelheid_achteruit" numeric,
  	"worp4" numeric,
  	"worp9" numeric,
  	"worp18" numeric,
  	"notitie" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "trainingmetingen_id" integer;
  ALTER TABLE "trainingmetingen" ADD CONSTRAINT "trainingmetingen_speler_id_players_id_fk" FOREIGN KEY ("speler_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "trainingmetingen_speler_idx" ON "trainingmetingen" USING btree ("speler_id");
  CREATE INDEX "trainingmetingen_updated_at_idx" ON "trainingmetingen" USING btree ("updated_at");
  CREATE INDEX "trainingmetingen_created_at_idx" ON "trainingmetingen" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_trainingmetingen_fk" FOREIGN KEY ("trainingmetingen_id") REFERENCES "public"."trainingmetingen"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_trainingmetingen_id_idx" ON "payload_locked_documents_rels" USING btree ("trainingmetingen_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_trainingmetingen_fk";
  DROP INDEX "payload_locked_documents_rels_trainingmetingen_id_idx";
  ALTER TABLE "trainingmetingen" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "trainingmetingen" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "trainingmetingen_id";`)
}
