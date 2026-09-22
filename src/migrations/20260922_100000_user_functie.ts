import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Eigen rol binnen de club (speler/coach/supporter/bestuur) — bij 'coach' kiest het profiel
// meteen meerdere ploegen (myTeams, al bestaand als json-kolom) i.p.v. één. Zie collections/Users.ts.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_users_functie" AS ENUM('speler', 'coach', 'supporter', 'bestuur');
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "functie" "public"."enum_users_functie";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "users" DROP COLUMN IF EXISTS "functie";
  DROP TYPE IF EXISTS "public"."enum_users_functie";`)
}
