# Deploy — Railway

GitHub → Railway auto-deploy via **Railpack** (geen Dockerfile). Elke push naar `main` triggert een nieuwe build.

## Database: Postgres (productie) of SQLite (lokaal)

De app kiest de adapter automatisch op basis van `DATABASE_URL`:
- begint met `postgres://` of `postgresql://` → **Postgres** (`@payloadcms/db-postgres`)
- anders (`file:...`) → **SQLite** (`@payloadcms/db-sqlite`)

**Productie (huidige Railway-opzet) = Postgres:**
1. Voeg een **Postgres**-service toe in het Railway-project.
2. Op de app-service: `DATABASE_URL` = referentie naar de Postgres (`${{Postgres.DATABASE_URL}}`).
3. Geen Volume nodig (Postgres heeft zijn eigen opslag).

**Alternatief = SQLite + Volume:** Volume mounten op `/data` en `DATABASE_URL=file:/data/krachtbal.db`.

## Eenmalige setup

1. **Service** gekoppeld aan de GitHub-repo `lenzielenz/Livescore-Krachtbal`.
2. **Database** zoals hierboven (Postgres-service óf Volume).
3. **Environment variables**:
   - `DATABASE_URL` — zie hierboven.
   - `PAYLOAD_SECRET=<32-byte hex>` — genereer met
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   - `PORT` wordt door Railway geïnjecteerd; `next start` pikt die automatisch op.

## Build & start (door Railpack afgeleid)

- Node-versie: vastgelegd in `.node-version` (24 — vereist door Next 16 / Payload 3.85).
- Install: `pnpm install`
- Build: `pnpm build` (`next build`)
- Start: `pnpm start` (`next start`) — zie `railway.json`.

## Let op

- **Node 22 → 24**: PROJECT.md noemde Node 22, maar Next 16 + Payload 3.85 vereisen Node ≥ 24.14. Daarom Node 24.
- SQLite + Volume betekent **één** service-instance (geen horizontale schaling); voor dit live-score-gebruik ruim voldoende.
- DB-migraties: Payload draait in dev met `push`-modus (auto-schema). Voor productie later `payload migrate` toevoegen aan een release-stap.
