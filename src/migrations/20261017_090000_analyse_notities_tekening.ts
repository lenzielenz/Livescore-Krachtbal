import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Notities bij een analyse kunnen een tekening dragen: pijlen op het veld (in veldmeters), zodat je
// in 3D kan tonen hoe en wat. Zie collections/AnalyseNotities.ts (veld 'tekening').
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "analyse_notities" ADD COLUMN IF NOT EXISTS "tekening" jsonb;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "analyse_notities" DROP COLUMN IF EXISTS "tekening";`)
}
