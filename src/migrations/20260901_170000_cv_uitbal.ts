import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Uitbal op een videovoorstel: de bal landde buiten de lijnen.
//
// Het landingspunt (x_m/y_m) ligt dan bewúst buiten het veld — geen kapotte meting maar een
// echte uitbal. Daarmee kan de engine bij het overzetten zelf 'uit' afleiden; vroeger werd zo'n
// landing op de veldrand geklemd en telde ze stilzwijgend als doelpunt.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "cv_events" ADD COLUMN IF NOT EXISTS "uitbal" boolean DEFAULT false;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "cv_events" DROP COLUMN IF EXISTS "uitbal";`)
}
