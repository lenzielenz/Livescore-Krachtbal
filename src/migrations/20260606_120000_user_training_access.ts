import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Training-toegang per gebruiker: een admin kan een account toegang geven tot het trainingsluik
// (progressie + aanwezigheid), los van de admin-rol. Zie src/lib/access.ts (canTraining).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "users" ADD COLUMN "training_access" boolean DEFAULT false;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "users" DROP COLUMN "training_access";`)
}
