import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Markeert een veldscherm als vast demo-scherm (wachtscherm of scorebord) i.p.v. een echt veld.
// Zie collections/FieldScreens.ts.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "field_screens" ADD COLUMN IF NOT EXISTS "is_demo" boolean DEFAULT false;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "field_screens" DROP COLUMN IF EXISTS "is_demo";`)
}
