import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Het virtuele stadion: een nieuwe collectie 'virtuele_sporen' (wat bezoekers achterlaten, zie
// collections/VirtueleSporen.ts), en op de graffitimuur een kolom 'wall' (de muur aan de
// kleedkamer of die in de speelhal op -1). Bestaande tags horen bij de kleedkamer.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "virtuele_sporen" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"club_id" integer,
  	"soort" varchar NOT NULL,
  	"author_id" integer,
  	"author_name" varchar,
  	"waarde" jsonb NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "virtuele_sporen_id" integer;

  ALTER TABLE "virtuele_sporen" ADD CONSTRAINT "virtuele_sporen_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "virtuele_sporen" ADD CONSTRAINT "virtuele_sporen_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

  CREATE INDEX IF NOT EXISTS "virtuele_sporen_club_idx" ON "virtuele_sporen" USING btree ("club_id");
  CREATE INDEX IF NOT EXISTS "virtuele_sporen_soort_idx" ON "virtuele_sporen" USING btree ("soort");
  CREATE INDEX IF NOT EXISTS "virtuele_sporen_author_idx" ON "virtuele_sporen" USING btree ("author_id");
  CREATE INDEX IF NOT EXISTS "virtuele_sporen_updated_at_idx" ON "virtuele_sporen" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "virtuele_sporen_created_at_idx" ON "virtuele_sporen" USING btree ("created_at");

  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_virtuele_sporen_fk" FOREIGN KEY ("virtuele_sporen_id") REFERENCES "public"."virtuele_sporen"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_virtuele_sporen_id_idx" ON "payload_locked_documents_rels" USING btree ("virtuele_sporen_id");

  ALTER TABLE "graffiti_tags" ADD COLUMN IF NOT EXISTS "wall" varchar DEFAULT 'kleedkamer';
  CREATE INDEX IF NOT EXISTS "graffiti_tags_wall_idx" ON "graffiti_tags" USING btree ("wall");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "graffiti_tags_wall_idx";
  ALTER TABLE "graffiti_tags" DROP COLUMN IF EXISTS "wall";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_virtuele_sporen_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_virtuele_sporen_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "virtuele_sporen_id";
  DROP TABLE IF EXISTS "virtuele_sporen" CASCADE;`)
}
