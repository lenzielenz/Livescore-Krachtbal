import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// De werper-groep op een videovoorstel: welk gevolgd persoon deze worp maakte.
//
// Geen rugnummer — het model leest geen nummers van truitjes — maar een volgnummer dat hetzelfde
// blijft zolang die speler in beeld gevolgd kan worden. Daarmee groepeert de app de worpen per
// werper, zodat er één keer per speler gezegd moet worden wie het is in plaats van één keer per
// worp.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "cv_events" ADD COLUMN IF NOT EXISTS "werper" numeric;
  CREATE INDEX IF NOT EXISTS "cv_events_werper_idx" ON "cv_events" ("werper");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "cv_events_werper_idx";
  ALTER TABLE "cv_events" DROP COLUMN IF EXISTS "werper";`)
}
