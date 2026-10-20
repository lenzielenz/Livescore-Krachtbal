import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Functies die de club toekent (lib/club-functies.ts): users.clubFuncties (meerdere: coach,
// trainer, jeugdverantwoordelijke, speler, lid) en users.functieTeams (de ploegen van een coach of
// trainer, via users_rels). Bestaande accounts krijgen niets: hun rechten blijven dezelfde.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_users_club_functies" AS ENUM('jeugdverantwoordelijke', 'trainer', 'coach', 'speler', 'lid');
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE TABLE IF NOT EXISTS "users_club_functies" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_users_club_functies",
  	"id" serial PRIMARY KEY NOT NULL
  );
  ALTER TABLE "users_rels" ADD COLUMN IF NOT EXISTS "teams_id" integer;

  DO $$ BEGIN
    ALTER TABLE "users_club_functies" ADD CONSTRAINT "users_club_functies_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN
    ALTER TABLE "users_rels" ADD CONSTRAINT "users_rels_teams_fk" FOREIGN KEY ("teams_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE INDEX IF NOT EXISTS "users_club_functies_order_idx" ON "users_club_functies" USING btree ("order");
  CREATE INDEX IF NOT EXISTS "users_club_functies_parent_idx" ON "users_club_functies" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "users_rels_teams_id_idx" ON "users_rels" USING btree ("teams_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "users_rels" DROP CONSTRAINT IF EXISTS "users_rels_teams_fk";
  DROP INDEX IF EXISTS "users_rels_teams_id_idx";
  ALTER TABLE "users_rels" DROP COLUMN IF EXISTS "teams_id";
  DROP TABLE IF EXISTS "users_club_functies" CASCADE;
  DROP TYPE IF EXISTS "public"."enum_users_club_functies";`)
}
