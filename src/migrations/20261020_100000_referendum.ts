import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Referendum (lib/referendum.ts): stemrondes per seizoen en de (geheime) stemmen — elk 5..1 punten
// aan vijf spelers. Zie collections/Referendum.ts. Het bestaande archief (referendum_awards) blijft.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_referendum_rondes_status" AS ENUM('voorbereiding', 'open', 'gesloten', 'gepubliceerd');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_referendum_stemmen_competitie" AS ENUM('heren', 'dames');
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE TABLE IF NOT EXISTS "referendum_rondes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"seizoen" varchar NOT NULL,
  	"status" "enum_referendum_rondes_status" DEFAULT 'voorbereiding' NOT NULL,
  	"reeks_heren" varchar DEFAULT '1NAH',
  	"reeks_dames" varchar DEFAULT '1NAD',
  	"min_wedstrijden" numeric DEFAULT 5,
  	"max_leeftijd_belofte" numeric DEFAULT 21,
  	"peildatum" timestamp(3) with time zone,
  	"gepubliceerd_op" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE IF NOT EXISTS "referendum_stemmen" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"ronde_id" integer NOT NULL,
  	"stemmer_id" integer NOT NULL,
  	"competitie" "enum_referendum_stemmen_competitie" NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE IF NOT EXISTS "referendum_stemmen_regels" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"speler_id" integer NOT NULL,
  	"punten" numeric NOT NULL
  );
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "referendum_rondes_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "referendum_stemmen_id" integer;

  DO $$ BEGIN
    ALTER TABLE "referendum_stemmen" ADD CONSTRAINT "referendum_stemmen_ronde_id_referendum_rondes_id_fk" FOREIGN KEY ("ronde_id") REFERENCES "public"."referendum_rondes"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "referendum_stemmen" ADD CONSTRAINT "referendum_stemmen_stemmer_id_players_id_fk" FOREIGN KEY ("stemmer_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "referendum_stemmen_regels" ADD CONSTRAINT "referendum_stemmen_regels_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."referendum_stemmen"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "referendum_stemmen_regels" ADD CONSTRAINT "referendum_stemmen_regels_speler_id_players_id_fk" FOREIGN KEY ("speler_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_referendum_rondes_fk" FOREIGN KEY ("referendum_rondes_id") REFERENCES "public"."referendum_rondes"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_referendum_stemmen_fk" FOREIGN KEY ("referendum_stemmen_id") REFERENCES "public"."referendum_stemmen"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE UNIQUE INDEX IF NOT EXISTS "referendum_rondes_seizoen_idx" ON "referendum_rondes" USING btree ("seizoen");
  CREATE INDEX IF NOT EXISTS "referendum_rondes_updated_at_idx" ON "referendum_rondes" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "referendum_rondes_created_at_idx" ON "referendum_rondes" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "referendum_stemmen_ronde_idx" ON "referendum_stemmen" USING btree ("ronde_id");
  CREATE INDEX IF NOT EXISTS "referendum_stemmen_stemmer_idx" ON "referendum_stemmen" USING btree ("stemmer_id");
  CREATE INDEX IF NOT EXISTS "referendum_stemmen_updated_at_idx" ON "referendum_stemmen" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "referendum_stemmen_created_at_idx" ON "referendum_stemmen" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "referendum_stemmen_regels_order_idx" ON "referendum_stemmen_regels" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "referendum_stemmen_regels_parent_id_idx" ON "referendum_stemmen_regels" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "referendum_stemmen_regels_speler_idx" ON "referendum_stemmen_regels" USING btree ("speler_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_referendum_rondes_id_idx" ON "payload_locked_documents_rels" USING btree ("referendum_rondes_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_referendum_stemmen_id_idx" ON "payload_locked_documents_rels" USING btree ("referendum_stemmen_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_referendum_rondes_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_referendum_stemmen_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_referendum_rondes_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_referendum_stemmen_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "referendum_rondes_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "referendum_stemmen_id";
  DROP TABLE IF EXISTS "referendum_stemmen_regels" CASCADE;
  DROP TABLE IF EXISTS "referendum_stemmen" CASCADE;
  DROP TABLE IF EXISTS "referendum_rondes" CASCADE;
  DROP TYPE IF EXISTS "public"."enum_referendum_stemmen_competitie";
  DROP TYPE IF EXISTS "public"."enum_referendum_rondes_status";`)
}
