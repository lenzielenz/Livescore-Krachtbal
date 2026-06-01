import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_players_vergunningsstatus" AS ENUM('geen', 'aangevraagd', 'geldig');
  CREATE TYPE "public"."enum_matchsheets_status" AS ENUM('concept', 'vrijgegeven', 'wedstrijdklaar', 'bezig', 'af_te_tekenen', 'ingediend');
  CREATE TYPE "public"."enum_matchsheets_keuring_terrein" AS ENUM('ok', 'niet_ok', 'nvt');
  CREATE TYPE "public"."enum_matchsheets_keuring_kleedkamers" AS ENUM('ok', 'niet_ok', 'nvt');
  CREATE TYPE "public"."enum_matchsheets_keuring_douches" AS ENUM('ok', 'niet_ok', 'nvt');
  CREATE TYPE "public"."enum_matchsheets_keuring_aantekentafel" AS ENUM('ok', 'niet_ok', 'nvt');
  CREATE TYPE "public"."enum_matchsheets_keuring_scorebord" AS ENUM('ok', 'niet_ok', 'nvt');
  CREATE TYPE "public"."enum_matchsheets_keuring_grensrechtersvlag" AS ENUM('ok', 'niet_ok', 'nvt');
  CREATE TYPE "public"."enum_matchsheets_keuring_ehbo" AS ENUM('ok', 'niet_ok', 'nvt');
  CREATE TYPE "public"."enum_matchsheets_keuring_bal" AS ENUM('ok', 'niet_ok', 'nvt');
  CREATE TYPE "public"."enum_matchsheets_keuring_kenteken_grensrechter" AS ENUM('ok', 'niet_ok', 'nvt');
  CREATE TYPE "public"."enum_matchsheets_keuring_verlichting" AS ENUM('ok', 'niet_ok', 'nvt');
  CREATE TYPE "public"."enum_officials_type" AS ENUM('scheidsrechter', 'grensrechter', 'aantekenaar', 'tijdopnemer');
  ALTER TYPE "public"."enum_users_roles" ADD VALUE 'federatie' BEFORE 'scorekeeper';
  ALTER TYPE "public"."enum_users_roles" ADD VALUE 'scheidsrechter' BEFORE 'scorekeeper';
  ALTER TYPE "public"."enum_users_roles" ADD VALUE 'club-beheerder' BEFORE 'scorekeeper';
  ALTER TYPE "public"."enum_users_roles" ADD VALUE 'kapitein' BEFORE 'scorekeeper';
  CREATE TABLE "matchsheets_home_lineup" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"player_id" integer NOT NULL,
  	"rugnummer" numeric,
  	"deelgenomen" boolean DEFAULT false,
  	"ib_gecontroleerd" boolean DEFAULT false
  );
  
  CREATE TABLE "matchsheets_away_lineup" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"player_id" integer NOT NULL,
  	"rugnummer" numeric,
  	"deelgenomen" boolean DEFAULT false,
  	"ib_gecontroleerd" boolean DEFAULT false
  );
  
  CREATE TABLE "matchsheets_uitsluitingen" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"player_id" integer,
  	"naam" varchar,
  	"reden" varchar,
  	"score" varchar,
  	"speeltijd" varchar
  );
  
  CREATE TABLE "matchsheets_voorbehoud" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"naam" varchar,
  	"reden" varchar,
  	"score" varchar
  );
  
  CREATE TABLE "matchsheets_override_log" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"wie_id" integer,
  	"wanneer" varchar,
  	"wat" varchar
  );
  
  CREATE TABLE "matchsheets" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"titel" varchar,
  	"match_id" integer NOT NULL,
  	"status" "enum_matchsheets_status" DEFAULT 'concept' NOT NULL,
  	"assigned_referee_id" integer,
  	"assigned_linesman_id" integer,
  	"keuring_terrein" "enum_matchsheets_keuring_terrein" DEFAULT 'ok',
  	"keuring_kleedkamers" "enum_matchsheets_keuring_kleedkamers" DEFAULT 'ok',
  	"keuring_douches" "enum_matchsheets_keuring_douches" DEFAULT 'ok',
  	"keuring_aantekentafel" "enum_matchsheets_keuring_aantekentafel" DEFAULT 'ok',
  	"keuring_scorebord" "enum_matchsheets_keuring_scorebord" DEFAULT 'ok',
  	"keuring_grensrechtersvlag" "enum_matchsheets_keuring_grensrechtersvlag" DEFAULT 'ok',
  	"keuring_ehbo" "enum_matchsheets_keuring_ehbo" DEFAULT 'ok',
  	"keuring_bal" "enum_matchsheets_keuring_bal" DEFAULT 'ok',
  	"keuring_kenteken_grensrechter" "enum_matchsheets_keuring_kenteken_grensrechter" DEFAULT 'ok',
  	"keuring_verlichting" "enum_matchsheets_keuring_verlichting" DEFAULT 'ok',
  	"opmerkingen" varchar,
  	"kapitein_thuis_akkoord" boolean DEFAULT false,
  	"kapitein_thuis_naam" varchar,
  	"kapitein_thuis_handtekening" varchar,
  	"kapitein_thuis_tijdstip" timestamp(3) with time zone,
  	"kapitein_uit_akkoord" boolean DEFAULT false,
  	"kapitein_uit_naam" varchar,
  	"kapitein_uit_handtekening" varchar,
  	"kapitein_uit_tijdstip" timestamp(3) with time zone,
  	"scheidsrechter_akkoord" boolean DEFAULT false,
  	"scheidsrechter_naam" varchar,
  	"scheidsrechter_handtekening" varchar,
  	"scheidsrechter_tijdstip" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "officials" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"type" "enum_officials_type" NOT NULL,
  	"federation_number" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "sanctions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"player_id" integer NOT NULL,
  	"aantal" numeric DEFAULT 1 NOT NULL,
  	"datum" timestamp(3) with time zone,
  	"vervallen_op" timestamp(3) with time zone,
  	"reden" varchar,
  	"bron" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "season" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"start_year" numeric NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"release_minutes_before" numeric DEFAULT 60 NOT NULL,
  	"knipjes_drempel" numeric DEFAULT 3 NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "teams" ALTER COLUMN "club_id" SET NOT NULL;
  ALTER TABLE "clubs" ADD COLUMN "email" varchar;
  ALTER TABLE "players" ADD COLUMN "birth_date" timestamp(3) with time zone;
  ALTER TABLE "players" ADD COLUMN "vergunningsstatus" "enum_players_vergunningsstatus" DEFAULT 'geen';
  ALTER TABLE "players" ADD COLUMN "medisch_attest" boolean DEFAULT false;
  ALTER TABLE "players" ADD COLUMN "hoger_spelen_verbod" boolean DEFAULT false;
  ALTER TABLE "players" ADD COLUMN "actief" boolean DEFAULT true;
  ALTER TABLE "users" ADD COLUMN "club_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "matchsheets_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "officials_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "sanctions_id" integer;
  ALTER TABLE "matchsheets_home_lineup" ADD CONSTRAINT "matchsheets_home_lineup_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "matchsheets_home_lineup" ADD CONSTRAINT "matchsheets_home_lineup_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."matchsheets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "matchsheets_away_lineup" ADD CONSTRAINT "matchsheets_away_lineup_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "matchsheets_away_lineup" ADD CONSTRAINT "matchsheets_away_lineup_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."matchsheets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "matchsheets_uitsluitingen" ADD CONSTRAINT "matchsheets_uitsluitingen_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "matchsheets_uitsluitingen" ADD CONSTRAINT "matchsheets_uitsluitingen_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."matchsheets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "matchsheets_voorbehoud" ADD CONSTRAINT "matchsheets_voorbehoud_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."matchsheets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "matchsheets_override_log" ADD CONSTRAINT "matchsheets_override_log_wie_id_users_id_fk" FOREIGN KEY ("wie_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "matchsheets_override_log" ADD CONSTRAINT "matchsheets_override_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."matchsheets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "matchsheets" ADD CONSTRAINT "matchsheets_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "matchsheets" ADD CONSTRAINT "matchsheets_assigned_referee_id_officials_id_fk" FOREIGN KEY ("assigned_referee_id") REFERENCES "public"."officials"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "matchsheets" ADD CONSTRAINT "matchsheets_assigned_linesman_id_officials_id_fk" FOREIGN KEY ("assigned_linesman_id") REFERENCES "public"."officials"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "matchsheets_home_lineup_order_idx" ON "matchsheets_home_lineup" USING btree ("_order");
  CREATE INDEX "matchsheets_home_lineup_parent_id_idx" ON "matchsheets_home_lineup" USING btree ("_parent_id");
  CREATE INDEX "matchsheets_home_lineup_player_idx" ON "matchsheets_home_lineup" USING btree ("player_id");
  CREATE INDEX "matchsheets_away_lineup_order_idx" ON "matchsheets_away_lineup" USING btree ("_order");
  CREATE INDEX "matchsheets_away_lineup_parent_id_idx" ON "matchsheets_away_lineup" USING btree ("_parent_id");
  CREATE INDEX "matchsheets_away_lineup_player_idx" ON "matchsheets_away_lineup" USING btree ("player_id");
  CREATE INDEX "matchsheets_uitsluitingen_order_idx" ON "matchsheets_uitsluitingen" USING btree ("_order");
  CREATE INDEX "matchsheets_uitsluitingen_parent_id_idx" ON "matchsheets_uitsluitingen" USING btree ("_parent_id");
  CREATE INDEX "matchsheets_uitsluitingen_player_idx" ON "matchsheets_uitsluitingen" USING btree ("player_id");
  CREATE INDEX "matchsheets_voorbehoud_order_idx" ON "matchsheets_voorbehoud" USING btree ("_order");
  CREATE INDEX "matchsheets_voorbehoud_parent_id_idx" ON "matchsheets_voorbehoud" USING btree ("_parent_id");
  CREATE INDEX "matchsheets_override_log_order_idx" ON "matchsheets_override_log" USING btree ("_order");
  CREATE INDEX "matchsheets_override_log_parent_id_idx" ON "matchsheets_override_log" USING btree ("_parent_id");
  CREATE INDEX "matchsheets_override_log_wie_idx" ON "matchsheets_override_log" USING btree ("wie_id");
  CREATE UNIQUE INDEX "matchsheets_match_idx" ON "matchsheets" USING btree ("match_id");
  CREATE INDEX "matchsheets_assigned_referee_idx" ON "matchsheets" USING btree ("assigned_referee_id");
  CREATE INDEX "matchsheets_assigned_linesman_idx" ON "matchsheets" USING btree ("assigned_linesman_id");
  CREATE INDEX "matchsheets_updated_at_idx" ON "matchsheets" USING btree ("updated_at");
  CREATE INDEX "matchsheets_created_at_idx" ON "matchsheets" USING btree ("created_at");
  CREATE INDEX "officials_updated_at_idx" ON "officials" USING btree ("updated_at");
  CREATE INDEX "officials_created_at_idx" ON "officials" USING btree ("created_at");
  CREATE INDEX "sanctions_player_idx" ON "sanctions" USING btree ("player_id");
  CREATE INDEX "sanctions_updated_at_idx" ON "sanctions" USING btree ("updated_at");
  CREATE INDEX "sanctions_created_at_idx" ON "sanctions" USING btree ("created_at");
  ALTER TABLE "users" ADD CONSTRAINT "users_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_matchsheets_fk" FOREIGN KEY ("matchsheets_id") REFERENCES "public"."matchsheets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_officials_fk" FOREIGN KEY ("officials_id") REFERENCES "public"."officials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sanctions_fk" FOREIGN KEY ("sanctions_id") REFERENCES "public"."sanctions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_club_idx" ON "users" USING btree ("club_id");
  CREATE INDEX "payload_locked_documents_rels_matchsheets_id_idx" ON "payload_locked_documents_rels" USING btree ("matchsheets_id");
  CREATE INDEX "payload_locked_documents_rels_officials_id_idx" ON "payload_locked_documents_rels" USING btree ("officials_id");
  CREATE INDEX "payload_locked_documents_rels_sanctions_id_idx" ON "payload_locked_documents_rels" USING btree ("sanctions_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "matchsheets_home_lineup" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "matchsheets_away_lineup" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "matchsheets_uitsluitingen" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "matchsheets_voorbehoud" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "matchsheets_override_log" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "matchsheets" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "officials" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "sanctions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "season" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "settings" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "matchsheets_home_lineup" CASCADE;
  DROP TABLE "matchsheets_away_lineup" CASCADE;
  DROP TABLE "matchsheets_uitsluitingen" CASCADE;
  DROP TABLE "matchsheets_voorbehoud" CASCADE;
  DROP TABLE "matchsheets_override_log" CASCADE;
  DROP TABLE "matchsheets" CASCADE;
  DROP TABLE "officials" CASCADE;
  DROP TABLE "sanctions" CASCADE;
  DROP TABLE "season" CASCADE;
  DROP TABLE "settings" CASCADE;
  ALTER TABLE "users" DROP CONSTRAINT "users_club_id_clubs_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_matchsheets_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_officials_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_sanctions_fk";
  
  ALTER TABLE "users_roles" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_users_roles";
  CREATE TYPE "public"."enum_users_roles" AS ENUM('admin', 'scorekeeper', 'viewer');
  ALTER TABLE "users_roles" ALTER COLUMN "value" SET DATA TYPE "public"."enum_users_roles" USING "value"::"public"."enum_users_roles";
  DROP INDEX "users_club_idx";
  DROP INDEX "payload_locked_documents_rels_matchsheets_id_idx";
  DROP INDEX "payload_locked_documents_rels_officials_id_idx";
  DROP INDEX "payload_locked_documents_rels_sanctions_id_idx";
  ALTER TABLE "teams" ALTER COLUMN "club_id" DROP NOT NULL;
  ALTER TABLE "clubs" DROP COLUMN "email";
  ALTER TABLE "players" DROP COLUMN "birth_date";
  ALTER TABLE "players" DROP COLUMN "vergunningsstatus";
  ALTER TABLE "players" DROP COLUMN "medisch_attest";
  ALTER TABLE "players" DROP COLUMN "hoger_spelen_verbod";
  ALTER TABLE "players" DROP COLUMN "actief";
  ALTER TABLE "users" DROP COLUMN "club_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "matchsheets_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "officials_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "sanctions_id";
  DROP TYPE "public"."enum_players_vergunningsstatus";
  DROP TYPE "public"."enum_matchsheets_status";
  DROP TYPE "public"."enum_matchsheets_keuring_terrein";
  DROP TYPE "public"."enum_matchsheets_keuring_kleedkamers";
  DROP TYPE "public"."enum_matchsheets_keuring_douches";
  DROP TYPE "public"."enum_matchsheets_keuring_aantekentafel";
  DROP TYPE "public"."enum_matchsheets_keuring_scorebord";
  DROP TYPE "public"."enum_matchsheets_keuring_grensrechtersvlag";
  DROP TYPE "public"."enum_matchsheets_keuring_ehbo";
  DROP TYPE "public"."enum_matchsheets_keuring_bal";
  DROP TYPE "public"."enum_matchsheets_keuring_kenteken_grensrechter";
  DROP TYPE "public"."enum_matchsheets_keuring_verlichting";
  DROP TYPE "public"."enum_officials_type";`)
}
