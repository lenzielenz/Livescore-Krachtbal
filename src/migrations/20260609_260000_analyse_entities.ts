import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Analyse-eigen clubs/ploegen/spelers: dezelfde tabellen als de competitie, maar afgeschermd via
// twee velden (spiegel van matches.analyse_only + matches.analyse_owner_id). analyse_only verbergt
// de entiteit voor de competitie; analyse_owner_id koppelt ze privé aan de analist die ze aanmaakte.
//
// BEWUST GEEN FK-constraint op analyse_owner_id → users: tijdens een rolling deploy houdt de oude
// container nog connecties/locks op de users-tabel, waardoor "ADD CONSTRAINT ... FOREIGN KEY" op een
// lock blijft wachten en de migratie hangt. De relatie wordt op app-niveau afgedwongen (Payload), dus
// de FK is niet nodig. ADD COLUMN (constante default) + CREATE INDEX zijn metadata-only en snel.
// IF NOT EXISTS maakt de migratie idempotent (veilig bij een retry na een afgebroken poging).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "analyse_only" boolean DEFAULT false;
  ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "analyse_owner_id" integer;
  CREATE INDEX IF NOT EXISTS "clubs_analyse_owner_idx" ON "clubs" USING btree ("analyse_owner_id");

  ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "analyse_only" boolean DEFAULT false;
  ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "analyse_owner_id" integer;
  CREATE INDEX IF NOT EXISTS "teams_analyse_owner_idx" ON "teams" USING btree ("analyse_owner_id");

  ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "analyse_only" boolean DEFAULT false;
  ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "analyse_owner_id" integer;
  CREATE INDEX IF NOT EXISTS "players_analyse_owner_idx" ON "players" USING btree ("analyse_owner_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "players_analyse_owner_idx";
  ALTER TABLE "players" DROP COLUMN IF EXISTS "analyse_owner_id";
  ALTER TABLE "players" DROP COLUMN IF EXISTS "analyse_only";

  DROP INDEX IF EXISTS "teams_analyse_owner_idx";
  ALTER TABLE "teams" DROP COLUMN IF EXISTS "analyse_owner_id";
  ALTER TABLE "teams" DROP COLUMN IF EXISTS "analyse_only";

  DROP INDEX IF EXISTS "clubs_analyse_owner_idx";
  ALTER TABLE "clubs" DROP COLUMN IF EXISTS "analyse_owner_id";
  ALTER TABLE "clubs" DROP COLUMN IF EXISTS "analyse_only";`)
}
