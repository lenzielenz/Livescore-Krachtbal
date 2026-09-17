import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Nieuwe collection 'field-screens' (veldschermen): één record per fysiek veld/scherm bij een
// club, met een roterende koppelcode en een optionele link naar de wedstrijd die er nu op staat.
// Zie collections/FieldScreens.ts.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE "field_screens" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"club_id" integer,
  	"naam" varchar NOT NULL,
  	"pairing_code" varchar,
  	"paired_match_id" integer,
  	"paired_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "field_screens_id" integer;

  CREATE INDEX "field_screens_club_idx" ON "field_screens" USING btree ("club_id");
  CREATE INDEX "field_screens_paired_match_idx" ON "field_screens" USING btree ("paired_match_id");
  CREATE INDEX "field_screens_updated_at_idx" ON "field_screens" USING btree ("updated_at");
  CREATE INDEX "field_screens_created_at_idx" ON "field_screens" USING btree ("created_at");

  ALTER TABLE "field_screens" ADD CONSTRAINT "field_screens_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "field_screens" ADD CONSTRAINT "field_screens_paired_match_id_matches_id_fk" FOREIGN KEY ("paired_match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;

  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_field_screens_fk" FOREIGN KEY ("field_screens_id") REFERENCES "public"."field_screens"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_field_screens_id_idx" ON "payload_locked_documents_rels" USING btree ("field_screens_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_field_screens_fk";
  DROP INDEX "payload_locked_documents_rels_field_screens_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "field_screens_id";

  DROP TABLE "field_screens" CASCADE;`)
}
