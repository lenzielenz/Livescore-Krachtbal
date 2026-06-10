import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Clubs krijgen een opgeslagen weergavetitel "naam" / "naam (analyse)", gebruikt als useAsTitle.
// Zo is een analyse-club te onderscheiden van de gelijknamige competitie-club — ook in relatie-
// keuzelijsten (Payload haalt daar enkel de useAsTitle-kolom op, niet name/analyse_only). De titel
// wordt voortaan door de beforeChange-hook op Clubs bijgehouden; hier vullen we de bestaande rijen.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "display_title" varchar;
  UPDATE "clubs" SET "display_title" =
    (CASE WHEN "name" IS NULL OR btrim("name") = '' THEN 'Club' ELSE btrim("name") END)
    || (CASE WHEN "analyse_only" IS TRUE THEN ' (analyse)' ELSE '' END);`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE "clubs" DROP COLUMN IF EXISTS "display_title";`)
}
