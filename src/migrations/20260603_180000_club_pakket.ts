import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Abonnementsniveau (pakket) per club: starter / team / elite. Bepaalt het
// aantekenmodel en de publiek zichtbare statistieken. Zie src/lib/packages.ts.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TYPE "public"."enum_clubs_package" AS ENUM('starter', 'team', 'elite');
  ALTER TABLE "clubs" ADD COLUMN "package" "enum_clubs_package" DEFAULT 'starter' NOT NULL;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "clubs" DROP COLUMN "package";
  DROP TYPE "public"."enum_clubs_package";`)
}
