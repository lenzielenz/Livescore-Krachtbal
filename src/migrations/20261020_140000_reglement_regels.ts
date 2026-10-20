import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Het reglement als bron (collections/Reglement.ts, lib/competitieregels.ts): reglementversies,
// verslagen, competitieregels als bouwstenen (vastspelen, eindronde) en de eindrondes die het
// systeem daaruit aanmaakt. Wedstrijden van een eindronde krijgen reeks 'EINDR' en een verwijzing
// naar hun eindronde, zodat de stand van elke gewone reeks zuiver blijft.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Een enumwaarde toevoegen kan niet samen met andere statements in één transactieblok die ze
  // gebruiken; apart en idempotent.
  await db.execute(sql`ALTER TYPE "public"."enum_matches_reeks" ADD VALUE IF NOT EXISTS 'EINDR';`)
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_reglementen_status" AS ENUM('concept', 'actief', 'archief');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_reglement_verslagen_status" AS ENUM('actief', 'ingetrokken');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_competitieregels_soort" AS ENUM('vastspelen', 'eindronde');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_competitieregels_categorie" AS ENUM('alle', 'U12', 'U14', 'U16', 'U18', 'U20', 'senioren');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_competitieregels_bron_reeksen" AS ENUM('1NAH', '1NAHB', '1NAD', '2NAH', '2NAHB', 'LH', 'LD', 'RHA', 'RHB', 'RHC', 'RDA', 'RDB', 'U18J', 'U18M', 'U16J', 'U16M', 'U16MA', 'U16MB', 'U14J', 'U14JA', 'U14JB', 'U14M', 'U12', 'U12A', 'U12B', 'recreatief', 'beker', 'andere');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_eindrondes_categorie" AS ENUM('U12', 'U14', 'U16', 'U18', 'U20', 'senioren');
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE TABLE IF NOT EXISTS "reglementen" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"titel" varchar NOT NULL,
  	"geldig_vanaf" timestamp(3) with time zone NOT NULL,
  	"status" "enum_reglementen_status" DEFAULT 'concept' NOT NULL,
  	"bron" varchar,
  	"inhoud" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE IF NOT EXISTS "reglement_verslagen" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"titel" varchar NOT NULL,
  	"datum" timestamp(3) with time zone NOT NULL,
  	"reglement_id" integer NOT NULL,
  	"artikel" varchar,
  	"status" "enum_reglement_verslagen_status" DEFAULT 'actief' NOT NULL,
  	"inhoud" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE IF NOT EXISTS "competitieregels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"naam" varchar NOT NULL,
  	"soort" "enum_competitieregels_soort" NOT NULL,
  	"actief" boolean DEFAULT true,
  	"reglement_id" integer,
  	"verslag_id" integer,
  	"artikel" varchar,
  	"max_keer_hoger" numeric,
  	"categorie" "enum_competitieregels_categorie" DEFAULT 'alle',
  	"top_per_reeks" numeric,
  	"eindronde_naam" varchar,
  	"heen_en_terug" boolean DEFAULT false,
  	"dagen_na_einde" numeric DEFAULT 7,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE IF NOT EXISTS "competitieregels_bron_reeksen" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_competitieregels_bron_reeksen",
  	"id" serial PRIMARY KEY NOT NULL
  );
  CREATE TABLE IF NOT EXISTS "eindrondes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"naam" varchar NOT NULL,
  	"seizoen" varchar NOT NULL,
  	"regel_id" integer NOT NULL,
  	"categorie" "enum_eindrondes_categorie" DEFAULT 'senioren',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE IF NOT EXISTS "eindrondes_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"teams_id" integer
  );
  ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "eindronde_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "reglementen_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "reglement_verslagen_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "competitieregels_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "eindrondes_id" integer;

  DO $$ BEGIN
    ALTER TABLE "reglement_verslagen" ADD CONSTRAINT "reglement_verslagen_reglement_id_reglementen_id_fk" FOREIGN KEY ("reglement_id") REFERENCES "public"."reglementen"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "competitieregels" ADD CONSTRAINT "competitieregels_reglement_id_reglementen_id_fk" FOREIGN KEY ("reglement_id") REFERENCES "public"."reglementen"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "competitieregels" ADD CONSTRAINT "competitieregels_verslag_id_reglement_verslagen_id_fk" FOREIGN KEY ("verslag_id") REFERENCES "public"."reglement_verslagen"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "competitieregels_bron_reeksen" ADD CONSTRAINT "competitieregels_bron_reeksen_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."competitieregels"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "eindrondes" ADD CONSTRAINT "eindrondes_regel_id_competitieregels_id_fk" FOREIGN KEY ("regel_id") REFERENCES "public"."competitieregels"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "eindrondes_rels" ADD CONSTRAINT "eindrondes_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."eindrondes"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "eindrondes_rels" ADD CONSTRAINT "eindrondes_rels_teams_fk" FOREIGN KEY ("teams_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "matches" ADD CONSTRAINT "matches_eindronde_id_eindrondes_id_fk" FOREIGN KEY ("eindronde_id") REFERENCES "public"."eindrondes"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_reglementen_fk" FOREIGN KEY ("reglementen_id") REFERENCES "public"."reglementen"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_reglement_verslagen_fk" FOREIGN KEY ("reglement_verslagen_id") REFERENCES "public"."reglement_verslagen"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_competitieregels_fk" FOREIGN KEY ("competitieregels_id") REFERENCES "public"."competitieregels"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_eindrondes_fk" FOREIGN KEY ("eindrondes_id") REFERENCES "public"."eindrondes"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE INDEX IF NOT EXISTS "reglementen_status_idx" ON "reglementen" USING btree ("status");
  CREATE INDEX IF NOT EXISTS "reglementen_updated_at_idx" ON "reglementen" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "reglementen_created_at_idx" ON "reglementen" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "reglement_verslagen_reglement_idx" ON "reglement_verslagen" USING btree ("reglement_id");
  CREATE INDEX IF NOT EXISTS "reglement_verslagen_updated_at_idx" ON "reglement_verslagen" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "reglement_verslagen_created_at_idx" ON "reglement_verslagen" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "competitieregels_actief_idx" ON "competitieregels" USING btree ("actief");
  CREATE INDEX IF NOT EXISTS "competitieregels_reglement_idx" ON "competitieregels" USING btree ("reglement_id");
  CREATE INDEX IF NOT EXISTS "competitieregels_verslag_idx" ON "competitieregels" USING btree ("verslag_id");
  CREATE INDEX IF NOT EXISTS "competitieregels_updated_at_idx" ON "competitieregels" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "competitieregels_created_at_idx" ON "competitieregels" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "competitieregels_bron_reeksen_order_idx" ON "competitieregels_bron_reeksen" USING btree ("order");
  CREATE INDEX IF NOT EXISTS "competitieregels_bron_reeksen_parent_idx" ON "competitieregels_bron_reeksen" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "eindrondes_seizoen_idx" ON "eindrondes" USING btree ("seizoen");
  CREATE INDEX IF NOT EXISTS "eindrondes_regel_idx" ON "eindrondes" USING btree ("regel_id");
  CREATE INDEX IF NOT EXISTS "eindrondes_updated_at_idx" ON "eindrondes" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "eindrondes_created_at_idx" ON "eindrondes" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "eindrondes_rels_order_idx" ON "eindrondes_rels" USING btree ("order");
  CREATE INDEX IF NOT EXISTS "eindrondes_rels_parent_idx" ON "eindrondes_rels" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "eindrondes_rels_path_idx" ON "eindrondes_rels" USING btree ("path");
  CREATE INDEX IF NOT EXISTS "eindrondes_rels_teams_id_idx" ON "eindrondes_rels" USING btree ("teams_id");
  CREATE INDEX IF NOT EXISTS "matches_eindronde_idx" ON "matches" USING btree ("eindronde_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_reglementen_id_idx" ON "payload_locked_documents_rels" USING btree ("reglementen_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_reglement_verslagen_id_idx" ON "payload_locked_documents_rels" USING btree ("reglement_verslagen_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_competitieregels_id_idx" ON "payload_locked_documents_rels" USING btree ("competitieregels_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_eindrondes_id_idx" ON "payload_locked_documents_rels" USING btree ("eindrondes_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // De enumwaarde 'EINDR' blijft staan (een waarde uit een enum halen vraagt het type te herbouwen);
  // zonder eindrondes gebruikt niets ze nog.
  await db.execute(sql`
  ALTER TABLE "matches" DROP CONSTRAINT IF EXISTS "matches_eindronde_id_eindrondes_id_fk";
  DROP INDEX IF EXISTS "matches_eindronde_idx";
  ALTER TABLE "matches" DROP COLUMN IF EXISTS "eindronde_id";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_reglementen_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_reglement_verslagen_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_competitieregels_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_eindrondes_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "reglementen_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "reglement_verslagen_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "competitieregels_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "eindrondes_id";
  DROP TABLE IF EXISTS "eindrondes_rels" CASCADE;
  DROP TABLE IF EXISTS "eindrondes" CASCADE;
  DROP TABLE IF EXISTS "competitieregels_bron_reeksen" CASCADE;
  DROP TABLE IF EXISTS "competitieregels" CASCADE;
  DROP TABLE IF EXISTS "reglement_verslagen" CASCADE;
  DROP TABLE IF EXISTS "reglementen" CASCADE;
  DROP TYPE IF EXISTS "public"."enum_eindrondes_categorie";
  DROP TYPE IF EXISTS "public"."enum_competitieregels_bron_reeksen";
  DROP TYPE IF EXISTS "public"."enum_competitieregels_categorie";
  DROP TYPE IF EXISTS "public"."enum_competitieregels_soort";
  DROP TYPE IF EXISTS "public"."enum_reglement_verslagen_status";
  DROP TYPE IF EXISTS "public"."enum_reglementen_status";`)
}
