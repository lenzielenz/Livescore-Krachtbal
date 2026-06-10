import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Herstel: vóór de transactie-fix schreef de delen-hook de inverses (analyseToegangTot/
// analyseBewerkTot bij de ontvanger) nooit weg op Postgres — de nestede update liep vast op de
// FK-lock en werd stil overgeslagen. Wie al deelde, was dus onzichtbaar voor de ontvanger.
// Deze backfill vult de ontbrekende inverse-rijen aan vanuit de bewaarde deel-lijsten.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  INSERT INTO "users_rels" ("order", "parent_id", "path", "users_id")
  SELECT ROW_NUMBER() OVER (PARTITION BY r."users_id" ORDER BY r."id"), r."users_id", 'analyseToegangTot', r."parent_id"
  FROM "users_rels" r
  WHERE r."path" = 'analyseDeeltMet'
    AND NOT EXISTS (
      SELECT 1 FROM "users_rels" x
      WHERE x."parent_id" = r."users_id" AND x."path" = 'analyseToegangTot' AND x."users_id" = r."parent_id"
    );
  INSERT INTO "users_rels" ("order", "parent_id", "path", "users_id")
  SELECT ROW_NUMBER() OVER (PARTITION BY r."users_id" ORDER BY r."id"), r."users_id", 'analyseBewerkTot', r."parent_id"
  FROM "users_rels" r
  WHERE r."path" = 'analyseDeeltBewerkMet'
    AND NOT EXISTS (
      SELECT 1 FROM "users_rels" x
      WHERE x."parent_id" = r."users_id" AND x."path" = 'analyseBewerkTot' AND x."users_id" = r."parent_id"
    );`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Backfill van afgeleide data — niets terug te draaien.
}
