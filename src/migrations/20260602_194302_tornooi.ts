import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Tornooi-laag: tabellen `tournaments` + `tournament_matches` (enkele afvalrace met kleine finale).
//
// NB: `payload migrate:create` diffte tegen een verouderde schema-baseline en genereerde ook
// reeds-bestaande objecten (accidents/cupfinals/club-kleuren uit de eerdere migraties 090000–140000).
// Die migraties hebben vroegere timestamps en draaien dus eerst op Railway — daarom is deze migratie
// handmatig teruggebracht tot enkel de nieuwe tornooi-objecten.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_tournaments_category" AS ENUM('U12', 'U14', 'U16', 'U18', 'U20', 'senioren');
  CREATE TYPE "public"."enum_tournaments_status" AS ENUM('live', 'finished');
  CREATE TYPE "public"."enum_tournaments_method" AS ENUM('manual', 'auto');
  CREATE TYPE "public"."enum_tournament_matches_bracket" AS ENUM('main', 'third');
  CREATE TYPE "public"."enum_tournament_matches_status" AS ENUM('pending', 'live', 'finished');
  CREATE TYPE "public"."enum_tournament_matches_winner" AS ENUM('home', 'away');
  CREATE TABLE "tournaments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"category" "enum_tournaments_category" NOT NULL,
  	"status" "enum_tournaments_status" DEFAULT 'live' NOT NULL,
  	"method" "enum_tournaments_method" DEFAULT 'auto',
  	"team_count" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "tournament_matches" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tournament_id" integer NOT NULL,
  	"round" numeric NOT NULL,
  	"position" numeric NOT NULL,
  	"bracket" "enum_tournament_matches_bracket" DEFAULT 'main' NOT NULL,
  	"label" varchar,
  	"home" varchar,
  	"away" varchar,
  	"status" "enum_tournament_matches_status" DEFAULT 'pending' NOT NULL,
  	"winner" "enum_tournament_matches_winner",
  	"goals" jsonb DEFAULT '[]'::jsonb,
  	"winner_to" jsonb,
  	"loser_to" jsonb,
  	"current_half" numeric DEFAULT 1,
  	"clock_seconds" numeric DEFAULT 0,
  	"clock_running" boolean DEFAULT false,
  	"clock_updated_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "tournaments_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "tournament_matches_id" integer;
  ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "tournaments_updated_at_idx" ON "tournaments" USING btree ("updated_at");
  CREATE INDEX "tournaments_created_at_idx" ON "tournaments" USING btree ("created_at");
  CREATE INDEX "tournament_matches_tournament_idx" ON "tournament_matches" USING btree ("tournament_id");
  CREATE INDEX "tournament_matches_updated_at_idx" ON "tournament_matches" USING btree ("updated_at");
  CREATE INDEX "tournament_matches_created_at_idx" ON "tournament_matches" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tournaments_fk" FOREIGN KEY ("tournaments_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tournament_matches_fk" FOREIGN KEY ("tournament_matches_id") REFERENCES "public"."tournament_matches"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_tournaments_id_idx" ON "payload_locked_documents_rels" USING btree ("tournaments_id");
  CREATE INDEX "payload_locked_documents_rels_tournament_matches_id_idx" ON "payload_locked_documents_rels" USING btree ("tournament_matches_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "tournaments" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "tournament_matches" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "tournaments" CASCADE;
  DROP TABLE "tournament_matches" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_tournaments_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_tournament_matches_fk";
  DROP INDEX "payload_locked_documents_rels_tournaments_id_idx";
  DROP INDEX "payload_locked_documents_rels_tournament_matches_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "tournaments_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "tournament_matches_id";
  DROP TYPE "public"."enum_tournaments_category";
  DROP TYPE "public"."enum_tournaments_status";
  DROP TYPE "public"."enum_tournaments_method";
  DROP TYPE "public"."enum_tournament_matches_bracket";
  DROP TYPE "public"."enum_tournament_matches_status";
  DROP TYPE "public"."enum_tournament_matches_winner";`)
}
