import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Eindtijdstip van een wedstrijd: automatisch gezet zodra de status op 'finished' gaat.
// Bepaalt het 1-uur-navenster waarin supporters nog kunnen reageren in de live tribune
// (zie src/lib/tribune.ts en src/lib/match-channel.ts).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" ADD COLUMN "finished_at" timestamp(3) with time zone;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "matches" DROP COLUMN "finished_at";`)
}
