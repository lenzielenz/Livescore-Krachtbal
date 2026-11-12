import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// RCVK, het vervolg van de keten:
// - scheidsrechtersrapport (item 27): sr_rapporten (+ aanleidingen, + bijlagen via rapport_bijlagen,
//   een upload-collection) en matchsheets.rapport_volgt ("zie scheidsrechtersrapport");
// - uitlenen van jeugdspelers (item 45): uitleningen, met de handtekeningen van beide clubs;
// - voorbehoud per comité (item 25.3): matchsheets_voorbehoud.onderwerp en klachten.comite;
// - herinneringen bij termijnen: meldingen.sleutel (één keer versturen);
// - het bord kent twee nieuwe bronnen: dossiers.bron 'rapport' en 'uitlening'.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TYPE "public"."enum_dossiers_bron" ADD VALUE IF NOT EXISTS 'rapport';
  ALTER TYPE "public"."enum_dossiers_bron" ADD VALUE IF NOT EXISTS 'uitlening';

  DO $$ BEGIN
    CREATE TYPE "public"."enum_klachten_comite" AS ENUM('sport', 'scheidsrechters');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_matchsheets_voorbehoud_onderwerp" AS ENUM('inrichting', 'speelduur_tijdopnemer', 'officials', 'leeftijd', 'aantekenblad', 'identiteit', 'doelpunt', 'sr_afwezig', 'sr_te_laat', 'spelregels', 'speelduur_scheidsrechter', 'ander');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_sr_rapporten_aanleidingen" AS ENUM('voorbehoud', 'uitsluiting', 'niet_gespeeld', 'incident', 'ander');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_sr_rapporten_status" AS ENUM('ingediend', 'afgehandeld');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_uitleningen_status" AS ENUM('wacht_ontvanger', 'wacht_federatie', 'bevestigd', 'geweigerd', 'ingetrokken');
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  ALTER TABLE "klachten" ADD COLUMN IF NOT EXISTS "comite" "enum_klachten_comite";
  ALTER TABLE "matchsheets" ADD COLUMN IF NOT EXISTS "rapport_volgt" boolean DEFAULT false;
  ALTER TABLE "matchsheets_voorbehoud" ADD COLUMN IF NOT EXISTS "onderwerp" "enum_matchsheets_voorbehoud_onderwerp";
  ALTER TABLE "meldingen" ADD COLUMN IF NOT EXISTS "sleutel" varchar;

  CREATE TABLE IF NOT EXISTS "rapport_bijlagen" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"match_id" integer,
  	"geupload_door_id" integer,
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

  CREATE TABLE IF NOT EXISTS "sr_rapporten" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"match_id" integer NOT NULL,
  	"scheidsrechter_id" integer NOT NULL,
  	"relaas" varchar NOT NULL,
  	"ondertekend_naam" varchar NOT NULL,
  	"ondertekend_op" timestamp(3) with time zone NOT NULL,
  	"status" "enum_sr_rapporten_status" DEFAULT 'ingediend',
  	"besluit" varchar,
  	"behandeld_door_id" integer,
  	"behandeld_op" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE IF NOT EXISTS "sr_rapporten_aanleidingen" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_sr_rapporten_aanleidingen",
  	"id" serial PRIMARY KEY NOT NULL
  );
  CREATE TABLE IF NOT EXISTS "sr_rapporten_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"rapport_bijlagen_id" integer
  );

  CREATE TABLE IF NOT EXISTS "uitleningen" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"speler_id" integer NOT NULL,
  	"van_club_id" integer NOT NULL,
  	"naar_club_id" integer NOT NULL,
  	"naar_ploeg_id" integer NOT NULL,
  	"seizoen" varchar NOT NULL,
  	"speler_naam" varchar NOT NULL,
  	"adres" varchar NOT NULL,
  	"geboortedatum" timestamp(3) with time zone,
  	"categorie" varchar,
  	"competitie" varchar,
  	"status" "enum_uitleningen_status" DEFAULT 'wacht_ontvanger',
  	"teken_van_door_id" integer,
  	"teken_van_naam" varchar,
  	"teken_van_op" timestamp(3) with time zone,
  	"teken_naar_door_id" integer,
  	"teken_naar_naam" varchar,
  	"teken_naar_op" timestamp(3) with time zone,
  	"behandeld_door_id" integer,
  	"behandeld_op" timestamp(3) with time zone,
  	"toelichting" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "sr_rapporten_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "rapport_bijlagen_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "uitleningen_id" integer;

  DO $$ BEGIN
    ALTER TABLE "rapport_bijlagen" ADD CONSTRAINT "rapport_bijlagen_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "rapport_bijlagen" ADD CONSTRAINT "rapport_bijlagen_geupload_door_id_users_id_fk" FOREIGN KEY ("geupload_door_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "sr_rapporten" ADD CONSTRAINT "sr_rapporten_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "sr_rapporten" ADD CONSTRAINT "sr_rapporten_scheidsrechter_id_users_id_fk" FOREIGN KEY ("scheidsrechter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "sr_rapporten" ADD CONSTRAINT "sr_rapporten_behandeld_door_id_users_id_fk" FOREIGN KEY ("behandeld_door_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "sr_rapporten_aanleidingen" ADD CONSTRAINT "sr_rapporten_aanleidingen_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sr_rapporten"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "sr_rapporten_rels" ADD CONSTRAINT "sr_rapporten_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sr_rapporten"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "sr_rapporten_rels" ADD CONSTRAINT "sr_rapporten_rels_rapport_bijlagen_fk" FOREIGN KEY ("rapport_bijlagen_id") REFERENCES "public"."rapport_bijlagen"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "uitleningen" ADD CONSTRAINT "uitleningen_speler_id_players_id_fk" FOREIGN KEY ("speler_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "uitleningen" ADD CONSTRAINT "uitleningen_van_club_id_clubs_id_fk" FOREIGN KEY ("van_club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "uitleningen" ADD CONSTRAINT "uitleningen_naar_club_id_clubs_id_fk" FOREIGN KEY ("naar_club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "uitleningen" ADD CONSTRAINT "uitleningen_naar_ploeg_id_teams_id_fk" FOREIGN KEY ("naar_ploeg_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "uitleningen" ADD CONSTRAINT "uitleningen_teken_van_door_id_users_id_fk" FOREIGN KEY ("teken_van_door_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "uitleningen" ADD CONSTRAINT "uitleningen_teken_naar_door_id_users_id_fk" FOREIGN KEY ("teken_naar_door_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "uitleningen" ADD CONSTRAINT "uitleningen_behandeld_door_id_users_id_fk" FOREIGN KEY ("behandeld_door_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sr_rapporten_fk" FOREIGN KEY ("sr_rapporten_id") REFERENCES "public"."sr_rapporten"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_rapport_bijlagen_fk" FOREIGN KEY ("rapport_bijlagen_id") REFERENCES "public"."rapport_bijlagen"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_uitleningen_fk" FOREIGN KEY ("uitleningen_id") REFERENCES "public"."uitleningen"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE INDEX IF NOT EXISTS "meldingen_sleutel_idx" ON "meldingen" USING btree ("sleutel");
  CREATE UNIQUE INDEX IF NOT EXISTS "rapport_bijlagen_filename_idx" ON "rapport_bijlagen" USING btree ("filename");
  CREATE INDEX IF NOT EXISTS "rapport_bijlagen_match_idx" ON "rapport_bijlagen" USING btree ("match_id");
  CREATE INDEX IF NOT EXISTS "rapport_bijlagen_geupload_door_idx" ON "rapport_bijlagen" USING btree ("geupload_door_id");
  CREATE INDEX IF NOT EXISTS "rapport_bijlagen_updated_at_idx" ON "rapport_bijlagen" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "rapport_bijlagen_created_at_idx" ON "rapport_bijlagen" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "sr_rapporten_match_idx" ON "sr_rapporten" USING btree ("match_id");
  CREATE INDEX IF NOT EXISTS "sr_rapporten_scheidsrechter_idx" ON "sr_rapporten" USING btree ("scheidsrechter_id");
  CREATE INDEX IF NOT EXISTS "sr_rapporten_status_idx" ON "sr_rapporten" USING btree ("status");
  CREATE INDEX IF NOT EXISTS "sr_rapporten_behandeld_door_idx" ON "sr_rapporten" USING btree ("behandeld_door_id");
  CREATE INDEX IF NOT EXISTS "sr_rapporten_updated_at_idx" ON "sr_rapporten" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "sr_rapporten_created_at_idx" ON "sr_rapporten" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "sr_rapporten_aanleidingen_order_idx" ON "sr_rapporten_aanleidingen" USING btree ("order");
  CREATE INDEX IF NOT EXISTS "sr_rapporten_aanleidingen_parent_idx" ON "sr_rapporten_aanleidingen" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "sr_rapporten_rels_order_idx" ON "sr_rapporten_rels" USING btree ("order");
  CREATE INDEX IF NOT EXISTS "sr_rapporten_rels_parent_idx" ON "sr_rapporten_rels" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "sr_rapporten_rels_path_idx" ON "sr_rapporten_rels" USING btree ("path");
  CREATE INDEX IF NOT EXISTS "sr_rapporten_rels_rapport_bijlagen_id_idx" ON "sr_rapporten_rels" USING btree ("rapport_bijlagen_id");
  CREATE INDEX IF NOT EXISTS "uitleningen_speler_idx" ON "uitleningen" USING btree ("speler_id");
  CREATE INDEX IF NOT EXISTS "uitleningen_van_club_idx" ON "uitleningen" USING btree ("van_club_id");
  CREATE INDEX IF NOT EXISTS "uitleningen_naar_club_idx" ON "uitleningen" USING btree ("naar_club_id");
  CREATE INDEX IF NOT EXISTS "uitleningen_naar_ploeg_idx" ON "uitleningen" USING btree ("naar_ploeg_id");
  CREATE INDEX IF NOT EXISTS "uitleningen_seizoen_idx" ON "uitleningen" USING btree ("seizoen");
  CREATE INDEX IF NOT EXISTS "uitleningen_status_idx" ON "uitleningen" USING btree ("status");
  CREATE INDEX IF NOT EXISTS "uitleningen_teken_van_teken_van_door_idx" ON "uitleningen" USING btree ("teken_van_door_id");
  CREATE INDEX IF NOT EXISTS "uitleningen_teken_naar_teken_naar_door_idx" ON "uitleningen" USING btree ("teken_naar_door_id");
  CREATE INDEX IF NOT EXISTS "uitleningen_behandeld_door_idx" ON "uitleningen" USING btree ("behandeld_door_id");
  CREATE INDEX IF NOT EXISTS "uitleningen_updated_at_idx" ON "uitleningen" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "uitleningen_created_at_idx" ON "uitleningen" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_sr_rapporten_id_idx" ON "payload_locked_documents_rels" USING btree ("sr_rapporten_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_rapport_bijlagen_id_idx" ON "payload_locked_documents_rels" USING btree ("rapport_bijlagen_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_uitleningen_id_idx" ON "payload_locked_documents_rels" USING btree ("uitleningen_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Enum-waarden ('rapport', 'uitlening' in enum_dossiers_bron) kan Postgres niet weghalen; ze blijven onschadelijk staan.
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_sr_rapporten_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_rapport_bijlagen_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_uitleningen_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_sr_rapporten_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_rapport_bijlagen_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_uitleningen_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "sr_rapporten_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "rapport_bijlagen_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "uitleningen_id";
  DROP TABLE IF EXISTS "uitleningen" CASCADE;
  DROP TABLE IF EXISTS "sr_rapporten_rels" CASCADE;
  DROP TABLE IF EXISTS "sr_rapporten_aanleidingen" CASCADE;
  DROP TABLE IF EXISTS "sr_rapporten" CASCADE;
  DROP TABLE IF EXISTS "rapport_bijlagen" CASCADE;
  DROP INDEX IF EXISTS "meldingen_sleutel_idx";
  ALTER TABLE "meldingen" DROP COLUMN IF EXISTS "sleutel";
  ALTER TABLE "matchsheets_voorbehoud" DROP COLUMN IF EXISTS "onderwerp";
  ALTER TABLE "matchsheets" DROP COLUMN IF EXISTS "rapport_volgt";
  ALTER TABLE "klachten" DROP COLUMN IF EXISTS "comite";
  DROP TYPE IF EXISTS "public"."enum_uitleningen_status";
  DROP TYPE IF EXISTS "public"."enum_sr_rapporten_status";
  DROP TYPE IF EXISTS "public"."enum_sr_rapporten_aanleidingen";
  DROP TYPE IF EXISTS "public"."enum_matchsheets_voorbehoud_onderwerp";
  DROP TYPE IF EXISTS "public"."enum_klachten_comite";`)
}
