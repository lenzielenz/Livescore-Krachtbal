import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Reclame-collectie 'advertenties' (logo/banner van een sponsor). Schema volgt dezelfde aanpak als
// eerdere collecties (bv. 'push_subscriptions'): de tabel, de enum voor plaatsing, de FK naar media,
// de indexen en de relatie-kolom in payload_locked_documents_rels.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_advertenties_plaatsing" AS ENUM('veldscherm', 'kantine', 'overal');
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE TABLE "advertenties" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"naam" varchar NOT NULL,
  	"afbeelding_id" integer,
  	"link" varchar,
  	"plaatsing" "enum_advertenties_plaatsing" DEFAULT 'veldscherm',
  	"volgorde" numeric DEFAULT 0,
  	"actief" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "advertenties_id" integer;

  ALTER TABLE "advertenties" ADD CONSTRAINT "advertenties_afbeelding_id_media_id_fk" FOREIGN KEY ("afbeelding_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;

  CREATE INDEX "advertenties_afbeelding_idx" ON "advertenties" USING btree ("afbeelding_id");
  CREATE INDEX "advertenties_updated_at_idx" ON "advertenties" USING btree ("updated_at");
  CREATE INDEX "advertenties_created_at_idx" ON "advertenties" USING btree ("created_at");

  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_advertenties_fk" FOREIGN KEY ("advertenties_id") REFERENCES "public"."advertenties"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_advertenties_id_idx" ON "payload_locked_documents_rels" USING btree ("advertenties_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_advertenties_fk";
  DROP INDEX "payload_locked_documents_rels_advertenties_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "advertenties_id";
  DROP TABLE "advertenties" CASCADE;
  DROP TYPE "public"."enum_advertenties_plaatsing";`)
}
