import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// CV-voorstellen (fase 0 van de computer-vision-pipeline): collectie 'cv-events' — voorstellen uit
// video-analyse met confidence en provenance, reviewed=false tot een mens ze bekijkt. Het
// worp-event-model (throws) blijft de waarheid; deze tabel telt nergens in mee.
//
// Idempotent raw-SQL naar het huis-patroon (zie 20260828_130000_tornooi_fotos). FK naar matches
// met ON DELETE set null, consistent met de andere match-gebonden tabellen (match_instants,
// match_mvp_votes). En — kritiek, dit crashte prod eerder bij tornooi_fotos — mét de relatie-
// kolom in payload_locked_documents_rels (zie 20260828_150000_tornooi_fotos_lock_rel).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_cv_events_event_type" AS ENUM('worp', 'vangst', 'doelpunt', 'buitenspel');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_cv_events_worp_type" AS ENUM('nek', 'rug');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_cv_events_side" AS ENUM('home', 'away');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`)

  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "cv_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"match_id" integer NOT NULL,
  	"video_time_s" numeric NOT NULL,
  	"frame" numeric,
  	"event_type" "public"."enum_cv_events_event_type" NOT NULL,
  	"worp_type" "public"."enum_cv_events_worp_type",
  	"in_doelgebied" boolean DEFAULT false,
  	"x_m" numeric,
  	"y_m" numeric,
  	"afstand_m" numeric,
  	"side" "public"."enum_cv_events_side",
  	"rugnummer" numeric,
  	"score_delta" numeric DEFAULT 0,
  	"confidence" numeric NOT NULL,
  	"reviewed" boolean DEFAULT false,
  	"provenance_model" varchar NOT NULL,
  	"provenance_model_version" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );`)

  await db.execute(sql`
  DO $$ BEGIN
    ALTER TABLE "cv_events" ADD CONSTRAINT "cv_events_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  CREATE INDEX IF NOT EXISTS "cv_events_match_idx" ON "cv_events" USING btree ("match_id");
  CREATE INDEX IF NOT EXISTS "cv_events_reviewed_idx" ON "cv_events" USING btree ("reviewed");
  CREATE INDEX IF NOT EXISTS "cv_events_updated_at_idx" ON "cv_events" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "cv_events_created_at_idx" ON "cv_events" USING btree ("created_at");`)

  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "cv_events_id" integer;
  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_cv_events_fk" FOREIGN KEY ("cv_events_id") REFERENCES "public"."cv_events"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_cv_events_id_idx" ON "payload_locked_documents_rels" USING btree ("cv_events_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_cv_events_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_cv_events_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "cv_events_id";
  DROP TABLE IF EXISTS "cv_events" CASCADE;
  DROP TYPE IF EXISTS "public"."enum_cv_events_event_type";
  DROP TYPE IF EXISTS "public"."enum_cv_events_worp_type";
  DROP TYPE IF EXISTS "public"."enum_cv_events_side";`)
}
