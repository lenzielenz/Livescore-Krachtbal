import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Training is per club i.p.v. per ploeg: vervang de team-koppeling door een club-koppeling.
// Bestaande trainingen krijgen hun club uit de (ex-)ploeg.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "trainingen" ADD COLUMN "club_id" integer;
  UPDATE "trainingen" t SET "club_id" = tm."club_id" FROM "teams" tm WHERE t."team_id" = tm."id" AND t."team_id" IS NOT NULL;
  ALTER TABLE "trainingen" DROP CONSTRAINT IF EXISTS "trainingen_team_id_teams_id_fk";
  DROP INDEX IF EXISTS "trainingen_team_idx";
  ALTER TABLE "trainingen" DROP COLUMN IF EXISTS "team_id";
  ALTER TABLE "trainingen" ADD CONSTRAINT "trainingen_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "trainingen_club_idx" ON "trainingen" USING btree ("club_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "trainingen" ADD COLUMN "team_id" integer;
  ALTER TABLE "trainingen" DROP CONSTRAINT IF EXISTS "trainingen_club_id_clubs_id_fk";
  DROP INDEX IF EXISTS "trainingen_club_idx";
  ALTER TABLE "trainingen" DROP COLUMN IF EXISTS "club_id";
  ALTER TABLE "trainingen" ADD CONSTRAINT "trainingen_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "trainingen_team_idx" ON "trainingen" USING btree ("team_id");`)
}
