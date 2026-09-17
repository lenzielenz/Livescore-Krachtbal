import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Kleurthema per veldscherm: 'dark' (standaard) of 'light' voor leesbaarheid in fel zonlicht.
// Zie collections/FieldScreens.ts.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TYPE "public"."enum_field_screens_theme" AS ENUM('dark', 'light');
  ALTER TABLE "field_screens" ADD COLUMN IF NOT EXISTS "theme" "public"."enum_field_screens_theme" DEFAULT 'dark';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "field_screens" DROP COLUMN IF EXISTS "theme";
  DROP TYPE IF EXISTS "public"."enum_field_screens_theme";`)
}
