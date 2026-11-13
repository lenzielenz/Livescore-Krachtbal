import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Vollere ledenfiche (adres, contact, noodcontact, toestemmingen), lidmaatschap per seizoen (verzekerdenlijst),
// documenten per lid, en de velden voor de e-factuur (Peppol): ondernemingsnummer en factuuradres van de club,
// btw-regime en btw-nummer van de federatie. Onafhankelijk van andere migraties.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "straat" varchar;
  ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "postcode" varchar;
  ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "gemeente" varchar;
  ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "land" varchar DEFAULT 'BE';
  ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "telefoon" varchar;
  ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "nationaliteit" varchar;
  ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "noodcontact_naam" varchar;
  ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "noodcontact_telefoon" varchar;
  ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "toestemming_foto" boolean;
  ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "toestemming_nieuws" boolean;
  ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "toestemming_op" timestamp(3) with time zone;
  ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "lid_sinds" timestamp(3) with time zone;
  ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "fiche_bijgewerkt_op" timestamp(3) with time zone;

  ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "ondernemingsnummer" varchar;
  ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "factuur_straat" varchar;
  ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "factuur_postcode" varchar;
  ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "factuur_gemeente" varchar;

  DO $$ BEGIN
    CREATE TYPE "public"."enum_settings_factuur_btw_regime" AS ENUM('niet-onderworpen', 'vrijgesteld');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "factuur_btw_regime" "enum_settings_factuur_btw_regime" DEFAULT 'niet-onderworpen';
  ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "factuur_btw_nummer" varchar;

  DO $$ BEGIN
    CREATE TYPE "public"."enum_lidmaatschappen_soort" AS ENUM('speler', 'lid');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  CREATE TABLE IF NOT EXISTS "lidmaatschappen" (
    "id" serial PRIMARY KEY NOT NULL,
    "player_id" integer,
    "club_id" integer,
    "seizoen" varchar NOT NULL,
    "soort" "enum_lidmaatschappen_soort" DEFAULT 'speler',
    "vanaf" timestamp(3) with time zone NOT NULL,
    "tot" timestamp(3) with time zone,
    "sleutel" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  DO $$ BEGIN
    ALTER TABLE "lidmaatschappen" ADD CONSTRAINT "lidmaatschappen_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "lidmaatschappen" ADD CONSTRAINT "lidmaatschappen_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  CREATE INDEX IF NOT EXISTS "lidmaatschappen_player_idx" ON "lidmaatschappen" USING btree ("player_id");
  CREATE INDEX IF NOT EXISTS "lidmaatschappen_club_idx" ON "lidmaatschappen" USING btree ("club_id");
  CREATE INDEX IF NOT EXISTS "lidmaatschappen_seizoen_idx" ON "lidmaatschappen" USING btree ("seizoen");
  CREATE UNIQUE INDEX IF NOT EXISTS "lidmaatschappen_sleutel_idx" ON "lidmaatschappen" USING btree ("sleutel");
  CREATE INDEX IF NOT EXISTS "lidmaatschappen_updated_at_idx" ON "lidmaatschappen" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "lidmaatschappen_created_at_idx" ON "lidmaatschappen" USING btree ("created_at");

  DO $$ BEGIN
    CREATE TYPE "public"."enum_lid_documenten_soort" AS ENUM('identiteit', 'mutualiteit', 'toestemming', 'verzekering', 'ander');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  CREATE TABLE IF NOT EXISTS "lid_documenten" (
    "id" serial PRIMARY KEY NOT NULL,
    "player_id" integer,
    "club_id" integer,
    "soort" "enum_lid_documenten_soort" DEFAULT 'ander',
    "titel" varchar NOT NULL,
    "opmerking" varchar,
    "zichtbaar_voor_lid" boolean DEFAULT true,
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
  DO $$ BEGIN
    ALTER TABLE "lid_documenten" ADD CONSTRAINT "lid_documenten_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "lid_documenten" ADD CONSTRAINT "lid_documenten_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "lid_documenten" ADD CONSTRAINT "lid_documenten_geupload_door_id_users_id_fk" FOREIGN KEY ("geupload_door_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  CREATE INDEX IF NOT EXISTS "lid_documenten_player_idx" ON "lid_documenten" USING btree ("player_id");
  CREATE INDEX IF NOT EXISTS "lid_documenten_club_idx" ON "lid_documenten" USING btree ("club_id");
  CREATE INDEX IF NOT EXISTS "lid_documenten_geupload_door_idx" ON "lid_documenten" USING btree ("geupload_door_id");
  CREATE INDEX IF NOT EXISTS "lid_documenten_updated_at_idx" ON "lid_documenten" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "lid_documenten_created_at_idx" ON "lid_documenten" USING btree ("created_at");
  CREATE UNIQUE INDEX IF NOT EXISTS "lid_documenten_filename_idx" ON "lid_documenten" USING btree ("filename");

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "lidmaatschappen_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "lid_documenten_id" integer;
  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_lidmaatschappen_fk" FOREIGN KEY ("lidmaatschappen_id") REFERENCES "public"."lidmaatschappen"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_lid_documenten_fk" FOREIGN KEY ("lid_documenten_id") REFERENCES "public"."lid_documenten"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_lidmaatschappen_id_idx" ON "payload_locked_documents_rels" USING btree ("lidmaatschappen_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_lid_documenten_id_idx" ON "payload_locked_documents_rels" USING btree ("lid_documenten_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_lidmaatschappen_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_lid_documenten_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "lidmaatschappen_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "lid_documenten_id";
  DROP TABLE IF EXISTS "lid_documenten" CASCADE;
  DROP TABLE IF EXISTS "lidmaatschappen" CASCADE;
  DROP TYPE IF EXISTS "public"."enum_lid_documenten_soort";
  DROP TYPE IF EXISTS "public"."enum_lidmaatschappen_soort";
  ALTER TABLE "settings" DROP COLUMN IF EXISTS "factuur_btw_regime";
  ALTER TABLE "settings" DROP COLUMN IF EXISTS "factuur_btw_nummer";
  DROP TYPE IF EXISTS "public"."enum_settings_factuur_btw_regime";
  ALTER TABLE "clubs" DROP COLUMN IF EXISTS "ondernemingsnummer";
  ALTER TABLE "clubs" DROP COLUMN IF EXISTS "factuur_straat";
  ALTER TABLE "clubs" DROP COLUMN IF EXISTS "factuur_postcode";
  ALTER TABLE "clubs" DROP COLUMN IF EXISTS "factuur_gemeente";
  ALTER TABLE "players" DROP COLUMN IF EXISTS "straat";
  ALTER TABLE "players" DROP COLUMN IF EXISTS "postcode";
  ALTER TABLE "players" DROP COLUMN IF EXISTS "gemeente";
  ALTER TABLE "players" DROP COLUMN IF EXISTS "land";
  ALTER TABLE "players" DROP COLUMN IF EXISTS "telefoon";
  ALTER TABLE "players" DROP COLUMN IF EXISTS "nationaliteit";
  ALTER TABLE "players" DROP COLUMN IF EXISTS "noodcontact_naam";
  ALTER TABLE "players" DROP COLUMN IF EXISTS "noodcontact_telefoon";
  ALTER TABLE "players" DROP COLUMN IF EXISTS "toestemming_foto";
  ALTER TABLE "players" DROP COLUMN IF EXISTS "toestemming_nieuws";
  ALTER TABLE "players" DROP COLUMN IF EXISTS "toestemming_op";
  ALTER TABLE "players" DROP COLUMN IF EXISTS "lid_sinds";
  ALTER TABLE "players" DROP COLUMN IF EXISTS "fiche_bijgewerkt_op";`)
}
