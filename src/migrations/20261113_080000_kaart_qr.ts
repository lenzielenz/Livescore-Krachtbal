import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Medische kaart met QR (lib/medische-kaart-code.ts): onthoud bij elk attest of de foto of scan de
// QR-code van de kaart van dit lid toonde, en wat het systeem op de aankruisvakjes las. Onafhankelijk van
// andere migraties.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "medische_attesten" ADD COLUMN IF NOT EXISTS "herkend_via_qr" boolean DEFAULT false;
  ALTER TABLE "medische_attesten" ADD COLUMN IF NOT EXISTS "lezing" jsonb;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "medische_attesten" DROP COLUMN IF EXISTS "herkend_via_qr";
  ALTER TABLE "medische_attesten" DROP COLUMN IF EXISTS "lezing";`)
}
