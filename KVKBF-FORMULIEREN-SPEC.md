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

> Status: ✅ helftduur zit in `src/lib/categories.ts` (jeugd 20 min, overige 25 min). Klopt met dit blad.
> TODO: koppel de duur strikt aan de **reeks** (nu via categorie). De reeks → duur-tabel hierboven is leidend.

### Officials per reekstype (wie levert wat) ⚙️
- **Officials: minimum categorie U18.** Altijd **volledige naam + voornaam** leesbaar.
- **U12/U14/U16:**
  - Bezoekers: ≥4 spelers (of 3) + 1 coach (U18+) = noodzakelijk.
  - Thuisploeg levert (indien bezoekers ze niet meebrengen): **aantekenaar + tijdopnemer**, **grensrechter** (mag 2× dezelfde persoon), **terreinafgevaardigde** (mag geen andere functie).
- **LH/LD/REGH/REGD/RRL/U18:** coach telt niet als noodzakelijke official; best ≥5 personen. Regels voor "5 spelers, niemand mee" en "4 spelers + 1 niet-speler". Coach mag geen grensrechter zijn (Art. 25).
- **Nationale reeksen (1NHA/B, 1ND, 2NHA/B):** thuis = aantekenaar/scorer + terreinafgevaardigde + 1 grensrechter + coach; bezoekers = tijdopnemer + grensrechter + coach.

> Status: 🟡 `MatchSheets` heeft een vrij officials-blok + keuring. TODO: officials-functies expliciet modelleren
> (aantekenaar, tijdopnemer, grensrechter, terreinafgevaardigde, coach, kapitein) met **validatie per reekstype**
> en de naam/voornaam-vereiste afdwingen.

---

## 2. Kwitantie scheidsrechter (`formulier_2.pdf`)

Vergoeding per scheidsrechter: **€13 per wedstrijd** + **€0,4327 per km**. Per blad meerdere wedstrijden
(wedstrijdnr, datum, uur, reeks, thuis, bezoekers), aantal wedstrijden × €13 + aantal km × €0,4327, naam + handtekening.

> Status: ⬜ nog niet in systeem. Voorstel: scheidsrechter-vergoeding genereren uit de toegewezen/ingediende
> wedstrijden per scheidsrechter (PDF-kwitantie zoals het wedstrijdblad).

## 3. Onkostenblad forfait (`formulier_3.pdf`)

In te vullen enkel bij FF wanneer de scheidsrechter betaald/verplaatst is: wedstrijdnr, datum, uur, reeks, ploegen,
wedstrijdvergoeding (×€13), verpl.kosten (×€0,4259/km), gemelde forfait thuis/bezoekers (ja/neen), #auto's (max 2), km.

> Status: ⬜ nog niet. Voorstel: forfait-status op de wedstrijd + FF-onkostenblad-generatie.

## 4. Aangifte lichamelijk ongeval (`formulier_14.pdf` — DVV/OKRA-SPORT)

Verzekeringsaangifte bij blessure: slachtoffer (naam, adres, geboortedatum, beroep), ongeval (plaats, datum/uur,
omstandigheden), getuigen, + geneeskundig getuigschrift (apart blad). Te versturen naar KRACHTBAL-SPORT+ / verzekeraar.

> Status: ⬜ nog niet. Voorstel: ongeval/blessure-aangifte koppelen aan een wedstrijd + speler, met PDF-export
> in dit formaat. (Lager prioriteit — apart van de live-flow.)

## 5. Bekerfinales — organisatie (`formulier_12.pdf`)

Uitgebreide taakverdeling OC / Federatie / SRC voor bekerfinaledagen (infrastructuur, affiches, pers, terreinen,
scoreborden, wedstrijdschema, kampioenenhulde…). Vooral organisatorisch, niet live-scoring.

> Status: ⬜ buiten de kern. Voorstel: eventueel later een checklist-module voor de OC. Lage prioriteit.

---

## Voorgestelde prioriteit

1. **Reeks → speelduur strikt** (snelle, exacte koppeling) + officials-functies op het wedstrijdblad met validatie per reekstype. (Sluit aan op wat er al staat.)
2. **Scheidsrechter-kwitantie** (€13/wedstrijd + km) — concrete, afgebakende PDF-generatie.
3. **Forfait-onkostenblad** — bouwt voort op 2.
4. **Ongeval-aangifte** (verzekering) — apart, PDF in DVV-formaat.
5. **Bekerfinale-checklist** — optioneel/organisatorisch.

> Te bevestigen met Robin: volgorde + of de km-vergoeding (€0,4327 kwitantie vs €0,4259 forfait) bewust verschilt.
