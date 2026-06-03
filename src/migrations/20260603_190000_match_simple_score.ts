import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Simpele aantekenmodus (Starter-pakket): snelle doelpunten +1/+2 en kruisjes
// worden als JSON op de match bewaard, los van de worp-events. Zie
// src/lib/simple-score.ts.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" ADD COLUMN "simple_score" jsonb;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" DROP COLUMN "simple_score";`)
}
