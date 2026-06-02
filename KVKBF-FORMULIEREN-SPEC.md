# KVKBF-formulieren — systeemvereisten (referentie)

> Bron: officiële KVKBF/KRACHTBAL-SPORT+ formulieren (door Robin aangeleverd).
> Deze documenten zijn de **basis** waarop het systeem verder gebouwd wordt. Per formulier:
> wat het systeem moet ondersteunen, en de huidige status.

---

## 1. Wedstrijdblad correct invullen (`Wedstrijdblad_invullen.pdf`)

Bepaalt **speelduur** en **vereiste officials** per reeks/categorie. Gezaghebbend.

### Speelduur per reeks/categorie ⚙️
- **U12 · U14 · U16** → 2×20 min (jeugd)
- **LH · LD · REGH · REGD · RRL · U18** → 2×25 min (reeksen zonder fanion/beloften)
- **1NHA/B · 1ND · 2NHA/B** → 2×25 min (nationale reeksen)

> Status: ✅ helftduur strikt aan de **reeks** gekoppeld via `reeksHalfDurationSeconds()` in
> `src/lib/reeksen.ts` (jeugd U12/U14/U16 → 2×20, rest → 2×25). `categories.ts` blijft als
> categorie-afgeleide bron behouden.

### Officials per reekstype (wie levert wat) ⚙️
- **Officials: minimum categorie U18.** Altijd **volledige naam + voornaam** leesbaar.
- **U12/U14/U16:**
  - Bezoekers: ≥4 spelers (of 3) + 1 coach (U18+) = noodzakelijk.
  - Thuisploeg levert (indien bezoekers ze niet meebrengen): **aantekenaar + tijdopnemer**, **grensrechter** (mag 2× dezelfde persoon), **terreinafgevaardigde** (mag geen andere functie).
- **LH/LD/REGH/REGD/RRL/U18:** coach telt niet als noodzakelijke official; best ≥5 personen. Regels voor "5 spelers, niemand mee" en "4 spelers + 1 niet-speler". Coach mag geen grensrechter zijn (Art. 25).
- **Nationale reeksen (1NHA/B, 1ND, 2NHA/B):** thuis = aantekenaar/scorer + terreinafgevaardigde + 1 grensrechter + coach; bezoekers = tijdopnemer + grensrechter + coach.

> Status: ✅ officials-functies expliciet gemodelleerd (aantekenaar, tijdopnemer, grensrechter thuis/uit,
> terreinafgevaardigde, coach thuis/uit). Validatie per reekstype in `src/lib/officials-rules.ts`
> (`requiredOfficials` + `validateOfficials`): verplichte functies, naam+voornaam afgedwongen, en
> coach ≠ grensrechter (Art. 25). Het scheidsrechterscherm markeert de verplichte velden en toont
> aandachtspunten; bij **indienen** blokkeert een onvolledig officials-blok het wedstrijdblad.

---

## 2. Kwitantie scheidsrechter (`formulier_2.pdf`)

Vergoeding per scheidsrechter: **€13 per wedstrijd** + **€0,4327 per km**. Per blad meerdere wedstrijden
(wedstrijdnr, datum, uur, reeks, thuis, bezoekers), aantal wedstrijden × €13 + aantal km × €0,4327, naam + handtekening.

> Status: ✅ kwitantie-PDF per scheidsrechter over een periode via `/vergoedingen` →
> `/api/scheidsrechter/[officialId]/kwitantie`. Bundelt de toegewezen wedstrijden, telt €13/wedstrijd +
> €0,4327/km (km per wedstrijd ingevuld op het scheidsrechterscherm). Logica in `src/lib/vergoeding.ts`
> + `src/lib/vergoeding-data.ts`, PDF in `src/lib/submit/pdf-vergoeding.ts`.

## 3. Onkostenblad forfait (`formulier_3.pdf`)

In te vullen enkel bij FF wanneer de scheidsrechter betaald/verplaatst is: wedstrijdnr, datum, uur, reeks, ploegen,
wedstrijdvergoeding (×€13), verpl.kosten (×€0,4259/km), gemelde forfait thuis/bezoekers (ja/neen), #auto's (max 2), km.

> Status: ✅ forfait-blok op het wedstrijdblad (van toepassing, gemeld thuis/bezoekers, #auto's, km).
> FF-onkostenblad-PDF via `/api/match/[id]/forfait` (knop op het scheidsrechterscherm). Telt €13/wedstrijd +
> €0,4259/km — **bewust** het andere km-tarief dan de kwitantie (bevestigd met Robin).

## 4. Aangifte lichamelijk ongeval (`formulier_14.pdf` — DVV/OKRA-SPORT)

Verzekeringsaangifte bij blessure: slachtoffer (naam, adres, geboortedatum, beroep), ongeval (plaats, datum/uur,
omstandigheden), getuigen, + geneeskundig getuigschrift (apart blad). Te versturen naar KRACHTBAL-SPORT+ / verzekeraar.

> Status: ✅ collectie `Accidents` (Ongevalsaangifte): slachtoffer (lid/naam/adres/geboortedatum/beroep),
> ongeval (wedstrijd-koppeling, plaats, datum/uur, omstandigheden), getuigen. PDF-export via
> `/api/ongeval/[id]/pdf` (`src/lib/submit/pdf-ongeval.ts`). Het geneeskundig getuigschrift blijft een
> apart blad.

## 5. Bekerfinales — organisatie (`formulier_12.pdf`)

Uitgebreide taakverdeling OC / Federatie / SRC voor bekerfinaledagen (infrastructuur, affiches, pers, terreinen,
scoreborden, wedstrijdschema, kampioenenhulde…). Vooral organisatorisch, niet live-scoring.

> Status: ✅ collectie `CupFinals` (Bekerfinale) met een takenlijst die bij aanmaken automatisch gevuld
> wordt met het standaardsjabloon (`src/lib/bekerfinale-checklist.ts`), verdeeld over OC / Federatie / SRC.
> Overzicht met voortgang per verantwoordelijke op `/bekerfinale`. Taken vink je af in het beheer.

---

## Voorgestelde prioriteit

1. **Reeks → speelduur strikt** (snelle, exacte koppeling) + officials-functies op het wedstrijdblad met validatie per reekstype. (Sluit aan op wat er al staat.)
2. **Scheidsrechter-kwitantie** (€13/wedstrijd + km) — concrete, afgebakende PDF-generatie.
3. **Forfait-onkostenblad** — bouwt voort op 2.
4. **Ongeval-aangifte** (verzekering) — apart, PDF in DVV-formaat.
5. **Bekerfinale-checklist** — optioneel/organisatorisch.

> ✅ Alle vijf de punten zijn uitgewerkt (juni 2026). Bevestigd met Robin: de km-vergoeding verschilt
> **bewust** per formulier (€0,4327 kwitantie vs €0,4259 forfait) — beide tarieven staan zo in `vergoeding.ts`.
