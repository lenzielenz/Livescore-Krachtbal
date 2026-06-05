import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// 'Gevangen door': de speler van de tegenploeg die de bal ving bij een gevangen worp.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "throws" ADD COLUMN "caught_by_id" integer;
  ALTER TABLE "throws" ADD CONSTRAINT "throws_caught_by_id_players_id_fk" FOREIGN KEY ("caught_by_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "throws_caught_by_idx" ON "throws" USING btree ("caught_by_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "throws_caught_by_idx";
  ALTER TABLE "throws" DROP CONSTRAINT IF EXISTS "throws_caught_by_id_players_id_fk";
  ALTER TABLE "throws" DROP COLUMN "caught_by_id";`)
}
