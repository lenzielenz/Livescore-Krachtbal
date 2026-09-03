import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Aantekenrechten voor tornooien, per account toe te kennen door een admin.
//
// Op een tornooidag zit er vaak iemand achter de tafel die geen scheidsrechter en geen federatielid
// is. Tot nu kon die niet aantekenen. Standaard false: niemand krijgt er iets bij zonder dat de
// admin het uitdrukkelijk aanvinkt.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "aanteken_rechten" boolean DEFAULT false;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "users" DROP COLUMN IF EXISTS "aanteken_rechten";`)
}
