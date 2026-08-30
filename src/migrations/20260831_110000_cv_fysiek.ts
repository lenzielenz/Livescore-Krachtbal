import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Fysieke statistiek uit de videotracking (cv/fysiek.py): per speler gelopen afstand, sprintjes
// en topsnelheid, geüpload via de CV-brug en getoond op de spelerskaart van de analysepagina.
// Eigen meting uit de video — geen afgeleide van de worp-events. Idempotent raw-SQL.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "cv_fysiek" jsonb;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" DROP COLUMN IF EXISTS "cv_fysiek";`)
}
