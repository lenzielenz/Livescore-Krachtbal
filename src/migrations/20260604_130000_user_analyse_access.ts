import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Analyse-toegang per gebruiker: een admin kan een geregistreerd account toegang
// geven tot de analysemodule (naast de admin-rol). Zie src/lib/access.ts (canAnalyse).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "users" ADD COLUMN "analyse_access" boolean DEFAULT false;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "users" DROP COLUMN "analyse_access";`)
}
