import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Seizoensplanning en wedstrijddag:
// - inschrijvingsrondes (+ vrije weekends) en inschrijvingen (+ ploegen, terrein niet vrij):
//   clubs schrijven hun ploegen in met hun voorkeuren (lib/inschrijving.ts);
// - teams.thuisdag en teams.koppel_met: input voor de kalenderplanner (lib/kalender-planner.ts);
// - verplaatsingsaanvragen: club vraagt, tegenpartij akkoord, federatie beslist (lib/verplaatsing.ts);
// - matchsheets.gefloten_door: wie effectief floot (backup) — telt voor de kwitantie.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_inschrijvingen_ploegen_reeks" AS ENUM('1NAH', '1NAHB', '1NAD', '2NAH', '2NAHB', 'LH', 'LD', 'RHA', 'RHB', 'RHC', 'RDA', 'RDB', 'U18J', 'U18M', 'U16J', 'U16M', 'U16MA', 'U16MB', 'U14J', 'U14JA', 'U14JB', 'U14M', 'U12', 'U12A', 'U12B', 'recreatief', 'beker', 'andere');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_inschrijvingen_ploegen_thuisdag" AS ENUM('za', 'zo');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_inschrijvingen_status" AS ENUM('concept', 'ingediend', 'verwerkt');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_inschrijvingsrondes_status" AS ENUM('open', 'gesloten');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_teams_thuisdag" AS ENUM('za', 'zo');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_verplaatsingsaanvragen_status" AS ENUM('wacht_tegenpartij', 'wacht_federatie', 'geweigerd', 'goedgekeurd', 'afgewezen', 'ingetrokken');
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE TABLE IF NOT EXISTS "inschrijvingsrondes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"seizoen" varchar NOT NULL,
  	"deadline" timestamp(3) with time zone NOT NULL,
  	"status" "enum_inschrijvingsrondes_status" DEFAULT 'open',
  	"eerste_weekend" timestamp(3) with time zone NOT NULL,
  	"laatste_weekend" timestamp(3) with time zone NOT NULL,
  	"toelichting" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE IF NOT EXISTS "inschrijvingsrondes_vrije_weekends" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"weekend" timestamp(3) with time zone NOT NULL,
  	"reden" varchar
  );
  CREATE TABLE IF NOT EXISTS "inschrijvingen" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"ronde_id" integer NOT NULL,
  	"club_id" integer NOT NULL,
  	"status" "enum_inschrijvingen_status" DEFAULT 'concept',
  	"ingediend_op" timestamp(3) with time zone,
  	"aantal_velden" numeric DEFAULT 1,
  	"wensen" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE IF NOT EXISTS "inschrijvingen_ploegen" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"team_id" integer,
  	"naam" varchar NOT NULL,
  	"reeks" "enum_inschrijvingen_ploegen_reeks" NOT NULL,
  	"thuisdag" "enum_inschrijvingen_ploegen_thuisdag",
  	"thuis_uur" varchar,
  	"koppel_met" varchar,
  	"opmerking" varchar
  );
  CREATE TABLE IF NOT EXISTS "inschrijvingen_onbeschikbaar" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"weekend" timestamp(3) with time zone NOT NULL,
  	"reden" varchar,
  	"hard" boolean DEFAULT true
  );
  CREATE TABLE IF NOT EXISTS "verplaatsingsaanvragen" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"match_id" integer NOT NULL,
  	"aanvrager_id" integer NOT NULL,
  	"tegenpartij_id" integer,
  	"oorspronkelijk" timestamp(3) with time zone,
  	"voorgesteld" timestamp(3) with time zone NOT NULL,
  	"reden" varchar NOT NULL,
  	"status" "enum_verplaatsingsaanvragen_status" DEFAULT 'wacht_tegenpartij',
  	"aangevraagd_door_id" integer,
  	"tegenpartij_opmerking" varchar,
  	"federatie_opmerking" varchar,
  	"behandeld_op" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "thuisdag" "enum_teams_thuisdag";
  ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "koppel_met_id" integer;
  ALTER TABLE "matchsheets" ADD COLUMN IF NOT EXISTS "gefloten_door_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "inschrijvingsrondes_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "inschrijvingen_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "verplaatsingsaanvragen_id" integer;

  DO $$ BEGIN
    ALTER TABLE "inschrijvingsrondes_vrije_weekends" ADD CONSTRAINT "inschrijvingsrondes_vrije_weekends_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."inschrijvingsrondes"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "inschrijvingen" ADD CONSTRAINT "inschrijvingen_ronde_id_inschrijvingsrondes_id_fk" FOREIGN KEY ("ronde_id") REFERENCES "public"."inschrijvingsrondes"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "inschrijvingen" ADD CONSTRAINT "inschrijvingen_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "inschrijvingen_ploegen" ADD CONSTRAINT "inschrijvingen_ploegen_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."inschrijvingen"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "inschrijvingen_ploegen" ADD CONSTRAINT "inschrijvingen_ploegen_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "inschrijvingen_onbeschikbaar" ADD CONSTRAINT "inschrijvingen_onbeschikbaar_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."inschrijvingen"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "verplaatsingsaanvragen" ADD CONSTRAINT "verplaatsingsaanvragen_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "verplaatsingsaanvragen" ADD CONSTRAINT "verplaatsingsaanvragen_aanvrager_id_clubs_id_fk" FOREIGN KEY ("aanvrager_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "verplaatsingsaanvragen" ADD CONSTRAINT "verplaatsingsaanvragen_tegenpartij_id_clubs_id_fk" FOREIGN KEY ("tegenpartij_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "verplaatsingsaanvragen" ADD CONSTRAINT "verplaatsingsaanvragen_aangevraagd_door_id_users_id_fk" FOREIGN KEY ("aangevraagd_door_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "teams" ADD CONSTRAINT "teams_koppel_met_id_teams_id_fk" FOREIGN KEY ("koppel_met_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "matchsheets" ADD CONSTRAINT "matchsheets_gefloten_door_id_officials_id_fk" FOREIGN KEY ("gefloten_door_id") REFERENCES "public"."officials"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_inschrijvingsrondes_fk" FOREIGN KEY ("inschrijvingsrondes_id") REFERENCES "public"."inschrijvingsrondes"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_inschrijvingen_fk" FOREIGN KEY ("inschrijvingen_id") REFERENCES "public"."inschrijvingen"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_verplaatsingsaanvragen_fk" FOREIGN KEY ("verplaatsingsaanvragen_id") REFERENCES "public"."verplaatsingsaanvragen"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE INDEX IF NOT EXISTS "inschrijvingsrondes_updated_at_idx" ON "inschrijvingsrondes" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "inschrijvingsrondes_created_at_idx" ON "inschrijvingsrondes" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "inschrijvingsrondes_vrije_weekends_order_idx" ON "inschrijvingsrondes_vrije_weekends" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "inschrijvingsrondes_vrije_weekends_parent_id_idx" ON "inschrijvingsrondes_vrije_weekends" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "inschrijvingen_ronde_idx" ON "inschrijvingen" USING btree ("ronde_id");
  CREATE INDEX IF NOT EXISTS "inschrijvingen_club_idx" ON "inschrijvingen" USING btree ("club_id");
  CREATE INDEX IF NOT EXISTS "inschrijvingen_updated_at_idx" ON "inschrijvingen" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "inschrijvingen_created_at_idx" ON "inschrijvingen" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "inschrijvingen_ploegen_order_idx" ON "inschrijvingen_ploegen" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "inschrijvingen_ploegen_parent_id_idx" ON "inschrijvingen_ploegen" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "inschrijvingen_ploegen_team_idx" ON "inschrijvingen_ploegen" USING btree ("team_id");
  CREATE INDEX IF NOT EXISTS "inschrijvingen_onbeschikbaar_order_idx" ON "inschrijvingen_onbeschikbaar" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "inschrijvingen_onbeschikbaar_parent_id_idx" ON "inschrijvingen_onbeschikbaar" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "verplaatsingsaanvragen_match_idx" ON "verplaatsingsaanvragen" USING btree ("match_id");
  CREATE INDEX IF NOT EXISTS "verplaatsingsaanvragen_aanvrager_idx" ON "verplaatsingsaanvragen" USING btree ("aanvrager_id");
  CREATE INDEX IF NOT EXISTS "verplaatsingsaanvragen_tegenpartij_idx" ON "verplaatsingsaanvragen" USING btree ("tegenpartij_id");
  CREATE INDEX IF NOT EXISTS "verplaatsingsaanvragen_status_idx" ON "verplaatsingsaanvragen" USING btree ("status");
  CREATE INDEX IF NOT EXISTS "verplaatsingsaanvragen_aangevraagd_door_idx" ON "verplaatsingsaanvragen" USING btree ("aangevraagd_door_id");
  CREATE INDEX IF NOT EXISTS "verplaatsingsaanvragen_updated_at_idx" ON "verplaatsingsaanvragen" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "verplaatsingsaanvragen_created_at_idx" ON "verplaatsingsaanvragen" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "teams_koppel_met_idx" ON "teams" USING btree ("koppel_met_id");
  CREATE INDEX IF NOT EXISTS "matchsheets_gefloten_door_idx" ON "matchsheets" USING btree ("gefloten_door_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_inschrijvingsrondes_id_idx" ON "payload_locked_documents_rels" USING btree ("inschrijvingsrondes_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_inschrijvingen_id_idx" ON "payload_locked_documents_rels" USING btree ("inschrijvingen_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_verplaatsingsaanvragen_id_idx" ON "payload_locked_documents_rels" USING btree ("verplaatsingsaanvragen_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_inschrijvingsrondes_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_inschrijvingen_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_verplaatsingsaanvragen_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_inschrijvingsrondes_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_inschrijvingen_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_verplaatsingsaanvragen_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "inschrijvingsrondes_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "inschrijvingen_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "verplaatsingsaanvragen_id";
  ALTER TABLE "teams" DROP CONSTRAINT IF EXISTS "teams_koppel_met_id_teams_id_fk";
  DROP INDEX IF EXISTS "teams_koppel_met_idx";
  ALTER TABLE "teams" DROP COLUMN IF EXISTS "koppel_met_id";
  ALTER TABLE "teams" DROP COLUMN IF EXISTS "thuisdag";
  ALTER TABLE "matchsheets" DROP CONSTRAINT IF EXISTS "matchsheets_gefloten_door_id_officials_id_fk";
  DROP INDEX IF EXISTS "matchsheets_gefloten_door_idx";
  ALTER TABLE "matchsheets" DROP COLUMN IF EXISTS "gefloten_door_id";
  DROP TABLE IF EXISTS "verplaatsingsaanvragen" CASCADE;
  DROP TABLE IF EXISTS "inschrijvingen_onbeschikbaar" CASCADE;
  DROP TABLE IF EXISTS "inschrijvingen_ploegen" CASCADE;
  DROP TABLE IF EXISTS "inschrijvingen" CASCADE;
  DROP TABLE IF EXISTS "inschrijvingsrondes_vrije_weekends" CASCADE;
  DROP TABLE IF EXISTS "inschrijvingsrondes" CASCADE;
  DROP TYPE IF EXISTS "public"."enum_inschrijvingen_ploegen_reeks";
  DROP TYPE IF EXISTS "public"."enum_inschrijvingen_ploegen_thuisdag";
  DROP TYPE IF EXISTS "public"."enum_inschrijvingen_status";
  DROP TYPE IF EXISTS "public"."enum_inschrijvingsrondes_status";
  DROP TYPE IF EXISTS "public"."enum_teams_thuisdag";
  DROP TYPE IF EXISTS "public"."enum_verplaatsingsaanvragen_status";`)
}
