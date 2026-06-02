import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // 1) Scheidsrechtersvergoeding + forfait-onkostenblad op het wedstrijdblad.
  await db.execute(sql`
    ALTER TABLE "matchsheets" ADD COLUMN "referee_km" numeric;
    ALTER TABLE "matchsheets" ADD COLUMN "forfait_van_toepassing" boolean DEFAULT false;
    ALTER TABLE "matchsheets" ADD COLUMN "forfait_gemeld_thuis" boolean DEFAULT false;
    ALTER TABLE "matchsheets" ADD COLUMN "forfait_gemeld_uit" boolean DEFAULT false;
    ALTER TABLE "matchsheets" ADD COLUMN "forfait_aantal_autos" numeric;
    ALTER TABLE "matchsheets" ADD COLUMN "forfait_km" numeric;
  `)

  // 2) Ongevalsaangiften (formulier_14) + cup-final checklist (formulier_12).
  await db.execute(sql`
    CREATE TYPE "public"."enum_cupfinals_checklist_verantwoordelijke" AS ENUM('OC', 'federatie', 'SRC');

    CREATE TABLE "accidents_getuigen" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "naam" varchar,
      "adres" varchar
    );

    CREATE TABLE "accidents" (
      "id" serial PRIMARY KEY NOT NULL,
      "titel" varchar,
      "match_id" integer,
      "player_id" integer,
      "slachtoffer_naam" varchar NOT NULL,
      "slachtoffer_geboortedatum" timestamp(3) with time zone,
      "slachtoffer_adres" varchar,
      "slachtoffer_beroep" varchar,
      "ongeval_plaats" varchar,
      "ongeval_datum" timestamp(3) with time zone,
      "omstandigheden" varchar,
      "opmerkingen" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE "cupfinals_checklist" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "taak" varchar NOT NULL,
      "verantwoordelijke" "enum_cupfinals_checklist_verantwoordelijke" DEFAULT 'OC',
      "gedaan" boolean DEFAULT false,
      "opmerking" varchar
    );

    CREATE TABLE "cupfinals" (
      "id" serial PRIMARY KEY NOT NULL,
      "titel" varchar NOT NULL,
      "datum" timestamp(3) with time zone,
      "locatie" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "accidents_id" integer;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "cupfinals_id" integer;

    ALTER TABLE "accidents_getuigen" ADD CONSTRAINT "accidents_getuigen_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."accidents"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "accidents" ADD CONSTRAINT "accidents_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "accidents" ADD CONSTRAINT "accidents_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "cupfinals_checklist" ADD CONSTRAINT "cupfinals_checklist_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."cupfinals"("id") ON DELETE cascade ON UPDATE no action;

    CREATE INDEX "accidents_getuigen_order_idx" ON "accidents_getuigen" USING btree ("_order");
    CREATE INDEX "accidents_getuigen_parent_id_idx" ON "accidents_getuigen" USING btree ("_parent_id");
    CREATE INDEX "accidents_match_idx" ON "accidents" USING btree ("match_id");
    CREATE INDEX "accidents_player_idx" ON "accidents" USING btree ("player_id");
    CREATE INDEX "accidents_updated_at_idx" ON "accidents" USING btree ("updated_at");
    CREATE INDEX "accidents_created_at_idx" ON "accidents" USING btree ("created_at");
    CREATE INDEX "cupfinals_checklist_order_idx" ON "cupfinals_checklist" USING btree ("_order");
    CREATE INDEX "cupfinals_checklist_parent_id_idx" ON "cupfinals_checklist" USING btree ("_parent_id");
    CREATE INDEX "cupfinals_updated_at_idx" ON "cupfinals" USING btree ("updated_at");
    CREATE INDEX "cupfinals_created_at_idx" ON "cupfinals" USING btree ("created_at");

    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_accidents_fk" FOREIGN KEY ("accidents_id") REFERENCES "public"."accidents"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_cupfinals_fk" FOREIGN KEY ("cupfinals_id") REFERENCES "public"."cupfinals"("id") ON DELETE cascade ON UPDATE no action;
    CREATE INDEX "payload_locked_documents_rels_accidents_id_idx" ON "payload_locked_documents_rels" USING btree ("accidents_id");
    CREATE INDEX "payload_locked_documents_rels_cupfinals_id_idx" ON "payload_locked_documents_rels" USING btree ("cupfinals_id");
  `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "accidents_getuigen" DISABLE ROW LEVEL SECURITY;
    ALTER TABLE "accidents" DISABLE ROW LEVEL SECURITY;
    ALTER TABLE "cupfinals_checklist" DISABLE ROW LEVEL SECURITY;
    ALTER TABLE "cupfinals" DISABLE ROW LEVEL SECURITY;
    DROP TABLE "accidents_getuigen" CASCADE;
    DROP TABLE "accidents" CASCADE;
    DROP TABLE "cupfinals_checklist" CASCADE;
    DROP TABLE "cupfinals" CASCADE;
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_accidents_fk";
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_cupfinals_fk";
    DROP INDEX "payload_locked_documents_rels_accidents_id_idx";
    DROP INDEX "payload_locked_documents_rels_cupfinals_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "accidents_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "cupfinals_id";
    ALTER TABLE "matchsheets" DROP COLUMN "referee_km";
    ALTER TABLE "matchsheets" DROP COLUMN "forfait_van_toepassing";
    ALTER TABLE "matchsheets" DROP COLUMN "forfait_gemeld_thuis";
    ALTER TABLE "matchsheets" DROP COLUMN "forfait_gemeld_uit";
    ALTER TABLE "matchsheets" DROP COLUMN "forfait_aantal_autos";
    ALTER TABLE "matchsheets" DROP COLUMN "forfait_km";
    DROP TYPE "public"."enum_cupfinals_checklist_verantwoordelijke";
  `)
}
