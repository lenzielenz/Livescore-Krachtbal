import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Bonusrad: de weekendwinnaar van de pronostiek draait aan een rad dat 3 wedstrijden uitkiest die
// dubbele punten waard worden. De multiplier (1 = normaal, 2 = bonus) staat per wedstrijd.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "pronostiek_bonus" numeric DEFAULT 1;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" DROP COLUMN IF EXISTS "pronostiek_bonus";`)
}
