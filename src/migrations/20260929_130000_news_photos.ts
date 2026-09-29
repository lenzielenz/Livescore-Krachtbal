import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Bezoekersfoto's bij een nieuwsbericht (bv. "Dag van de Sportclub"): twee nieuwe velden op 'news'
// (photosEnabled/photosExpireAt) plus een nieuwe upload-collectie 'news_photos', naar analogie van
// 'match_instants' (foto-tribune) — zelfde schema-aanpak (FK's, indexen, de relatie-kolom in
// payload_locked_documents_rels).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "news" ADD COLUMN IF NOT EXISTS "photos_enabled" boolean DEFAULT false;
  ALTER TABLE "news" ADD COLUMN IF NOT EXISTS "photos_expire_at" timestamp(3) with time zone;

  CREATE TABLE "news_photos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"news_id" integer NOT NULL,
  	"uploader_id" integer,
  	"uploader_name" varchar,
  	"caption" varchar,
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

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "news_photos_id" integer;

  ALTER TABLE "news_photos" ADD CONSTRAINT "news_photos_news_id_news_id_fk" FOREIGN KEY ("news_id") REFERENCES "public"."news"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "news_photos" ADD CONSTRAINT "news_photos_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

  CREATE INDEX "news_photos_news_idx" ON "news_photos" USING btree ("news_id");
  CREATE INDEX "news_photos_uploader_idx" ON "news_photos" USING btree ("uploader_id");
  CREATE INDEX "news_photos_expires_at_idx" ON "news_photos" USING btree ("expires_at");
  CREATE UNIQUE INDEX "news_photos_filename_idx" ON "news_photos" USING btree ("filename");
  CREATE INDEX "news_photos_updated_at_idx" ON "news_photos" USING btree ("updated_at");
  CREATE INDEX "news_photos_created_at_idx" ON "news_photos" USING btree ("created_at");

  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_news_photos_fk" FOREIGN KEY ("news_photos_id") REFERENCES "public"."news_photos"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_news_photos_id_idx" ON "payload_locked_documents_rels" USING btree ("news_photos_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_news_photos_fk";
  DROP INDEX "payload_locked_documents_rels_news_photos_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "news_photos_id";
  DROP TABLE "news_photos" CASCADE;

  ALTER TABLE "news" DROP COLUMN IF EXISTS "photos_expire_at";
  ALTER TABLE "news" DROP COLUMN IF EXISTS "photos_enabled";`)
}
