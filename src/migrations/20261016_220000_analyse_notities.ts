import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Notities bij een analyse (collections/AnalyseNotities.ts): een nieuwe tabel 'analyse_notities'
// (wedstrijd, schrijver, tekst, moment in de video, zichtbaarheid) plus de relatie-kolom in
// payload_locked_documents_rels. Herhaalbaar: alles met IF NOT EXISTS / duplicate_object.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_analyse_notities_zichtbaarheid" AS ENUM('prive', 'gedeeld');
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE TABLE IF NOT EXISTS "analyse_notities" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"match_id" integer NOT NULL,
  	"auteur_id" integer,
  	"auteur_naam" varchar,
  	"tekst" varchar NOT NULL,
  	"tijd_s" numeric,
  	"zichtbaarheid" "enum_analyse_notities_zichtbaarheid" DEFAULT 'prive' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "analyse_notities_id" integer;

  DO $$ BEGIN
    ALTER TABLE "analyse_notities" ADD CONSTRAINT "analyse_notities_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "analyse_notities" ADD CONSTRAINT "analyse_notities_auteur_id_users_id_fk" FOREIGN KEY ("auteur_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_analyse_notities_fk" FOREIGN KEY ("analyse_notities_id") REFERENCES "public"."analyse_notities"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE INDEX IF NOT EXISTS "analyse_notities_match_idx" ON "analyse_notities" USING btree ("match_id");
  CREATE INDEX IF NOT EXISTS "analyse_notities_auteur_idx" ON "analyse_notities" USING btree ("auteur_id");
  CREATE INDEX IF NOT EXISTS "analyse_notities_updated_at_idx" ON "analyse_notities" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "analyse_notities_created_at_idx" ON "analyse_notities" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_analyse_notities_id_idx" ON "payload_locked_documents_rels" USING btree ("analyse_notities_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_analyse_notities_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_analyse_notities_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "analyse_notities_id";
  DROP TABLE IF EXISTS "analyse_notities" CASCADE;
  DROP TYPE IF EXISTS "public"."enum_analyse_notities_zichtbaarheid";`)
}
