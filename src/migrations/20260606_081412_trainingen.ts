import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_trainingen_weer" AS ENUM('zonnig', 'bewolkt', 'regen', 'wind', 'sneeuw', 'mist');
  CREATE TABLE "trainingen" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"datum" timestamp(3) with time zone NOT NULL,
  	"team_id" integer,
  	"duur_minuten" numeric,
  	"weer" "enum_trainingen_weer",
  	"temperatuur" numeric,
  	"notitie" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "trainingen_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"players_id" integer
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "trainingen_id" integer;
  ALTER TABLE "trainingen" ADD CONSTRAINT "trainingen_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "trainingen_rels" ADD CONSTRAINT "trainingen_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."trainingen"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "trainingen_rels" ADD CONSTRAINT "trainingen_rels_players_fk" FOREIGN KEY ("players_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "trainingen_team_idx" ON "trainingen" USING btree ("team_id");
  CREATE INDEX "trainingen_updated_at_idx" ON "trainingen" USING btree ("updated_at");
  CREATE INDEX "trainingen_created_at_idx" ON "trainingen" USING btree ("created_at");
  CREATE INDEX "trainingen_rels_order_idx" ON "trainingen_rels" USING btree ("order");
  CREATE INDEX "trainingen_rels_parent_idx" ON "trainingen_rels" USING btree ("parent_id");
  CREATE INDEX "trainingen_rels_path_idx" ON "trainingen_rels" USING btree ("path");
  CREATE INDEX "trainingen_rels_players_id_idx" ON "trainingen_rels" USING btree ("players_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_trainingen_fk" FOREIGN KEY ("trainingen_id") REFERENCES "public"."trainingen"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_trainingen_id_idx" ON "payload_locked_documents_rels" USING btree ("trainingen_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "trainingen" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "trainingen_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "trainingen" CASCADE;
  DROP TABLE "trainingen_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_trainingen_fk";
  
  DROP INDEX "payload_locked_documents_rels_trainingen_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "trainingen_id";
  DROP TYPE "public"."enum_trainingen_weer";`)
}
