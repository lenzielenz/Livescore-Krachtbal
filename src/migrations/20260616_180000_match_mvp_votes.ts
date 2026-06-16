import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// "Held van de match"-stemmen: collectie 'match-mvp-votes' (één supporterstem per wedstrijd). Schema
// volgens dezelfde aanpak als eerdere collecties: de tabel, de FK's (matches/users/players), het
// select-enum, de indexen en de relatie-kolom in payload_locked_documents_rels.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TYPE "public"."enum_match_mvp_votes_side" AS ENUM('home', 'away');

  CREATE TABLE "match_mvp_votes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"match_id" integer NOT NULL,
  	"user_id" integer NOT NULL,
  	"player_id" integer NOT NULL,
  	"player_name" varchar,
  	"shirt_number" numeric,
  	"side" "public"."enum_match_mvp_votes_side",
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "match_mvp_votes_id" integer;

  ALTER TABLE "match_mvp_votes" ADD CONSTRAINT "match_mvp_votes_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "match_mvp_votes" ADD CONSTRAINT "match_mvp_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "match_mvp_votes" ADD CONSTRAINT "match_mvp_votes_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;

  CREATE INDEX "match_mvp_votes_match_idx" ON "match_mvp_votes" USING btree ("match_id");
  CREATE INDEX "match_mvp_votes_user_idx" ON "match_mvp_votes" USING btree ("user_id");
  CREATE INDEX "match_mvp_votes_player_idx" ON "match_mvp_votes" USING btree ("player_id");
  CREATE INDEX "match_mvp_votes_updated_at_idx" ON "match_mvp_votes" USING btree ("updated_at");
  CREATE INDEX "match_mvp_votes_created_at_idx" ON "match_mvp_votes" USING btree ("created_at");

  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_match_mvp_votes_fk" FOREIGN KEY ("match_mvp_votes_id") REFERENCES "public"."match_mvp_votes"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_match_mvp_votes_id_idx" ON "payload_locked_documents_rels" USING btree ("match_mvp_votes_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_match_mvp_votes_fk";
  DROP INDEX "payload_locked_documents_rels_match_mvp_votes_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "match_mvp_votes_id";
  DROP TABLE "match_mvp_votes" CASCADE;
  DROP TYPE "public"."enum_match_mvp_votes_side";`)
}
