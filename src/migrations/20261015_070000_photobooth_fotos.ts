import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// De photobooth in het virtuele stadion: een upload-collectie 'photobooth_fotos' (selfies die als
// polaroid en als mozaïektegel in de wandelgang hangen, zie collections/PhotoboothFotos.ts).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "photobooth_fotos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"club_id" integer,
  	"author_id" integer,
  	"author_name" varchar,
  	"tegel" varchar,
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

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "photobooth_fotos_id" integer;

  DO $$ BEGIN
    ALTER TABLE "photobooth_fotos" ADD CONSTRAINT "photobooth_fotos_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "photobooth_fotos" ADD CONSTRAINT "photobooth_fotos_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_photobooth_fotos_fk" FOREIGN KEY ("photobooth_fotos_id") REFERENCES "public"."photobooth_fotos"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE INDEX IF NOT EXISTS "photobooth_fotos_club_idx" ON "photobooth_fotos" USING btree ("club_id");
  CREATE INDEX IF NOT EXISTS "photobooth_fotos_author_idx" ON "photobooth_fotos" USING btree ("author_id");
  CREATE UNIQUE INDEX IF NOT EXISTS "photobooth_fotos_filename_idx" ON "photobooth_fotos" USING btree ("filename");
  CREATE INDEX IF NOT EXISTS "photobooth_fotos_updated_at_idx" ON "photobooth_fotos" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "photobooth_fotos_created_at_idx" ON "photobooth_fotos" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_photobooth_fotos_id_idx" ON "payload_locked_documents_rels" USING btree ("photobooth_fotos_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_photobooth_fotos_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_photobooth_fotos_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "photobooth_fotos_id";
  DROP TABLE IF EXISTS "photobooth_fotos" CASCADE;`)
}
