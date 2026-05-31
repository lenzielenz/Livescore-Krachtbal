import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_roles" AS ENUM('admin', 'scorekeeper', 'viewer');
  CREATE TYPE "public"."enum_teams_category" AS ENUM('U12', 'U14', 'U16', 'U18', 'U20', 'senioren');
  CREATE TYPE "public"."enum_players_position" AS ENUM('achter', 'vleugel', 'barage');
  CREATE TYPE "public"."enum_matches_category" AS ENUM('U12', 'U14', 'U16', 'U18', 'U20', 'senioren');
  CREATE TYPE "public"."enum_matches_status" AS ENUM('scheduled', 'live', 'finished');
  CREATE TYPE "public"."enum_possessions_setup_side" AS ENUM('own', 'opponent');
  CREATE TYPE "public"."enum_possessions_dir" AS ENUM('up', 'down');
  CREATE TYPE "public"."enum_possessions_end_outcome" AS ENUM('goal', 'caught', 'out_side', 'out_back', 'midline_fault', 'throws_exhausted');
  CREATE TYPE "public"."enum_throws_type" AS ENUM('nek', 'rug');
  CREATE TYPE "public"."enum_throws_outcome" AS ENUM('in_field', 'goal', 'caught', 'out_side', 'out_back');
  CREATE TYPE "public"."enum_throws_zone" AS ENUM('links', 'midden', 'rechts');
  CREATE TYPE "public"."enum_match_events_type" AS ENUM('timeout', 'referee_stop', 'half_start', 'half_end');
  CREATE TABLE "users_roles" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_users_roles",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar NOT NULL,
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
  
  CREATE TABLE "teams" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"category" "enum_teams_category" NOT NULL,
  	"logo_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "players" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"team_id" integer NOT NULL,
  	"shirt_number" numeric NOT NULL,
  	"position" "enum_players_position",
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "matches" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"home_team_id" integer NOT NULL,
  	"away_team_id" integer NOT NULL,
  	"date" timestamp(3) with time zone NOT NULL,
  	"category" "enum_matches_category" NOT NULL,
  	"status" "enum_matches_status" DEFAULT 'scheduled' NOT NULL,
  	"current_half" numeric DEFAULT 1,
  	"clock_seconds" numeric DEFAULT 0,
  	"clock_running" boolean DEFAULT false,
  	"clock_updated_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "matches_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"players_id" integer
  );
  
  CREATE TABLE "possessions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"match_id" integer NOT NULL,
  	"team_id" integer NOT NULL,
  	"setup_side" "enum_possessions_setup_side" NOT NULL,
  	"throws_allowed" numeric,
  	"setup_x" numeric,
  	"setup_y" numeric,
  	"dir" "enum_possessions_dir",
  	"start_half" numeric,
  	"start_clock" numeric,
  	"free_throw" boolean DEFAULT false,
  	"end_outcome" "enum_possessions_end_outcome",
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "throws" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"match_id" integer NOT NULL,
  	"possession_id" integer NOT NULL,
  	"team_id" integer NOT NULL,
  	"player_id" integer NOT NULL,
  	"throw_number" numeric NOT NULL,
  	"type" "enum_throws_type" DEFAULT 'nek' NOT NULL,
  	"outcome" "enum_throws_outcome" NOT NULL,
  	"landing_x" numeric NOT NULL,
  	"landing_y" numeric NOT NULL,
  	"distance" numeric,
  	"zone" "enum_throws_zone",
  	"touched_before_out" boolean DEFAULT false,
  	"period" numeric NOT NULL,
  	"game_clock" numeric NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "match_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"match_id" integer NOT NULL,
  	"type" "enum_match_events_type" NOT NULL,
  	"team_id" integer,
  	"half" numeric NOT NULL,
  	"game_clock" numeric NOT NULL,
  	"note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"media_id" integer,
  	"teams_id" integer,
  	"players_id" integer,
  	"matches_id" integer,
  	"possessions_id" integer,
  	"throws_id" integer,
  	"match_events_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "users_roles" ADD CONSTRAINT "users_roles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "teams" ADD CONSTRAINT "teams_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "players" ADD CONSTRAINT "players_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "matches" ADD CONSTRAINT "matches_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "matches" ADD CONSTRAINT "matches_away_team_id_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "matches_rels" ADD CONSTRAINT "matches_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "matches_rels" ADD CONSTRAINT "matches_rels_players_fk" FOREIGN KEY ("players_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "possessions" ADD CONSTRAINT "possessions_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "possessions" ADD CONSTRAINT "possessions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "throws" ADD CONSTRAINT "throws_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "throws" ADD CONSTRAINT "throws_possession_id_possessions_id_fk" FOREIGN KEY ("possession_id") REFERENCES "public"."possessions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "throws" ADD CONSTRAINT "throws_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "throws" ADD CONSTRAINT "throws_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "match_events" ADD CONSTRAINT "match_events_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "match_events" ADD CONSTRAINT "match_events_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_teams_fk" FOREIGN KEY ("teams_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_players_fk" FOREIGN KEY ("players_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_matches_fk" FOREIGN KEY ("matches_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_possessions_fk" FOREIGN KEY ("possessions_id") REFERENCES "public"."possessions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_throws_fk" FOREIGN KEY ("throws_id") REFERENCES "public"."throws"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_match_events_fk" FOREIGN KEY ("match_events_id") REFERENCES "public"."match_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_roles_order_idx" ON "users_roles" USING btree ("order");
  CREATE INDEX "users_roles_parent_idx" ON "users_roles" USING btree ("parent_id");
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX "teams_logo_idx" ON "teams" USING btree ("logo_id");
  CREATE INDEX "teams_updated_at_idx" ON "teams" USING btree ("updated_at");
  CREATE INDEX "teams_created_at_idx" ON "teams" USING btree ("created_at");
  CREATE INDEX "players_team_idx" ON "players" USING btree ("team_id");
  CREATE INDEX "players_updated_at_idx" ON "players" USING btree ("updated_at");
  CREATE INDEX "players_created_at_idx" ON "players" USING btree ("created_at");
  CREATE INDEX "matches_home_team_idx" ON "matches" USING btree ("home_team_id");
  CREATE INDEX "matches_away_team_idx" ON "matches" USING btree ("away_team_id");
  CREATE INDEX "matches_updated_at_idx" ON "matches" USING btree ("updated_at");
  CREATE INDEX "matches_created_at_idx" ON "matches" USING btree ("created_at");
  CREATE INDEX "matches_rels_order_idx" ON "matches_rels" USING btree ("order");
  CREATE INDEX "matches_rels_parent_idx" ON "matches_rels" USING btree ("parent_id");
  CREATE INDEX "matches_rels_path_idx" ON "matches_rels" USING btree ("path");
  CREATE INDEX "matches_rels_players_id_idx" ON "matches_rels" USING btree ("players_id");
  CREATE INDEX "possessions_match_idx" ON "possessions" USING btree ("match_id");
  CREATE INDEX "possessions_team_idx" ON "possessions" USING btree ("team_id");
  CREATE INDEX "possessions_updated_at_idx" ON "possessions" USING btree ("updated_at");
  CREATE INDEX "possessions_created_at_idx" ON "possessions" USING btree ("created_at");
  CREATE INDEX "throws_match_idx" ON "throws" USING btree ("match_id");
  CREATE INDEX "throws_possession_idx" ON "throws" USING btree ("possession_id");
  CREATE INDEX "throws_team_idx" ON "throws" USING btree ("team_id");
  CREATE INDEX "throws_player_idx" ON "throws" USING btree ("player_id");
  CREATE INDEX "throws_updated_at_idx" ON "throws" USING btree ("updated_at");
  CREATE INDEX "throws_created_at_idx" ON "throws" USING btree ("created_at");
  CREATE INDEX "match_events_match_idx" ON "match_events" USING btree ("match_id");
  CREATE INDEX "match_events_team_idx" ON "match_events" USING btree ("team_id");
  CREATE INDEX "match_events_updated_at_idx" ON "match_events" USING btree ("updated_at");
  CREATE INDEX "match_events_created_at_idx" ON "match_events" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_teams_id_idx" ON "payload_locked_documents_rels" USING btree ("teams_id");
  CREATE INDEX "payload_locked_documents_rels_players_id_idx" ON "payload_locked_documents_rels" USING btree ("players_id");
  CREATE INDEX "payload_locked_documents_rels_matches_id_idx" ON "payload_locked_documents_rels" USING btree ("matches_id");
  CREATE INDEX "payload_locked_documents_rels_possessions_id_idx" ON "payload_locked_documents_rels" USING btree ("possessions_id");
  CREATE INDEX "payload_locked_documents_rels_throws_id_idx" ON "payload_locked_documents_rels" USING btree ("throws_id");
  CREATE INDEX "payload_locked_documents_rels_match_events_id_idx" ON "payload_locked_documents_rels" USING btree ("match_events_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "users_roles" CASCADE;
  DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "teams" CASCADE;
  DROP TABLE "players" CASCADE;
  DROP TABLE "matches" CASCADE;
  DROP TABLE "matches_rels" CASCADE;
  DROP TABLE "possessions" CASCADE;
  DROP TABLE "throws" CASCADE;
  DROP TABLE "match_events" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."enum_users_roles";
  DROP TYPE "public"."enum_teams_category";
  DROP TYPE "public"."enum_players_position";
  DROP TYPE "public"."enum_matches_category";
  DROP TYPE "public"."enum_matches_status";
  DROP TYPE "public"."enum_possessions_setup_side";
  DROP TYPE "public"."enum_possessions_dir";
  DROP TYPE "public"."enum_possessions_end_outcome";
  DROP TYPE "public"."enum_throws_type";
  DROP TYPE "public"."enum_throws_outcome";
  DROP TYPE "public"."enum_throws_zone";
  DROP TYPE "public"."enum_match_events_type";`)
}
