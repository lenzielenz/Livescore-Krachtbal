import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Vul de opgeslagen weergavetitel "naam — reeks" voor BESTAANDE ploegen. De kolom display_title
// werd eerder toegevoegd maar nooit gevuld; de titel werd bij het lezen berekend. Dat brak de
// relatie-keuzelijsten (Payload haalt daar enkel display_title op, niet name/reeks) → overal "Ploeg".
// We berekenen de titel hier één keer in SQL, met dezelfde reeksnamen als src/lib/reeksen.ts.
// Toekomstige wijzigingen worden door de beforeChange-hook op Teams bijgehouden.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "teams" SET "display_title" =
      CASE
        WHEN "name" IS NULL OR btrim("name") = '' THEN 'Ploeg'
        ELSE btrim("name")
      END
      ||
      CASE "reeks"
        WHEN '1NAH'  THEN ' — 1ste Nationale Heren'
        WHEN '1NAHB' THEN ' — 1ste Nationale Heren Beloften'
        WHEN '1NAD'  THEN ' — 1ste Nationale Dames'
        WHEN '2NAH'  THEN ' — 2de Nationale Heren'
        WHEN '2NAHB' THEN ' — 2de Nationale Heren Beloften'
        WHEN 'LH'    THEN ' — Landelijke Heren'
        WHEN 'LD'    THEN ' — Landelijke Dames'
        WHEN 'RHA'   THEN ' — Regionale Heren A'
        WHEN 'RHB'   THEN ' — Regionale Heren B'
        WHEN 'RDA'   THEN ' — Regionale Dames A'
        WHEN 'RDB'   THEN ' — Regionale Dames B'
        WHEN 'U18J'  THEN ' — U18 Jongens'
        WHEN 'U18M'  THEN ' — U18 Meisjes'
        WHEN 'U16J'  THEN ' — U16 Jongens'
        WHEN 'U16M'  THEN ' — U16 Meisjes'
        WHEN 'U14J'  THEN ' — U14 Jongens'
        WHEN 'U14M'  THEN ' — U14 Meisjes'
        WHEN 'U12'   THEN ' — U12'
        WHEN 'recreatief' THEN ' — Recreatief'
        WHEN 'beker' THEN ' — Beker'
        WHEN 'andere' THEN ' — Andere'
        ELSE ''
      END;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`UPDATE "teams" SET "display_title" = NULL;`)
}
