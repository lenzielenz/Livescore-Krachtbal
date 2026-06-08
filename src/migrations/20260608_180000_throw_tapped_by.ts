import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// 'Getikt door': de speler van de tegenploeg die de bal naar de achterman tikte vóór de vangst
// (optioneel, bij een diepe gevangen worp). Voedt de verdedigende statistiek.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "throws" ADD COLUMN "tapped_by_id" integer;
  ALTER TABLE "throws" ADD CONSTRAINT "throws_tapped_by_id_players_id_fk" FOREIGN KEY ("tapped_by_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "throws_tapped_by_idx" ON "throws" USING btree ("tapped_by_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "throws_tapped_by_idx";
  ALTER TABLE "throws" DROP CONSTRAINT IF EXISTS "throws_tapped_by_id_players_id_fk";
  ALTER TABLE "throws" DROP COLUMN "tapped_by_id";`)
}
