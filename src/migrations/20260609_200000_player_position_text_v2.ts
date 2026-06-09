import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Herhaling van de positie→tekst-conversie, nu met een NIEUWE migratienaam zodat ze gegarandeerd
// (opnieuw) uitvoert op productie. Symptoom dat we definitief willen wegwerken: een speler bewaren
// met positie "vleugel-links"/"vleugel-rechts" gaf "An unknown error has occurred" omdat de
// Postgres-enum (enum_players_position) die waarden miste. We zetten de kolom om naar gewone tekst,
// zodat élke door het formulier toegelaten positie altijd bewaard kan worden — ongeacht de
// (mogelijk onvolledige) enum-staat waarin een eerdere deploy de kolom achterliet. Payload blijft
// de waarde valideren tegen de keuzelijst, dus de toegelaten set blijft identiek.
//
// Idempotent: staat de kolom al op text, dan is dit een no-op. De cast vanuit de enum naar text
// werkt altijd (enum→text is altijd geldig).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'players' AND column_name = 'position' AND data_type = 'USER-DEFINED'
      ) THEN
        EXECUTE 'ALTER TABLE "players" ALTER COLUMN "position" TYPE text USING "position"::text';
      END IF;
    END $$;
  `)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Bewust geen terugzet naar enum: tekst is de gewenste, robuuste eindtoestand.
}
