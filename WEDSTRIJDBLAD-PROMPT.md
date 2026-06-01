# Claude Code prompt — Digitaal wedstrijdblad & ledensysteem

> Plak dit in Claude Code samen met `PROJECT.md` en `KRACHTBAL-REGLEMENT.md` in de repo.
> Dit document beschrijft de **wedstrijdblad-laag** bovenop het al gespecificeerde live-score/statistiekplatform.
> Stack blijft: Next.js (App Router) + Payload CMS + Drizzle/SQLite op Railway + SSE.

---

## Doel

Bouw een digitaal wedstrijdblad dat het papieren KVKBF-aantekenblad volledig vervangt. Het systeem kent het reglement (zie `KRACHTBAL-REGLEMENT.md`) en past het autonoom toe: juiste categorie, vergunningscontrole, knipjes-handhaving, worpregels. Doel = geen schrijffouten, minder boetes, en herbruikbare data voor competitie én beker.

Kernfilosofie (citaat opdrachtgever): *"Het krachtbalreglement zit al in het systeem dus dat doet alles juist."* en *"klik-klik-klik."* — minimale handinvoer, maximale automatische afhandeling, maar met een manuele override-mogelijkheid voor de scheidsrechter/admin zolang het blad niet is ingediend.

---

## Rollen & rechten

Bouw role-based access met minstens deze rollen:

1. **Club-beheerder** — voert eigen leden in, stelt opstelling op voor eigen ploeg, ziet enkel eigen invulling vóór vrijgave.
2. **Scheidsrechter** — toegewezen aan een wedstrijd; kan vanaf ~1u voor aanvang beide opstellingen zien, status wijzigen, manueel overschrijven, finaliseren en indienen.
3. **Federatie/admin (comité of afgevaardigde)** — beheert vergunningen, kan altijd manueel overschrijven (zolang niet ingediend), ziet alle knipjes-overzichten, beheert reeksindeling.
4. **Kapitein** — tekent het blad af na de wedstrijd (digitaal akkoord).

---

## Datamodel (uitbreiding op PROJECT.md)

### `Members` (spelende leden) — NIEUW, centraal
- naam, voornaam, **geboortedatum** (→ bepaalt automatisch leeftijdscategorie volgens reglement §4)
- club (relatie)
- rugnummer-voorkeur (optioneel)
- **vergunningsstatus**: enum `geen` / `aangevraagd` / `geldig` — **enkel federatie/admin mag dit zetten**. UI toont een gekleurde bol naast de naam (groen = geldig).
- medisch attest ja/nee
- knipjes-historiek (afgeleid, zie hieronder)
- actief/inactief

### `Clubs`
- naam, logo, reeks(en) waarin ploegen spelen

### `Teams`
- club (relatie), categorie, geslacht (heren/dames), reeks
- → categorie bepaalt balgewicht, worpaantal, speelduur (uit reglement)

### `Officials`
- naam, type (scheidsrechter / grensrechter / aantekenaar / tijdopnemer), federatie-lidnummer
- scheidsrechters worden aan wedstrijden toegewezen door comité/admin

### `Matches` (uitbreiding)
- thuisploeg, uitploeg, datum/uur, reeks, categorie, match-nummer
- **status-enum** (zie workflow hieronder)
- toegewezen scheidsrechter + grensrechter
- toss-resultaat, voorgift (bekerwedstrijden: 3 ptn per reeksverschil, max 6)
- type: `competitie` / `beker` / `tornooi` / `test`

### `MatchSheets` (het wedstrijdblad zelf)
- match (relatie)
- thuis-opstelling: lijst van Members + rugnummer + deelgenomen-vlag (O-markering) + IB-gecontroleerd
- uit-opstelling: idem
- officials ingevuld
- keuring/materiële inrichting: checklist (terrein, kleedkamers, douches, aantekentafel, scorebord, grensrechtersvlag, EHBO, bal, kenteken grensrechter, verlichting) — elk OK / NIET OK
- doelpunten (afgeleid uit Throws indien live-scoring, anders handmatig per helft per speler)
- time-outs per ploeg per helft
- **rechtstreeks-buitenspel-kruisjes per ploeg** (afgeleid)
- uitsluitingen (naam + reden + score + speeltijd)
- voorbehoud (naam + reden + score op dat moment)
- opmerkingen / kwetsuren
- handtekening kapitein thuis, kapitein uit, scheidsrechter (timestamp + akkoord)
- override-log: elke manuele overschrijving met wie/wanneer/wat

