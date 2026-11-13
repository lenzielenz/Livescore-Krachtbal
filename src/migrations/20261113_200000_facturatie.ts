import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Facturatie aan de clubs (lib/facturatie.ts): facturen (lijnen als json-momentopname; na het versturen
// onveranderlijk) en betalingen (onveranderlijk; "betaald" wordt berekend). Instellingen voor de factuur en de
// tarieven van de aansluitingen. Onafhankelijk van andere migraties.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_facturen_status" AS ENUM('concept', 'verstuurd', 'geannuleerd');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_betalingen_bron" AS ENUM('manueel', 'bank', 'online');
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE TABLE IF NOT EXISTS "facturen" (
    "id" serial PRIMARY KEY NOT NULL,
    "club_id" integer NOT NULL,
    "status" "enum_facturen_status" DEFAULT 'concept',
    "nummer" varchar,
    "jaar" numeric,
    "volgnr" numeric,
    "ogm" varchar,
    "seizoen" varchar,
    "datum" timestamp(3) with time zone,
    "vervaldatum" timestamp(3) with time zone,
    "lijnen" jsonb,
    "totaal" numeric,
    "opmerking" varchar,
    "gemaakt_door_id" integer,
    "verstuurd_op" timestamp(3) with time zone,
    "geannuleerd_op" timestamp(3) with time zone,
    "annuleer_reden" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE IF NOT EXISTS "betalingen" (
    "id" serial PRIMARY KEY NOT NULL,
    "factuur_id" integer NOT NULL,
    "club_id" integer,
    "bedrag" numeric NOT NULL,
    "datum" timestamp(3) with time zone NOT NULL,
    "bron" "enum_betalingen_bron" DEFAULT 'manueel',
    "sleutel" varchar,
    "mededeling" varchar,
    "tegenpartij" varchar,
    "opmerking" varchar,
    "geregistreerd_door_id" integer,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  DO $$ BEGIN
    ALTER TABLE "facturen" ADD CONSTRAINT "facturen_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "facturen" ADD CONSTRAINT "facturen_gemaakt_door_id_users_id_fk" FOREIGN KEY ("gemaakt_door_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "betalingen" ADD CONSTRAINT "betalingen_factuur_id_facturen_id_fk" FOREIGN KEY ("factuur_id") REFERENCES "public"."facturen"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "betalingen" ADD CONSTRAINT "betalingen_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "betalingen" ADD CONSTRAINT "betalingen_geregistreerd_door_id_users_id_fk" FOREIGN KEY ("geregistreerd_door_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE INDEX IF NOT EXISTS "facturen_club_idx" ON "facturen" USING btree ("club_id");
  CREATE INDEX IF NOT EXISTS "facturen_status_idx" ON "facturen" USING btree ("status");
  CREATE UNIQUE INDEX IF NOT EXISTS "facturen_nummer_idx" ON "facturen" USING btree ("nummer");
  CREATE UNIQUE INDEX IF NOT EXISTS "facturen_ogm_idx" ON "facturen" USING btree ("ogm");
  CREATE INDEX IF NOT EXISTS "facturen_gemaakt_door_idx" ON "facturen" USING btree ("gemaakt_door_id");
  CREATE INDEX IF NOT EXISTS "facturen_updated_at_idx" ON "facturen" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "facturen_created_at_idx" ON "facturen" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "betalingen_factuur_idx" ON "betalingen" USING btree ("factuur_id");
  CREATE INDEX IF NOT EXISTS "betalingen_club_idx" ON "betalingen" USING btree ("club_id");
  CREATE UNIQUE INDEX IF NOT EXISTS "betalingen_sleutel_idx" ON "betalingen" USING btree ("sleutel");
  CREATE INDEX IF NOT EXISTS "betalingen_geregistreerd_door_idx" ON "betalingen" USING btree ("geregistreerd_door_id");
  CREATE INDEX IF NOT EXISTS "betalingen_updated_at_idx" ON "betalingen" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "betalingen_created_at_idx" ON "betalingen" USING btree ("created_at");

  -- Payload houdt per document bij welke collecties ernaar verwijzen (vergrendelingen in het beheerpaneel).
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "facturen_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "betalingen_id" integer;
  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_facturen_fk" FOREIGN KEY ("facturen_id") REFERENCES "public"."facturen"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_betalingen_fk" FOREIGN KEY ("betalingen_id") REFERENCES "public"."betalingen"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_facturen_id_idx" ON "payload_locked_documents_rels" USING btree ("facturen_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_betalingen_id_idx" ON "payload_locked_documents_rels" USING btree ("betalingen_id");

  ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "factuur_naam" varchar DEFAULT 'KVKBF vzw';
  ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "factuur_adres" varchar;
  ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "factuur_ondernemingsnummer" varchar;
  ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "factuur_iban" varchar;
  ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "factuur_bic" varchar;
  ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "factuur_btw_vermelding" varchar;
  ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "betaaltermijn_dagen" numeric DEFAULT 30;
  ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "lidgeld_speler" numeric DEFAULT 0;
  ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "lidgeld_lid" numeric DEFAULT 0;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_facturen_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_betalingen_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "facturen_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "betalingen_id";
  DROP TABLE IF EXISTS "betalingen" CASCADE;
  DROP TABLE IF EXISTS "facturen" CASCADE;
  DROP TYPE IF EXISTS "public"."enum_betalingen_bron";
  DROP TYPE IF EXISTS "public"."enum_facturen_status";
  ALTER TABLE "settings" DROP COLUMN IF EXISTS "factuur_naam";
  ALTER TABLE "settings" DROP COLUMN IF EXISTS "factuur_adres";
  ALTER TABLE "settings" DROP COLUMN IF EXISTS "factuur_ondernemingsnummer";
  ALTER TABLE "settings" DROP COLUMN IF EXISTS "factuur_iban";
  ALTER TABLE "settings" DROP COLUMN IF EXISTS "factuur_bic";
  ALTER TABLE "settings" DROP COLUMN IF EXISTS "factuur_btw_vermelding";
  ALTER TABLE "settings" DROP COLUMN IF EXISTS "betaaltermijn_dagen";
  ALTER TABLE "settings" DROP COLUMN IF EXISTS "lidgeld_speler";
  ALTER TABLE "settings" DROP COLUMN IF EXISTS "lidgeld_lid";`)
}
