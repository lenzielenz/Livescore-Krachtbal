import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Screenshot bij een ideeënbus-inzending: een upload-collectie 'idea-screenshots' (zelfde schema
// als de andere kale upload-collecties, bv. match-instants zonder de extra velden) plus het
// 'screenshot'-relatieveld op 'ideas'. Hoorde bij de ideeënbus-screenshot-feature maar werd toen
// niet meegegenereerd — productie miste hierdoor de kolom en elke inzending met screenshot faalde.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE "idea_screenshots" (
  	"id" serial PRIMARY KEY NOT NULL,
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

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "idea_screenshots_id" integer;
  ALTER TABLE "ideas" ADD COLUMN "screenshot_id" integer;

  CREATE UNIQUE INDEX "idea_screenshots_filename_idx" ON "idea_screenshots" USING btree ("filename");
  CREATE INDEX "idea_screenshots_updated_at_idx" ON "idea_screenshots" USING btree ("updated_at");
  CREATE INDEX "idea_screenshots_created_at_idx" ON "idea_screenshots" USING btree ("created_at");

  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_idea_screenshots_fk" FOREIGN KEY ("idea_screenshots_id") REFERENCES "public"."idea_screenshots"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_idea_screenshots_id_idx" ON "payload_locked_documents_rels" USING btree ("idea_screenshots_id");

  ALTER TABLE "ideas" ADD CONSTRAINT "ideas_screenshot_id_idea_screenshots_id_fk" FOREIGN KEY ("screenshot_id") REFERENCES "public"."idea_screenshots"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "ideas_screenshot_idx" ON "ideas" USING btree ("screenshot_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "ideas" DROP CONSTRAINT "ideas_screenshot_id_idea_screenshots_id_fk";
  DROP INDEX "ideas_screenshot_idx";
  ALTER TABLE "ideas" DROP COLUMN "screenshot_id";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_idea_screenshots_fk";
  DROP INDEX "payload_locked_documents_rels_idea_screenshots_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "idea_screenshots_id";

  DROP TABLE "idea_screenshots" CASCADE;`)
}