---

## De workflow (status-machine) — KERN

Implementeer `MatchSheet.status` als strikte state-machine:

1. **`concept`** — clubs vullen vanuit thuis hun eigen opstelling in.
   - Een club ziet **enkel de eigen invulling**, nog niet de namen van de tegenstander.
   - Voorstel: toon automatisch de **laatst gekende opstelling** van die ploeg als startpunt → "klik-klik-klik" om aan te passen.
   - Alleen leden met geldige vergunning + niet-geblokkeerd door knipjes kunnen geselecteerd worden (zie knipjes-regel).

2. **`vrijgegeven`** — vanaf ~1u vóór het geplande aanvangsuur kan de **toegewezen scheidsrechter** beide opstellingen zien. (Maak deze tijdsdrempel configureerbaar.)

3. **`wedstrijdklaar`** — de scheidsrechter zet het blad op deze status na controle (IB's, ledenlijst, materiële keuring). Daarna zijn enkel nog **scheidsrechter-aanpassingen** mogelijk; clubs kunnen niet meer wijzigen.

4. **`bezig`** — wedstrijd loopt; live-scoring (Throws/events uit het hoofdplatform) voedt score, time-outs en kruisjes.

5. **`af te tekenen`** — na de wedstrijd ziet de scheidsrechter alles terug (score, keuring, uitsluitingen, voorbehoud). Beide **kapiteins tekenen digitaal af**.

6. **`ingediend`** — scheidsrechter klikt "indienen":
   - genereer **PDF-wedstrijdblad** (layout op basis van het officiële aantekenblad, zie reglement Deel III)
   - **mail de PDF naar beide clubs**
   - **upload de data naar het federatiesysteem** (API-endpoint configureerbaar; bouw als adapter zodat het later op de echte federatie-API kan worden aangesloten)
   - na indienen: **niets meer wijzigbaar** (reglement Item 37: na aftekening geen wijziging meer, anders forfait).

**Manuele override**: scheidsrechter én federatie/admin moeten **altijd manueel kunnen overschrijven zolang status ≠ `ingediend`**. Belangrijk praktijkgeval (citaat): jeugdploegen die toch speelden terwijl ze eigenlijk niet mochten (om forfait te vermijden) — het systeem moet dat **toelaten met override**, en het wordt nadien een boete + forfaitscore, geen technische blokkade. Elke override gaat in de override-log.

---

## Automatische categorie-indeling ⚙️

Uit `geboortedatum` + reglement §4 (U6 t/m senior, peildatum 1 januari). Een speler mag max. één categorie hoger spelen, nooit lager (tenzij doktersverbod gemeld). Toon een waarschuwing bij selectie buiten de toegelaten categorie, maar blokkeer niet hard (override mogelijk).

---

## Knipjes-systeem (rechtstreeks buitenspel) ⚙️ — "absolute must"

Twee betekenissen van "knipjes/kruisjes" — verifieer met opdrachtgever welke bedoeld is; waarschijnlijk **beide**:

**A. In-match (reglementair, Item 15.18 + 17):** per ploeg, enkel de **laatste worp** die rechtstreeks buiten gaat zonder aanraking tegenpartij telt. Bij de 3e → inworp wordt vrije worp → reset naar 0. Dit hoort in de live-score-engine en wordt op het blad genoteerd.

**B. Administratieve sancties / strafpunten ("knipjes" als boete-/schorsingssysteem):** een teller per **speler/team/club** over het seizoen. Bij **te veel knipjes kan een speler zelfs niet geselecteerd worden** voor een wedstrijd → harde blokkade in de `concept`-fase (met admin-override).

Bouw daarom:
- een `Sanctions`/`Knipjes`-collectie gekoppeld aan Member en/of Team
- automatische opbouw + drempelwaarde die selectie blokkeert (drempel configureerbaar door federatie)
- **overzicht/dashboard van knipjes per club, per team én per speler** (expliciet gevraagd)

> Vraag aan opdrachtgever om de exacte knipjes-/sanctieregels en drempels aan te leveren — die staan niet als zodanig in de RCVK en moeten van de federatie/boetelijst komen.

---

## Databron-hergebruik

- Eén ledendatabase voedt competitie, beker én tornooien.
- Beker: ondersteun namenlijst per ploeg (bindend voor de hele bekercompetitie), voorgift, en de strafworp-tiebreak (4 vrije worpen per ploeg, elk 1 punt ongeacht werpwijze).
- Laatst gekende opstelling per team bewaren om als voorstel te tonen.

---

## Te bouwen schermen

1. **Ledenbeheer (club)** — leden invoeren met geboortedatum; vergunningsbol; knipjes-status zichtbaar.
2. **Vergunningsbeheer (federatie)** — vergunningsstatus per lid zetten.
3. **Opstelling invullen (club, thuis)** — eigen ploeg, laatst-gekende opstelling voorgesteld, alleen selecteerbare (vergunde, niet-geblokkeerde) leden.
4. **Scheidsrechter pre-match** — beide opstellingen (na vrijgave), materiële keuring-checklist, status → wedstrijdklaar.
5. **Live wedstrijd** — het al gespecificeerde scorekeeper-veldscherm (zie PROJECT.md).
6. **Post-match aftekenen** — overzicht + digitale handtekeningen kapiteins + scheidsrechter, dan indienen.
7. **Knipjes-dashboards** — per club / team / speler.
8. **PDF-generatie + mail + federatie-upload-adapter.**

---

## Bouwvolgorde (voorstel)

1. `Members` + `Clubs` + automatische categorie-indeling + vergunningsbol
2. `MatchSheets` + status-machine + rollen/rechten
3. Opstelling-flow met laatst-gekende-opstelling-voorstel + selectieblokkades
4. Scheidsrechter-flow (vrijgave-timing, wedstrijdklaar, override-log)
5. Koppeling met live-scoring (score/time-outs/kruisjes uit Throws)
6. Post-match aftekenen + PDF (op basis officieel aantekenblad)
7. Mail (Resend, zoals LenzieLenz) + federatie-upload-adapter (stub eerst)
8. Knipjes-sanctiesysteem + dashboards

---

## Belangrijke regels die het systeem moet afdwingen (uit reglement)

- Categorie automatisch uit geboortedatum; max. 1 hoger, nooit lager (override + waarschuwing).
- Geen gelijke rugnummers binnen één ploeg.
- Min. 3 / max. 4 veldspelers + max. 4 wissels per ploeg.
- Doelpunt rugworp = 2 ptn (open spel); vrije worp/strafworp = altijd 1 pt.
- Time-out: 2 per ploeg per helft.
- Kruisjes (laatste worp rechtstreeks buiten): 3e → vrije worp → reset, per ploeg.
- Score-autoriteit ligt bij het (digitale) wedstrijdblad; scheidsrechter stelt vast.
- Na indienen onwijzigbaar (Item 37).

---

## Open punten om met opdrachtgever te bevestigen

1. Exacte **knipjes-/sanctieregels en drempel** voor selectieblokkade (komt van federatie-boetelijst, niet uit RCVK).
2. Bestaat er een **echte federatie-API** voor de upload, of is dat voorlopig e-mail/CSV-export? (bouw als adapter)
3. Moet de **digitale handtekening** juridisch zwaar zijn (e-signing) of volstaat een akkoord-met-timestamp + ingelogde gebruiker?
4. Wie host: aparte Railway-service onder welk (sub)domein?
