import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Spelersregistratie (lib/registratie.ts): de club voert een lid in met voornaam, naam, geslacht,
// soort lid en de datum van de medische keuring, laadt het doktersattest op (collectie
// 'medische_attesten', zie collections/MedischeAttesten.ts) en dient in; de federatie keurt goed of
// af. Bestaande spelers krijgen geen registratiestatus: voor hen blijft de vergunning beslissen.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_players_geslacht" AS ENUM('m', 'v');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_players_soort_lid" AS ENUM('speler', 'lid');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_players_registratie_status" AS ENUM('concept', 'ingediend', 'goedgekeurd', 'afgekeurd');
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE TABLE IF NOT EXISTS "medische_attesten" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"player_id" integer,
  	"club_id" integer,
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

  ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "voornaam" varchar;
  ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "achternaam" varchar;
  ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "geslacht" "enum_players_geslacht";
  ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "soort_lid" "enum_players_soort_lid" DEFAULT 'speler';
  ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "vergunningsnummer" varchar;
  ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "medische_keuring_op" timestamp(3) with time zone;
  ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "medisch_attest_bestand_id" integer;
  ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "registratie_status" "enum_players_registratie_status";
  ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "ingediend_op" timestamp(3) with time zone;
  ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "beoordeeld_op" timestamp(3) with time zone;
  ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "beoordeeld_door_id" integer;
  ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "afkeur_reden" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "medische_attesten_id" integer;

  DO $$ BEGIN
    ALTER TABLE "medische_attesten" ADD CONSTRAINT "medische_attesten_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "medische_attesten" ADD CONSTRAINT "medische_attesten_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "medische_attesten" ADD CONSTRAINT "medische_attesten_geupload_door_id_users_id_fk" FOREIGN KEY ("geupload_door_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "players" ADD CONSTRAINT "players_medisch_attest_bestand_id_medische_attesten_id_fk" FOREIGN KEY ("medisch_attest_bestand_id") REFERENCES "public"."medische_attesten"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "players" ADD CONSTRAINT "players_beoordeeld_door_id_users_id_fk" FOREIGN KEY ("beoordeeld_door_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_medische_attesten_fk" FOREIGN KEY ("medische_attesten_id") REFERENCES "public"."medische_attesten"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE INDEX IF NOT EXISTS "medische_attesten_player_idx" ON "medische_attesten" USING btree ("player_id");
  CREATE INDEX IF NOT EXISTS "medische_attesten_club_idx" ON "medische_attesten" USING btree ("club_id");
  CREATE INDEX IF NOT EXISTS "medische_attesten_geupload_door_idx" ON "medische_attesten" USING btree ("geupload_door_id");
  CREATE INDEX IF NOT EXISTS "medische_attesten_updated_at_idx" ON "medische_attesten" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "medische_attesten_created_at_idx" ON "medische_attesten" USING btree ("created_at");
  CREATE UNIQUE INDEX IF NOT EXISTS "medische_attesten_filename_idx" ON "medische_attesten" USING btree ("filename");
  CREATE INDEX IF NOT EXISTS "players_medisch_attest_bestand_idx" ON "players" USING btree ("medisch_attest_bestand_id");
  CREATE INDEX IF NOT EXISTS "players_registratie_status_idx" ON "players" USING btree ("registratie_status");
  CREATE INDEX IF NOT EXISTS "players_beoordeeld_door_idx" ON "players" USING btree ("beoordeeld_door_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_medische_attesten_id_idx" ON "payload_locked_documents_rels" USING btree ("medische_attesten_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_medische_attesten_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_medische_attesten_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "medische_attesten_id";
  ALTER TABLE "players" DROP CONSTRAINT IF EXISTS "players_medisch_attest_bestand_id_medische_attesten_id_fk";
  ALTER TABLE "players" DROP CONSTRAINT IF EXISTS "players_beoordeeld_door_id_users_id_fk";
  ALTER TABLE "players" DROP COLUMN IF EXISTS "voornaam";
  ALTER TABLE "players" DROP COLUMN IF EXISTS "achternaam";
  ALTER TABLE "players" DROP COLUMN IF EXISTS "geslacht";
  ALTER TABLE "players" DROP COLUMN IF EXISTS "soort_lid";
  ALTER TABLE "players" DROP COLUMN IF EXISTS "vergunningsnummer";
  ALTER TABLE "players" DROP COLUMN IF EXISTS "medische_keuring_op";
  ALTER TABLE "players" DROP COLUMN IF EXISTS "medisch_attest_bestand_id";
  ALTER TABLE "players" DROP COLUMN IF EXISTS "registratie_status";
  ALTER TABLE "players" DROP COLUMN IF EXISTS "ingediend_op";
  ALTER TABLE "players" DROP COLUMN IF EXISTS "beoordeeld_op";
  ALTER TABLE "players" DROP COLUMN IF EXISTS "beoordeeld_door_id";
  ALTER TABLE "players" DROP COLUMN IF EXISTS "afkeur_reden";
  DROP TABLE IF EXISTS "medische_attesten" CASCADE;
  DROP TYPE IF EXISTS "public"."enum_players_geslacht";
  DROP TYPE IF EXISTS "public"."enum_players_soort_lid";
  DROP TYPE IF EXISTS "public"."enum_players_registratie_status";`)
}
