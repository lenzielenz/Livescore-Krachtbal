import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// De richting van een worp op een videovoorstel, in graden.
//
// De afstand stond er al; de richting niet — terwijl beide uit hetzelfde paar punten volgen
// (werpplaats en landing) en samen pas zeggen wat een worp deed. 0° is recht naar de uitkant,
// +90° naar de rechterzijlijn: de veldassen, niet die van de aanvallende ploeg. Welke kant een
// ploeg aanvalt hangt van de helft af, en dat weet de engine — niet de video-analyse.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "cv_events" ADD COLUMN IF NOT EXISTS "richting_graden" numeric;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "cv_events" DROP COLUMN IF EXISTS "richting_graden";`)
}
