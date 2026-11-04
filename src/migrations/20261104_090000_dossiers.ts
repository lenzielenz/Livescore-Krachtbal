import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Dossiers (collections/Dossiers.ts, lib/dossiers.ts): de opvolging op het bord /federatie/aanvragen —
// wie behandelt een aanvraag, op wie wachten we, deadline, notities; en vrije taken van de federatie.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_dossiers_bron" AS ENUM('verplaatsing', 'registratie', 'klacht', 'boete', 'ongeval', 'kaart', 'afgelasting', 'inschrijving', 'taak');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    CREATE TYPE "public"."enum_dossiers_wacht_op" AS ENUM('club', 'scheidsrechter', 'speler', 'extern');
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE TABLE IF NOT EXISTS "dossiers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"bron" "enum_dossiers_bron" NOT NULL,
  	"bron_id" numeric,
  	"titel" varchar,
  	"omschrijving" varchar,
  	"behandelaar_id" integer,
  	"deadline" timestamp(3) with time zone,
  	"wacht_op" "enum_dossiers_wacht_op",
  	"wacht_op_tekst" varchar,
  	"afgerond_op" timestamp(3) with time zone,
  	"aangemaakt_door_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE IF NOT EXISTS "dossiers_notities" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"door_id" integer,
  	"op" timestamp(3) with time zone,
  	"tekst" varchar NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "dossiers_id" integer;

  DO $$ BEGIN
    ALTER TABLE "dossiers" ADD CONSTRAINT "dossiers_behandelaar_id_users_id_fk" FOREIGN KEY ("behandelaar_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "dossiers" ADD CONSTRAINT "dossiers_aangemaakt_door_id_users_id_fk" FOREIGN KEY ("aangemaakt_door_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "dossiers_notities" ADD CONSTRAINT "dossiers_notities_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."dossiers"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "dossiers_notities" ADD CONSTRAINT "dossiers_notities_door_id_users_id_fk" FOREIGN KEY ("door_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_dossiers_fk" FOREIGN KEY ("dossiers_id") REFERENCES "public"."dossiers"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE INDEX IF NOT EXISTS "dossiers_bron_idx" ON "dossiers" USING btree ("bron");
  CREATE INDEX IF NOT EXISTS "dossiers_bron_id_idx" ON "dossiers" USING btree ("bron_id");
  CREATE INDEX IF NOT EXISTS "dossiers_behandelaar_idx" ON "dossiers" USING btree ("behandelaar_id");
  CREATE INDEX IF NOT EXISTS "dossiers_aangemaakt_door_idx" ON "dossiers" USING btree ("aangemaakt_door_id");
  CREATE INDEX IF NOT EXISTS "dossiers_updated_at_idx" ON "dossiers" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "dossiers_created_at_idx" ON "dossiers" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "dossiers_notities_order_idx" ON "dossiers_notities" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "dossiers_notities_parent_id_idx" ON "dossiers_notities" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "dossiers_notities_door_idx" ON "dossiers_notities" USING btree ("door_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_dossiers_id_idx" ON "payload_locked_documents_rels" USING btree ("dossiers_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_dossiers_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_dossiers_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "dossiers_id";
  DROP TABLE IF EXISTS "dossiers_notities" CASCADE;
  DROP TABLE IF EXISTS "dossiers" CASCADE;
  DROP TYPE IF EXISTS "public"."enum_dossiers_wacht_op";
  DROP TYPE IF EXISTS "public"."enum_dossiers_bron";`)
}
