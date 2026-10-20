import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Wedstrijddag: blessures en afgelastingen.
// - accidents: club, moment, doorgegeven door, en het dossier (status, ingediend/afgehandeld, opmerking
//   federatie) — zie lib/blessure.ts en lib/ongeval-dossier.ts;
// - ongeval_documenten: de ingevulde aangifte en het geneeskundig getuigschrift (upload);
// - afgelastingen + afgelasting_fotos: de scheidsrechter gelast af met foto's (lib/afgelasting.ts);
// - matches.afgelast: de wedstrijd kan niet starten tot de federatie herplant.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_accidents_status" AS ENUM('gemeld', 'ingediend', 'afgehandeld');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_ongeval_documenten_soort" AS ENUM('aangifte', 'getuigschrift', 'ander');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_afgelastingen_reden" AS ENUM('terrein', 'weer', 'ander');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_afgelastingen_status" AS ENUM('gemeld', 'herpland', 'ingetrokken');
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  ALTER TABLE "accidents" ADD COLUMN IF NOT EXISTS "club_id" integer;
  ALTER TABLE "accidents" ADD COLUMN IF NOT EXISTS "moment" varchar;
  ALTER TABLE "accidents" ADD COLUMN IF NOT EXISTS "gemeld_door_id" integer;
  ALTER TABLE "accidents" ADD COLUMN IF NOT EXISTS "status" "enum_accidents_status" DEFAULT 'gemeld';
  ALTER TABLE "accidents" ADD COLUMN IF NOT EXISTS "ingediend_op" timestamp(3) with time zone;
  ALTER TABLE "accidents" ADD COLUMN IF NOT EXISTS "afgehandeld_op" timestamp(3) with time zone;
  ALTER TABLE "accidents" ADD COLUMN IF NOT EXISTS "federatie_opmerking" varchar;
  ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "afgelast" boolean DEFAULT false;

  CREATE TABLE IF NOT EXISTS "ongeval_documenten" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"accident_id" integer NOT NULL,
  	"player_id" integer,
  	"club_id" integer,
  	"soort" "enum_ongeval_documenten_soort" NOT NULL,
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
  CREATE TABLE IF NOT EXISTS "afgelastingen" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"match_id" integer NOT NULL,
  	"reden" "enum_afgelastingen_reden" NOT NULL,
  	"toelichting" varchar,
  	"oorspronkelijke_datum" timestamp(3) with time zone,
  	"gemeld_door_id" integer,
  	"scheidsrechter_naam" varchar,
  	"status" "enum_afgelastingen_status" DEFAULT 'gemeld',
  	"nieuwe_datum" timestamp(3) with time zone,
  	"behandeld_op" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE IF NOT EXISTS "afgelastingen_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"clubs_id" integer
  );
  CREATE TABLE IF NOT EXISTS "afgelasting_fotos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"afgelasting_id" integer NOT NULL,
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
  CREATE TABLE IF NOT EXISTS "afgelasting_fotos_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"clubs_id" integer
  );
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "ongeval_documenten_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "afgelastingen_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "afgelasting_fotos_id" integer;

  DO $$ BEGIN
    ALTER TABLE "accidents" ADD CONSTRAINT "accidents_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "accidents" ADD CONSTRAINT "accidents_gemeld_door_id_users_id_fk" FOREIGN KEY ("gemeld_door_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "ongeval_documenten" ADD CONSTRAINT "ongeval_documenten_accident_id_accidents_id_fk" FOREIGN KEY ("accident_id") REFERENCES "public"."accidents"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "ongeval_documenten" ADD CONSTRAINT "ongeval_documenten_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "ongeval_documenten" ADD CONSTRAINT "ongeval_documenten_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "ongeval_documenten" ADD CONSTRAINT "ongeval_documenten_geupload_door_id_users_id_fk" FOREIGN KEY ("geupload_door_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "afgelastingen" ADD CONSTRAINT "afgelastingen_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "afgelastingen" ADD CONSTRAINT "afgelastingen_gemeld_door_id_users_id_fk" FOREIGN KEY ("gemeld_door_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "afgelastingen_rels" ADD CONSTRAINT "afgelastingen_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."afgelastingen"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "afgelastingen_rels" ADD CONSTRAINT "afgelastingen_rels_clubs_fk" FOREIGN KEY ("clubs_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "afgelasting_fotos" ADD CONSTRAINT "afgelasting_fotos_afgelasting_id_afgelastingen_id_fk" FOREIGN KEY ("afgelasting_id") REFERENCES "public"."afgelastingen"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "afgelasting_fotos_rels" ADD CONSTRAINT "afgelasting_fotos_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."afgelasting_fotos"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "afgelasting_fotos_rels" ADD CONSTRAINT "afgelasting_fotos_rels_clubs_fk" FOREIGN KEY ("clubs_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ongeval_documenten_fk" FOREIGN KEY ("ongeval_documenten_id") REFERENCES "public"."ongeval_documenten"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_afgelastingen_fk" FOREIGN KEY ("afgelastingen_id") REFERENCES "public"."afgelastingen"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_afgelasting_fotos_fk" FOREIGN KEY ("afgelasting_fotos_id") REFERENCES "public"."afgelasting_fotos"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE INDEX IF NOT EXISTS "accidents_club_idx" ON "accidents" USING btree ("club_id");
  CREATE INDEX IF NOT EXISTS "accidents_gemeld_door_idx" ON "accidents" USING btree ("gemeld_door_id");
  CREATE INDEX IF NOT EXISTS "accidents_status_idx" ON "accidents" USING btree ("status");
  CREATE INDEX IF NOT EXISTS "ongeval_documenten_accident_idx" ON "ongeval_documenten" USING btree ("accident_id");
  CREATE INDEX IF NOT EXISTS "ongeval_documenten_player_idx" ON "ongeval_documenten" USING btree ("player_id");
  CREATE INDEX IF NOT EXISTS "ongeval_documenten_club_idx" ON "ongeval_documenten" USING btree ("club_id");
  CREATE INDEX IF NOT EXISTS "ongeval_documenten_geupload_door_idx" ON "ongeval_documenten" USING btree ("geupload_door_id");
  CREATE INDEX IF NOT EXISTS "ongeval_documenten_updated_at_idx" ON "ongeval_documenten" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "ongeval_documenten_created_at_idx" ON "ongeval_documenten" USING btree ("created_at");
  CREATE UNIQUE INDEX IF NOT EXISTS "ongeval_documenten_filename_idx" ON "ongeval_documenten" USING btree ("filename");
  CREATE INDEX IF NOT EXISTS "afgelastingen_match_idx" ON "afgelastingen" USING btree ("match_id");
  CREATE INDEX IF NOT EXISTS "afgelastingen_gemeld_door_idx" ON "afgelastingen" USING btree ("gemeld_door_id");
  CREATE INDEX IF NOT EXISTS "afgelastingen_status_idx" ON "afgelastingen" USING btree ("status");
  CREATE INDEX IF NOT EXISTS "afgelastingen_updated_at_idx" ON "afgelastingen" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "afgelastingen_created_at_idx" ON "afgelastingen" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "afgelastingen_rels_order_idx" ON "afgelastingen_rels" USING btree ("order");
  CREATE INDEX IF NOT EXISTS "afgelastingen_rels_parent_idx" ON "afgelastingen_rels" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "afgelastingen_rels_path_idx" ON "afgelastingen_rels" USING btree ("path");
  CREATE INDEX IF NOT EXISTS "afgelastingen_rels_clubs_id_idx" ON "afgelastingen_rels" USING btree ("clubs_id");
  CREATE INDEX IF NOT EXISTS "afgelasting_fotos_afgelasting_idx" ON "afgelasting_fotos" USING btree ("afgelasting_id");
  CREATE INDEX IF NOT EXISTS "afgelasting_fotos_updated_at_idx" ON "afgelasting_fotos" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "afgelasting_fotos_created_at_idx" ON "afgelasting_fotos" USING btree ("created_at");
  CREATE UNIQUE INDEX IF NOT EXISTS "afgelasting_fotos_filename_idx" ON "afgelasting_fotos" USING btree ("filename");
  CREATE INDEX IF NOT EXISTS "afgelasting_fotos_rels_order_idx" ON "afgelasting_fotos_rels" USING btree ("order");
  CREATE INDEX IF NOT EXISTS "afgelasting_fotos_rels_parent_idx" ON "afgelasting_fotos_rels" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "afgelasting_fotos_rels_path_idx" ON "afgelasting_fotos_rels" USING btree ("path");
  CREATE INDEX IF NOT EXISTS "afgelasting_fotos_rels_clubs_id_idx" ON "afgelasting_fotos_rels" USING btree ("clubs_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_ongeval_documenten_id_idx" ON "payload_locked_documents_rels" USING btree ("ongeval_documenten_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_afgelastingen_id_idx" ON "payload_locked_documents_rels" USING btree ("afgelastingen_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_afgelasting_fotos_id_idx" ON "payload_locked_documents_rels" USING btree ("afgelasting_fotos_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_ongeval_documenten_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_afgelastingen_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_afgelasting_fotos_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_ongeval_documenten_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_afgelastingen_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_afgelasting_fotos_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "ongeval_documenten_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "afgelastingen_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "afgelasting_fotos_id";
  DROP TABLE IF EXISTS "afgelasting_fotos_rels" CASCADE;
  DROP TABLE IF EXISTS "afgelasting_fotos" CASCADE;
  DROP TABLE IF EXISTS "afgelastingen_rels" CASCADE;
  DROP TABLE IF EXISTS "afgelastingen" CASCADE;
  DROP TABLE IF EXISTS "ongeval_documenten" CASCADE;
  ALTER TABLE "accidents" DROP CONSTRAINT IF EXISTS "accidents_club_id_clubs_id_fk";
  ALTER TABLE "accidents" DROP CONSTRAINT IF EXISTS "accidents_gemeld_door_id_users_id_fk";
  DROP INDEX IF EXISTS "accidents_club_idx";
  DROP INDEX IF EXISTS "accidents_gemeld_door_idx";
  DROP INDEX IF EXISTS "accidents_status_idx";
  ALTER TABLE "accidents" DROP COLUMN IF EXISTS "club_id";
  ALTER TABLE "accidents" DROP COLUMN IF EXISTS "moment";
  ALTER TABLE "accidents" DROP COLUMN IF EXISTS "gemeld_door_id";
  ALTER TABLE "accidents" DROP COLUMN IF EXISTS "status";
  ALTER TABLE "accidents" DROP COLUMN IF EXISTS "ingediend_op";
  ALTER TABLE "accidents" DROP COLUMN IF EXISTS "afgehandeld_op";
  ALTER TABLE "accidents" DROP COLUMN IF EXISTS "federatie_opmerking";
  ALTER TABLE "matches" DROP COLUMN IF EXISTS "afgelast";
  DROP TYPE IF EXISTS "public"."enum_accidents_status";
  DROP TYPE IF EXISTS "public"."enum_ongeval_documenten_soort";
  DROP TYPE IF EXISTS "public"."enum_afgelastingen_reden";
  DROP TYPE IF EXISTS "public"."enum_afgelastingen_status";`)
}
