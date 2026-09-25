import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Twee nieuwe collections: 'bekerwinnaars' (per seizoen een array van categorie/ploeg-rijen, zelfde
// opzet als 'kampioenen') en 'referendum-awards' (per prijs een array van jaar/naam/club-rijen — de
// bron is één statische pagina, geen seizoensgebonden reeks). Zie collections/Bekerwinnaars.ts en
// collections/ReferendumAwards.ts.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE "bekerwinnaars_winnaars" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"categorie" varchar NOT NULL,
  	"ploeg" varchar NOT NULL
  );

  CREATE TABLE "bekerwinnaars" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"seizoen" varchar NOT NULL,
  	"seizoen_key" varchar,
  	"bron" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "referendum_awards_winnaars" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"jaar" varchar NOT NULL,
  	"naam" varchar NOT NULL,
  	"club" varchar NOT NULL
  );

  CREATE TABLE "referendum_awards" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"prijs" varchar NOT NULL,
  	"bron" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "bekerwinnaars_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "referendum_awards_id" integer;

  ALTER TABLE "bekerwinnaars_winnaars" ADD CONSTRAINT "bekerwinnaars_winnaars_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."bekerwinnaars"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "referendum_awards_winnaars" ADD CONSTRAINT "referendum_awards_winnaars_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."referendum_awards"("id") ON DELETE cascade ON UPDATE no action;

  CREATE INDEX "bekerwinnaars_winnaars_order_idx" ON "bekerwinnaars_winnaars" USING btree ("_order");
  CREATE INDEX "bekerwinnaars_winnaars_parent_id_idx" ON "bekerwinnaars_winnaars" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "bekerwinnaars_seizoen_idx" ON "bekerwinnaars" USING btree ("seizoen");
  CREATE UNIQUE INDEX "bekerwinnaars_seizoen_key_idx" ON "bekerwinnaars" USING btree ("seizoen_key");
  CREATE INDEX "bekerwinnaars_updated_at_idx" ON "bekerwinnaars" USING btree ("updated_at");
  CREATE INDEX "bekerwinnaars_created_at_idx" ON "bekerwinnaars" USING btree ("created_at");

  CREATE INDEX "referendum_awards_winnaars_order_idx" ON "referendum_awards_winnaars" USING btree ("_order");
  CREATE INDEX "referendum_awards_winnaars_parent_id_idx" ON "referendum_awards_winnaars" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "referendum_awards_prijs_idx" ON "referendum_awards" USING btree ("prijs");
  CREATE INDEX "referendum_awards_updated_at_idx" ON "referendum_awards" USING btree ("updated_at");
  CREATE INDEX "referendum_awards_created_at_idx" ON "referendum_awards" USING btree ("created_at");

  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_bekerwinnaars_fk" FOREIGN KEY ("bekerwinnaars_id") REFERENCES "public"."bekerwinnaars"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_referendum_awards_fk" FOREIGN KEY ("referendum_awards_id") REFERENCES "public"."referendum_awards"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_bekerwinnaars_id_idx" ON "payload_locked_documents_rels" USING btree ("bekerwinnaars_id");
  CREATE INDEX "payload_locked_documents_rels_referendum_awards_id_idx" ON "payload_locked_documents_rels" USING btree ("referendum_awards_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_bekerwinnaars_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_referendum_awards_fk";
  DROP INDEX "payload_locked_documents_rels_bekerwinnaars_id_idx";
  DROP INDEX "payload_locked_documents_rels_referendum_awards_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "bekerwinnaars_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "referendum_awards_id";

  DROP TABLE "bekerwinnaars_winnaars" CASCADE;
  DROP TABLE "bekerwinnaars" CASCADE;
  DROP TABLE "referendum_awards_winnaars" CASCADE;
  DROP TABLE "referendum_awards" CASCADE;`)
}
