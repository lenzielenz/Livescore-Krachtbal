import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Kruisjes + aangevraagde minuten (time-outs) per ploeg op een tornooiwedstrijd.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "tournament_matches" ADD COLUMN "crosses" jsonb DEFAULT '{"home":0,"away":0}'::jsonb;
  ALTER TABLE "tournament_matches" ADD COLUMN "timeouts" jsonb DEFAULT '{"home":0,"away":0}'::jsonb;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "tournament_matches" DROP COLUMN "crosses";
  ALTER TABLE "tournament_matches" DROP COLUMN "timeouts";`)
}
