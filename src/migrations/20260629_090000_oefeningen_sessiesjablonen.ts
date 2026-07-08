import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Twee collections (Oefeningen + Sessiesjablonen) die in #604 aan payload.config.ts zijn toegevoegd,
// maar zonder migratie. Daardoor ontbraken de tabellen in productie (Postgres) en crashte /admin met
// een 500 (count-queries op onbestaande relaties). Deze migratie maakt de ontbrekende tabellen,
// enums, foreign keys en indexes aan, plus de koppelingen in payload_locked_documents_rels.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_oefeningen_domein" AS ENUM('worpkracht', 'aanloop', 'snelheid', 'wendbaarheid', 'afwerking', 'core', 'conditie', 'warming-up', 'cooling-down');
  CREATE TYPE "public"."enum_sessiesjablonen_fase" AS ENUM('voorbereiding', 'competitie', 'uitloop', 'algemeen');
  CREATE TABLE "oefeningen" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"naam" varchar NOT NULL,
  	"domein" "enum_oefeningen_domein",
  	"beschrijving" varchar,
  	"progressie" varchar,
  	"duur_minuten" numeric,
  	"materiaal" varchar,
  	"club_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "sessiesjablonen_oefeningen" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"oefening_id" integer NOT NULL,
  	"duur_minuten" numeric,
  	"sets" numeric,
  	"notitie" varchar
  );

  CREATE TABLE "sessiesjablonen" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"naam" varchar NOT NULL,
  	"fase" "enum_sessiesjablonen_fase",
  	"duur_totaal" numeric,
  	"beschrijving" varchar,
  	"club_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "oefeningen_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "sessiesjablonen_id" integer;
  ALTER TABLE "oefeningen" ADD CONSTRAINT "oefeningen_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sessiesjablonen_oefeningen" ADD CONSTRAINT "sessiesjablonen_oefeningen_oefening_id_oefeningen_id_fk" FOREIGN KEY ("oefening_id") REFERENCES "public"."oefeningen"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sessiesjablonen_oefeningen" ADD CONSTRAINT "sessiesjablonen_oefeningen_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sessiesjablonen"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sessiesjablonen" ADD CONSTRAINT "sessiesjablonen_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "oefeningen_club_idx" ON "oefeningen" USING btree ("club_id");
  CREATE INDEX "oefeningen_updated_at_idx" ON "oefeningen" USING btree ("updated_at");
  CREATE INDEX "oefeningen_created_at_idx" ON "oefeningen" USING btree ("created_at");
  CREATE INDEX "sessiesjablonen_oefeningen_order_idx" ON "sessiesjablonen_oefeningen" USING btree ("_order");
  CREATE INDEX "sessiesjablonen_oefeningen_parent_id_idx" ON "sessiesjablonen_oefeningen" USING btree ("_parent_id");
  CREATE INDEX "sessiesjablonen_oefeningen_oefening_idx" ON "sessiesjablonen_oefeningen" USING btree ("oefening_id");
  CREATE INDEX "sessiesjablonen_club_idx" ON "sessiesjablonen" USING btree ("club_id");
  CREATE INDEX "sessiesjablonen_updated_at_idx" ON "sessiesjablonen" USING btree ("updated_at");
  CREATE INDEX "sessiesjablonen_created_at_idx" ON "sessiesjablonen" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_oefeningen_fk" FOREIGN KEY ("oefeningen_id") REFERENCES "public"."oefeningen"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sessiesjablonen_fk" FOREIGN KEY ("sessiesjablonen_id") REFERENCES "public"."sessiesjablonen"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_oefeningen_id_idx" ON "payload_locked_documents_rels" USING btree ("oefeningen_id");
  CREATE INDEX "payload_locked_documents_rels_sessiesjablonen_id_idx" ON "payload_locked_documents_rels" USING btree ("sessiesjablonen_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "oefeningen" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "sessiesjablonen_oefeningen" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "sessiesjablonen" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "oefeningen" CASCADE;
  DROP TABLE "sessiesjablonen_oefeningen" CASCADE;
  DROP TABLE "sessiesjablonen" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_oefeningen_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_sessiesjablonen_fk";

  DROP INDEX "payload_locked_documents_rels_oefeningen_id_idx";
  DROP INDEX "payload_locked_documents_rels_sessiesjablonen_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "oefeningen_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "sessiesjablonen_id";
  DROP TYPE "public"."enum_oefeningen_domein";
  DROP TYPE "public"."enum_sessiesjablonen_fase";`)
}
