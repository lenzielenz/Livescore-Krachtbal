import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Tornooifoto's: supporters sturen foto's van de tornooidag in; alles verzamelt federatie-only.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "tornooi_fotos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"groep" varchar NOT NULL,
  	"uploader_id" integer,
  	"uploader_name" varchar,
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
  );`)
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "tornooi_fotos_groep_idx" ON "tornooi_fotos" USING btree ("groep");
  CREATE INDEX IF NOT EXISTS "tornooi_fotos_uploader_idx" ON "tornooi_fotos" USING btree ("uploader_id");
  CREATE UNIQUE INDEX IF NOT EXISTS "tornooi_fotos_filename_idx" ON "tornooi_fotos" USING btree ("filename");
  CREATE INDEX IF NOT EXISTS "tornooi_fotos_updated_at_idx" ON "tornooi_fotos" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "tornooi_fotos_created_at_idx" ON "tornooi_fotos" USING btree ("created_at");
  DO $$ BEGIN
    ALTER TABLE "tornooi_fotos" ADD CONSTRAINT "tornooi_fotos_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "tornooi_fotos";`)
}
