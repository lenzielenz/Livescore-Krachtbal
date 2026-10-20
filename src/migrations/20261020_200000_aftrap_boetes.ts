import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Wedstrijddag en federatie:
// - aftrap_wijzigingen: logboek van verschoven aftrappen (lib/aftrap.ts), met de betrokken clubs;
// - boete_soorten + boetes: de boetelijst van de federatie en de boetes aan clubs (lib/boetes.ts);
// - settings: wie de scheidsrechterskosten en de kosten bij forfait draagt.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_aftrap_wijzigingen_reden" AS ENUM('file', 'ziekte', 'uitloop', 'vervroegen', 'terrein', 'scheidsrechter', 'ander');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_boete_soorten_trigger" AS ENUM('geen', 'forfait', 'blad_te_laat', 'te_laat');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_boetes_bron" AS ENUM('automatisch', 'manueel');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_boetes_status" AS ENUM('voorstel', 'opgelegd', 'betaling_gemeld', 'betaald', 'betwist', 'vernietigd');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_settings_forfait_kosten_betaler" AS ENUM('federatie', 'forfaitploeg');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_settings_scheidsrechter_kosten_betaler" AS ENUM('federatie', 'thuisclub', 'gedeeld');
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE TABLE IF NOT EXISTS "aftrap_wijzigingen" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"match_id" integer NOT NULL,
  	"van" timestamp(3) with time zone NOT NULL,
  	"naar" timestamp(3) with time zone NOT NULL,
  	"reden" "enum_aftrap_wijzigingen_reden" NOT NULL,
  	"toelichting" varchar,
  	"gemeld_door_id" integer,
  	"gemeld_door_naam" varchar,
  	"aanleiding_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE IF NOT EXISTS "aftrap_wijzigingen_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"clubs_id" integer
  );
  CREATE TABLE IF NOT EXISTS "boete_soorten" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"naam" varchar NOT NULL,
  	"artikel" varchar,
  	"bedrag" numeric NOT NULL,
  	"trigger" "enum_boete_soorten_trigger" DEFAULT 'geen',
  	"termijn_dagen" numeric,
  	"actief" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE IF NOT EXISTS "boetes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"club_id" integer NOT NULL,
  	"soort_id" integer,
  	"match_id" integer,
  	"omschrijving" varchar NOT NULL,
  	"bedrag" numeric NOT NULL,
  	"status" "enum_boetes_status" DEFAULT 'voorstel',
  	"bron" "enum_boetes_bron" DEFAULT 'manueel',
  	"sleutel" varchar,
  	"opgelegd_op" timestamp(3) with time zone,
  	"betaling_gemeld_op" timestamp(3) with time zone,
  	"betaald_op" timestamp(3) with time zone,
  	"club_opmerking" varchar,
  	"federatie_opmerking" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "scheidsrechter_kosten_betaler" "enum_settings_scheidsrechter_kosten_betaler";
  ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "forfait_kosten_betaler" "enum_settings_forfait_kosten_betaler";
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "aftrap_wijzigingen_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "boete_soorten_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "boetes_id" integer;

  DO $$ BEGIN
    ALTER TABLE "aftrap_wijzigingen" ADD CONSTRAINT "aftrap_wijzigingen_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "aftrap_wijzigingen" ADD CONSTRAINT "aftrap_wijzigingen_gemeld_door_id_users_id_fk" FOREIGN KEY ("gemeld_door_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "aftrap_wijzigingen" ADD CONSTRAINT "aftrap_wijzigingen_aanleiding_id_aftrap_wijzigingen_id_fk" FOREIGN KEY ("aanleiding_id") REFERENCES "public"."aftrap_wijzigingen"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "aftrap_wijzigingen_rels" ADD CONSTRAINT "aftrap_wijzigingen_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."aftrap_wijzigingen"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "aftrap_wijzigingen_rels" ADD CONSTRAINT "aftrap_wijzigingen_rels_clubs_fk" FOREIGN KEY ("clubs_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "boetes" ADD CONSTRAINT "boetes_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "boetes" ADD CONSTRAINT "boetes_soort_id_boete_soorten_id_fk" FOREIGN KEY ("soort_id") REFERENCES "public"."boete_soorten"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "boetes" ADD CONSTRAINT "boetes_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_aftrap_wijzigingen_fk" FOREIGN KEY ("aftrap_wijzigingen_id") REFERENCES "public"."aftrap_wijzigingen"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_boete_soorten_fk" FOREIGN KEY ("boete_soorten_id") REFERENCES "public"."boete_soorten"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_boetes_fk" FOREIGN KEY ("boetes_id") REFERENCES "public"."boetes"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE INDEX IF NOT EXISTS "aftrap_wijzigingen_match_idx" ON "aftrap_wijzigingen" USING btree ("match_id");
  CREATE INDEX IF NOT EXISTS "aftrap_wijzigingen_gemeld_door_idx" ON "aftrap_wijzigingen" USING btree ("gemeld_door_id");
  CREATE INDEX IF NOT EXISTS "aftrap_wijzigingen_aanleiding_idx" ON "aftrap_wijzigingen" USING btree ("aanleiding_id");
  CREATE INDEX IF NOT EXISTS "aftrap_wijzigingen_updated_at_idx" ON "aftrap_wijzigingen" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "aftrap_wijzigingen_created_at_idx" ON "aftrap_wijzigingen" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "aftrap_wijzigingen_rels_order_idx" ON "aftrap_wijzigingen_rels" USING btree ("order");
  CREATE INDEX IF NOT EXISTS "aftrap_wijzigingen_rels_parent_idx" ON "aftrap_wijzigingen_rels" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "aftrap_wijzigingen_rels_path_idx" ON "aftrap_wijzigingen_rels" USING btree ("path");
  CREATE INDEX IF NOT EXISTS "aftrap_wijzigingen_rels_clubs_id_idx" ON "aftrap_wijzigingen_rels" USING btree ("clubs_id");
  CREATE INDEX IF NOT EXISTS "boete_soorten_updated_at_idx" ON "boete_soorten" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "boete_soorten_created_at_idx" ON "boete_soorten" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "boetes_club_idx" ON "boetes" USING btree ("club_id");
  CREATE INDEX IF NOT EXISTS "boetes_soort_idx" ON "boetes" USING btree ("soort_id");
  CREATE INDEX IF NOT EXISTS "boetes_match_idx" ON "boetes" USING btree ("match_id");
  CREATE INDEX IF NOT EXISTS "boetes_status_idx" ON "boetes" USING btree ("status");
  CREATE UNIQUE INDEX IF NOT EXISTS "boetes_sleutel_idx" ON "boetes" USING btree ("sleutel");
  CREATE INDEX IF NOT EXISTS "boetes_updated_at_idx" ON "boetes" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "boetes_created_at_idx" ON "boetes" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_aftrap_wijzigingen_id_idx" ON "payload_locked_documents_rels" USING btree ("aftrap_wijzigingen_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_boete_soorten_id_idx" ON "payload_locked_documents_rels" USING btree ("boete_soorten_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_boetes_id_idx" ON "payload_locked_documents_rels" USING btree ("boetes_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_aftrap_wijzigingen_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_boete_soorten_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_boetes_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_aftrap_wijzigingen_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_boete_soorten_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_boetes_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "aftrap_wijzigingen_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "boete_soorten_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "boetes_id";
  ALTER TABLE "settings" DROP COLUMN IF EXISTS "scheidsrechter_kosten_betaler";
  ALTER TABLE "settings" DROP COLUMN IF EXISTS "forfait_kosten_betaler";
  DROP TABLE IF EXISTS "boetes" CASCADE;
  DROP TABLE IF EXISTS "boete_soorten" CASCADE;
  DROP TABLE IF EXISTS "aftrap_wijzigingen_rels" CASCADE;
  DROP TABLE IF EXISTS "aftrap_wijzigingen" CASCADE;
  DROP TYPE IF EXISTS "public"."enum_aftrap_wijzigingen_reden";
  DROP TYPE IF EXISTS "public"."enum_boete_soorten_trigger";
  DROP TYPE IF EXISTS "public"."enum_boetes_bron";
  DROP TYPE IF EXISTS "public"."enum_boetes_status";
  DROP TYPE IF EXISTS "public"."enum_settings_forfait_kosten_betaler";
  DROP TYPE IF EXISTS "public"."enum_settings_scheidsrechter_kosten_betaler";`)
}
