import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Nieuwe global 'secretariaat': contactgegevens van het federatiesecretariaat (één vaste record,
// zelfde opzet als 'settings' — geen payload_locked_documents_rels-koppeling nodig voor globals).
// Zie globals/Secretariaat.ts.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE "secretariaat" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"adres" varchar,
  	"route_url" varchar,
  	"telefoon" varchar,
  	"telefoon_alt" varchar,
  	"email" varchar,
  	"melden_uitslagen" varchar,
  	"federatie_api_contact" varchar,
  	"bron" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP TABLE "secretariaat" CASCADE;`)
}
