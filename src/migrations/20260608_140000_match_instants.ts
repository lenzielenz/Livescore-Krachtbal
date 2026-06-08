import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Vluchtige foto-tribune: een upload-collectie 'match-instants' (foto, wedstrijd, auteur,
// auteursnaam, vervaltijd). Foto's verdwijnen automatisch (expiresAt) en zijn enkel op volwassen
// wedstrijden toegelaten (afgedwongen in de upload-route, niet in het schema). Schema volgt de
// bestaande upload-collectie 'media' en de manier waarop 'matchsheets' aan de schema is toegevoegd.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE "match_instants" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"match_id" integer NOT NULL,
  	"author_id" integer,
  	"author_name" varchar,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "match_instants_id" integer;

  ALTER TABLE "match_instants" ADD CONSTRAINT "match_instants_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "match_instants" ADD CONSTRAINT "match_instants_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

  CREATE INDEX "match_instants_match_idx" ON "match_instants" USING btree ("match_id");
  CREATE INDEX "match_instants_author_idx" ON "match_instants" USING btree ("author_id");
  CREATE INDEX "match_instants_expires_at_idx" ON "match_instants" USING btree ("expires_at");
  CREATE UNIQUE INDEX "match_instants_filename_idx" ON "match_instants" USING btree ("filename");
  CREATE INDEX "match_instants_updated_at_idx" ON "match_instants" USING btree ("updated_at");
  CREATE INDEX "match_instants_created_at_idx" ON "match_instants" USING btree ("created_at");

  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_match_instants_fk" FOREIGN KEY ("match_instants_id") REFERENCES "public"."match_instants"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_match_instants_id_idx" ON "payload_locked_documents_rels" USING btree ("match_instants_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_match_instants_fk";
  DROP INDEX "payload_locked_documents_rels_match_instants_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "match_instants_id";
  DROP TABLE "match_instants" CASCADE;`)
}
