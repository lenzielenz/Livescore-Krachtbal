import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Herstel de OMGEKEERDE koppeling users.official ← officials.user. Vóór de transactie-fix in de
// Officials-afterChange-hook liep de geneste users-update buiten de transactie en faalde ze op een
// lock-timeout (de fout werd geslikt). Resultaat: officials.user_id stond wél gezet, maar het
// account hield users.official_id = NULL — waardoor de scheidsrechter in z'n portaal "niet
// gekoppeld" bleef en z'n toegewezen wedstrijd niet onder "Van mij" zag.
//
// Opnieuw opslaan repareert dit NIET: de hook stopt vroeg wanneer het user-veld niet wijzigt
// (newUser === oldUser). Daarom vullen we de ontbrekende kant hier eenmalig bij. Enkel waar het
// account nog géén dossier heeft (IS NULL) — we overschrijven geen bestaande, bewuste koppeling.
// Bij meerdere officials op hetzelfde account nemen we de laagste id (deterministisch).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  UPDATE "users" SET "official_id" = sub.oid
  FROM (
    SELECT "user_id" AS uid, MIN("id") AS oid
    FROM "officials"
    WHERE "user_id" IS NOT NULL
    GROUP BY "user_id"
  ) sub
  WHERE "users"."id" = sub.uid AND "users"."official_id" IS NULL;`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Een data-backfill is niet betrouwbaar terug te draaien (we weten achteraf niet welke rijen
  // door deze migratie gezet zijn vs. door een latere bewuste koppeling). Bewust een no-op.
}
