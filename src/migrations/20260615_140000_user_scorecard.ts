import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Scorecard per gebruiker: koppeling naar het eigen spelersdossier (voor echte matchstatistiek)
// en een zelf-/coachbeoordeling per radar-as (jsonb) als terugval wanneer er geen wedstrijddata is.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "player_id" integer;
  ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "scorecard_skills" jsonb;

  DO $$ BEGIN
    ALTER TABLE "users" ADD CONSTRAINT "users_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE INDEX IF NOT EXISTS "users_player_idx" ON "users" USING btree ("player_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_player_id_players_id_fk";
  DROP INDEX IF EXISTS "users_player_idx";
  ALTER TABLE "users" DROP COLUMN IF EXISTS "player_id";
  ALTER TABLE "users" DROP COLUMN IF EXISTS "scorecard_skills";`)
}
