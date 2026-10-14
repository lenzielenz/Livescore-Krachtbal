import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// De graffitimuur van het virtuele stadion: een nieuwe collectie 'graffiti_tags' (club, maker, naam,
// streken als jsonb), plus de relatie-kolom in payload_locked_documents_rels. Zie
// collections/GraffitiTags.ts.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "graffiti_tags" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"club_id" integer,
  	"author_id" integer,
  	"author_name" varchar,
  	"strokes" jsonb NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "graffiti_tags_id" integer;

  ALTER TABLE "graffiti_tags" ADD CONSTRAINT "graffiti_tags_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "graffiti_tags" ADD CONSTRAINT "graffiti_tags_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

  CREATE INDEX IF NOT EXISTS "graffiti_tags_club_idx" ON "graffiti_tags" USING btree ("club_id");
  CREATE INDEX IF NOT EXISTS "graffiti_tags_author_idx" ON "graffiti_tags" USING btree ("author_id");
  CREATE INDEX IF NOT EXISTS "graffiti_tags_updated_at_idx" ON "graffiti_tags" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "graffiti_tags_created_at_idx" ON "graffiti_tags" USING btree ("created_at");

  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_graffiti_tags_fk" FOREIGN KEY ("graffiti_tags_id") REFERENCES "public"."graffiti_tags"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_graffiti_tags_id_idx" ON "payload_locked_documents_rels" USING btree ("graffiti_tags_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_graffiti_tags_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_graffiti_tags_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "graffiti_tags_id";
  DROP TABLE IF EXISTS "graffiti_tags" CASCADE;`)
}
