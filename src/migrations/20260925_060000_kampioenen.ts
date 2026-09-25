import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Nieuwe collection 'kampioenen': historisch archief (overgenomen van de officiële KVKBF-site)
// met per seizoen een array van reeks/kampioen-rijen. Zie collections/Kampioenen.ts.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE "kampioenen_reeksen" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"reeks_naam" varchar NOT NULL,
  	"kampioen" varchar NOT NULL
  );

  CREATE TABLE "kampioenen" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"seizoen" varchar NOT NULL,
  	"seizoen_key" varchar,
  	"bron" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "kampioenen_id" integer;

  ALTER TABLE "kampioenen_reeksen" ADD CONSTRAINT "kampioenen_reeksen_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."kampioenen"("id") ON DELETE cascade ON UPDATE no action;

  CREATE INDEX "kampioenen_reeksen_order_idx" ON "kampioenen_reeksen" USING btree ("_order");
  CREATE INDEX "kampioenen_reeksen_parent_id_idx" ON "kampioenen_reeksen" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "kampioenen_seizoen_idx" ON "kampioenen" USING btree ("seizoen");
  CREATE UNIQUE INDEX "kampioenen_seizoen_key_idx" ON "kampioenen" USING btree ("seizoen_key");
  CREATE INDEX "kampioenen_updated_at_idx" ON "kampioenen" USING btree ("updated_at");
  CREATE INDEX "kampioenen_created_at_idx" ON "kampioenen" USING btree ("created_at");

  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_kampioenen_fk" FOREIGN KEY ("kampioenen_id") REFERENCES "public"."kampioenen"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_kampioenen_id_idx" ON "payload_locked_documents_rels" USING btree ("kampioenen_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_kampioenen_fk";
  DROP INDEX "payload_locked_documents_rels_kampioenen_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "kampioenen_id";

  DROP TABLE "kampioenen_reeksen" CASCADE;
  DROP TABLE "kampioenen" CASCADE;`)
}
