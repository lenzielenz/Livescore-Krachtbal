import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Tornooiformaat: knock-out (bestaand) of round-robin (iedereen tegen elkaar, met rangschikking).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TYPE "public"."enum_tournaments_format" AS ENUM('knockout', 'roundrobin');
  ALTER TABLE "tournaments" ADD COLUMN "format" "enum_tournaments_format" DEFAULT 'knockout';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "tournaments" DROP COLUMN "format";
  DROP TYPE "public"."enum_tournaments_format";`)
}
