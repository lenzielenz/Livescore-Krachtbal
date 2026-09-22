import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Eigen ploeg van een gebruiker (naast de bestaande club_id) — voedt de highlight van je eigen
// wedstrijd op het live-bord. Zie collections/Users.ts.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "users" ADD COLUMN "team_id" integer;
  ALTER TABLE "users" ADD CONSTRAINT "users_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "users_team_idx" ON "users" USING btree ("team_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "users" DROP CONSTRAINT "users_team_id_teams_id_fk";
  DROP INDEX "users_team_idx";
  ALTER TABLE "users" DROP COLUMN "team_id";`)
}
