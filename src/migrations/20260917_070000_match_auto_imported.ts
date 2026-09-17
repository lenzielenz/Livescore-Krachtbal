import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Herkomst-vlag (matches.auto_imported): kwam de eindstand automatisch binnen via de
// federatie-sync of de officiële .xls-export, i.p.v. dat iemand ze zelf via de app registreerde
// (veldschema, wedstrijdblad, of een supporter die de eindstand doorgaf)? Zie
// uitslagen-toepassen.ts / results/import route. Puur herkomst-metadata voor de weekrecap —
// telt niet mee in de score-/standberekening.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "auto_imported" boolean DEFAULT false;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" DROP COLUMN IF EXISTS "auto_imported";`)
}
