import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// "Tonen op de live-pagina"-vlag voor een tornooi/beker: zo verschijnen de lopende bekerwedstrijden
// bovenaan de live-pagina.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "toon_op_live" boolean DEFAULT false;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "tournaments" DROP COLUMN IF EXISTS "toon_op_live";`)
}
