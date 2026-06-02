import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Onthouden vaste opstelling per ploeg (favoriete spelers, komma-gescheiden speler-ids).
// Wordt bij een volgende wedstrijd automatisch voorgesteld op de opstelling-pagina.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE "teams" ADD COLUMN "vaste_opstelling_ids" varchar;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE "teams" DROP COLUMN "vaste_opstelling_ids";`)
}
