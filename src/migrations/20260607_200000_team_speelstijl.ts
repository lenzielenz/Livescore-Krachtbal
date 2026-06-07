import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Tactisch profiel "hoe spelen wij als ploeg" per ploeg (teams.speelstijl, JSON). Door de coach
// ingegeven via het ploegrapport; voedt de strategie-aanbevelingen. Eén jsonb-kolom.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "teams" ADD COLUMN "speelstijl" jsonb;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "teams" DROP COLUMN "speelstijl";`)
}
