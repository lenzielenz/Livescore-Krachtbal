import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Enkel-voor-analyse wedstrijd (matches.analyse_only): manueel opgenomen om data te
// verzamelen, maar niet publiek/live getoond — alleen zichtbaar in de analysemodule.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" ADD COLUMN "analyse_only" boolean DEFAULT false;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" DROP COLUMN "analyse_only";`)
}
