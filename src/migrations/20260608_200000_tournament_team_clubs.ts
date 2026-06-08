import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Tornooi: expliciete koppeling ploegnaam → club (JSON), ingegeven bij het aanmaken. Betrouwbaar
// clublogo + de club is gekoppeld (basis om info te bezorgen). Vorm: [{ name, clubId }].
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "tournaments" ADD COLUMN "team_clubs" jsonb;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "tournaments" DROP COLUMN "team_clubs";`)
}
