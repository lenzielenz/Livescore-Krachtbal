import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Screenshot (data-URL van de WhatsApp-stemming) bij een trainingssessie.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "trainingen" ADD COLUMN "screenshot" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "trainingen" DROP COLUMN "screenshot";`)
}
