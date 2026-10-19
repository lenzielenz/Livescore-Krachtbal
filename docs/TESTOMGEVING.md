# Federatie-testomgeving

Een tweede, volledig gescheiden versie van het platform waar de **federatiekant** getest, getoond
en verbeterd wordt, terwijl de live site in **supportersmodus** blijft draaien.

| | Live | Federatie-test |
|---|---|---|
| Adres | livescore.roodgries.be | bv. test.livescore.roodgries.be |
| Databank | Postgres (productie) | **eigen** Postgres — niets gedeeld |
| Aantekenmodus | uit de settings (nu: supporters) | **altijd federatie** (vast in de code) |
| Zoekmachines | geïndexeerd | `noindex` |
| Herkenbaar aan | — | gele band "🧪 Federatie-testomgeving" bovenaan |

Dezelfde code draait op beide: elke push naar `main` komt op beide terecht. Wat de omgeving
bepaalt, staat in [`src/lib/omgeving.ts`](../src/lib/omgeving.ts).

## Variabelen

**Op de testomgeving** (app-service):

| Variabele | Waarde |
|---|---|
| `PLATFORM_OMGEVING` | `federatie-test` |
| `NEXT_PUBLIC_PLATFORM_OMGEVING` | `federatie-test` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` — de Postgres **van de testomgeving** |
| `PAYLOAD_SECRET` | een **nieuw** geheim (niet dat van live) |
| `LIVE_URL` | `https://livescore.roodgries.be` (knop "Terug naar live") |

Laat `CRON_SECRET`, `SEED_SECRET` en `CV_BRIDGE_TOKEN` weg tenzij je die functies daar
expliciet wil testen; dan krijgen ze een eigen waarde.

**Op live** (app-service): `FEDERATIE_TEST_URL` = het adres van de testomgeving. Dan staat in de
admin-navigatie de knop "🧪 Naar federatie-testomgeving". Zonder die variabele verandert er op
live niets.

## Opzetten in Railway (eenmalig)

1. Project **Livescore-krachtbal** → bovenaan de omgevingskeuze → **New Environment** →
   *Duplicate environment* van `production`, naam `federatie-test`.
2. In `federatie-test`: verwijder de tijdelijke diensten (`tmp-…`). Hou de app-service en
   Postgres. De Postgres van deze omgeving is een **nieuwe, lege** databank; het media-volume
   is ook leeg.
3. Zet op de app-service de variabelen hierboven. Railway bouwt en draait de migraties
   (`payload migrate`), zoals op live.
4. **Settings → Networking**: genereer een domein of koppel `test.livescore.roodgries.be`.
5. Zet op **live** `FEDERATIE_TEST_URL`.

## Gegevens erin

Kies één van beide:

**A. Leeg beginnen.** Open `/admin` op de testomgeving: de eerste gebruiker wordt admin.
Importeer de kalender via *Speelkalender importeren* en de uitslagen via de federatie-import,
of laad demodata met `pnpm seed`.

**B. Een opgekuiste kopie van live** (echte clubs, ploegen, spelers en kalender):

```bash
# 1. Kopie van live (de URL's staan bij de Postgres-service → Variables → DATABASE_PUBLIC_URL)
pg_dump --no-owner --format=custom "$LIVE_DATABASE_URL" > live.dump
pg_restore --no-owner --clean --if-exists --dbname "$TEST_DATABASE_URL" live.dump

# 2. Meteen opkuisen, mét de variabelen van de TESTomgeving
PLATFORM_OMGEVING=federatie-test DATABASE_URL="$TEST_DATABASE_URL" PAYLOAD_SECRET=… \
TEST_ADMIN_EMAILS="jij@voorbeeld.be" TEST_ADMIN_WACHTWOORD="…" \
pnpm testomgeving:opkuisen

# 3. live.dump weer verwijderen
rm live.dump
```

`testomgeving:opkuisen` ([script](../scripts/testomgeving-opkuisen.ts)) doet het volgende:
- verwijdert de medische ongevalsaangiftes en de push-abonnementen;
- rondt geboortedata van spelers af op 1 januari (de categorie blijft kloppen);
- anonimiseert elke gebruiker ("Gebruiker 12", `gebruiker-12@test.invalid`, willekeurig
  wachtwoord), behalve de beheerders in `TEST_ADMIN_EMAILS`.

Het script weigert te draaien zonder `PLATFORM_OMGEVING=federatie-test`.

Clublogo's staan op het media-volume, niet in de databank. In een kopie tonen clubs dus
initialen tot je de logo's opnieuw uploadt.

## Later: de federatiekant live zetten

Als het product af is: zet op live in de admin **Settings → Wie tekent aan?** op *Federatie*.
Daarmee verdwijnt de supportersmodus overal. De testomgeving kan blijven als plek om nieuwe
dingen eerst te proberen.
