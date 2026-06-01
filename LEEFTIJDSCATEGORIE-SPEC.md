# Aanvulling — Leeftijdscategorie & speelgerechtigdheid (volledige logica)

> Vervangt/verfijnt de sectie "Automatische categorie-indeling" in `WEDSTRIJDBLAD-PROMPT.md`.
> Bron: RCVK §4.6 (leeftijdscategorieën) + §4.6 slotbepaling (hoger/lager spelen). Zie `KRACHTBAL-REGLEMENT.md`.
> Doel: Claude Code kan dit één-op-één implementeren zonder interpretatie.

---

## 1. Invoer

Per lid wordt **geboortedatum** ingevoerd. Daaruit leidt het systeem de categorie af. Geslacht (heren/dames) is een aparte eigenschap en bepaalt mee balgewicht en bij U16 het worpaantal — niet de leeftijdsgrenzen zelf.

## 2. Peildatum-principe ⚙️

Het reglement formuleert elke categorie als: *"geen X worden vóór 1 januari"*. De relevante peildatum is **1 januari dat in het lopende seizoen valt**.

- De competitie loopt van september (jaar N) tot de bekerfinales (voorjaar jaar N+1).
- De peildatum is dus **1 januari van jaar N+1**.
- Een seizoen identificeren we als `seizoen = N` (het jaar waarin september valt). Peiljaar `P = N + 1`.

**Bepalende grootheid = `leeftijd op 1 januari van peiljaar P`**, oftewel eenvoudiger te berekenen via geboortejaar:

```
leeftijdOpPeildatum = P - geboortejaar
```

(Let op: dit is de leeftijd die de speler bereikt in het kalenderjaar P. Omdat de grens telkens "wordt geen X vóór 1 januari" is, werkt de geboortejaar-vergelijking exact: iemand die in jaar P de leeftijd L bereikt, is "L geworden" in dat jaar.)

> **Implementatienoot:** maak het peiljaar `P` configureerbaar per seizoen (een `Season`-record met `startYear = N`), zodat de competitie-administratie het seizoen kan zetten en alle categorieën automatisch meeschuiven. Reken NIET met de actuele systeemdatum of de wedstrijddatum voor de categorie-indeling — enkel met geboortejaar t.o.v. peiljaar.

## 3. Categorie-tabel ⚙️

`leeftijdOpPeildatum = P − geboortejaar`. Categorie:

| Categorie | leeftijdOpPeildatum | Toelichting reglement |
|-----------|---------------------|------------------------|
| U6  | < 6   | jonger dan 6 |
| U8  | 6 – 7 | wordt geen 8 vóór 1/1 |
| U10 | 8 – 9 | wordt geen 10 vóór 1/1 |
| U12 | 10 – 11 | wordt geen 12 vóór 1/1 |
| U14 | 12 – 13 | wordt geen 14 vóór 1/1 |
| U16 | 14 – 15 | wordt geen 16 vóór 1/1 |
| U18 | 16 – 17 | wordt geen 18 vóór 1/1 |
| U20 | 18 – 19 | wordt geen 20 vóór 1/1 |
| senior | ≥ 20 | 20 jaar of ouder |

Pseudocode:

```
function eigenCategorie(geboortejaar, peiljaarP):
    leeftijd = peiljaarP - geboortejaar
    if leeftijd < 6:  return "U6"
    if leeftijd <= 7:  return "U8"
    if leeftijd <= 9:  return "U10"
    if leeftijd <= 11: return "U12"
    if leeftijd <= 13: return "U14"
    if leeftijd <= 15: return "U16"
    if leeftijd <= 17: return "U18"
    if leeftijd <= 19: return "U20"
    return "senior"
```

## 4. Wat mag — hoger/lager spelen ⚙️

Volgorde van categorieën (laag → hoog):
`U6 < U8 < U10 < U12 < U14 < U16 < U18 < U20 < senior`

Regels:
1. **Eigen categorie**: altijd toegestaan.
2. **Eén categorie hoger**: toegestaan, **tenzij** er een doktersverbod geregistreerd is voor die speler. Een verbod wordt met artsenattest aan de federatie gemeld en als vlag op het lid gezet (`hoger_spelen_verbod = true`).
3. **Twee of meer categorieën hoger**: **niet** toegestaan.
4. **Lager dan eigen categorie**: **nooit** toegestaan.

Pseudocode voor de check bij selectie in een ploeg van categorie `ploegCat`:

```
function magSpelen(spelerCat, ploegCat, hogerVerbod):
    eigenIndex   = index(spelerCat)
    ploegIndex   = index(ploegCat)
    verschil     = ploegIndex - eigenIndex   // >0 = ploeg is hoger dan speler
    if verschil < 0:  return BLOCK   // lager → nooit
    if verschil == 0: return OK      // eigen categorie
    if verschil == 1:
        return hogerVerbod ? WARN_VERBOD : OK   // één hoger, tenzij doktersverbod
    return BLOCK_TE_HOOG   // twee of meer hoger
```

## 5. Hoe het systeem reageert (override-filosofie) ⚙️

Conform de met de opdrachtgever afgesproken filosofie: **waarschuwen, niet hard blokkeren** zolang het wedstrijdblad niet is ingediend. De scheidsrechter/admin kan altijd overschrijven (jeugdploeg die toch speelt om forfait te vermijden → nadien boete + forfaitscore).

Resultaat → UI-gedrag:
- **OK** → speler gewoon selecteerbaar.
- **WARN_VERBOD** (één hoger, maar doktersverbod) → selectie mogelijk met duidelijke waarschuwing + link naar reglement; override gelogd.
- **BLOCK_TE_HOOG** (≥2 hoger) of **BLOCK** (lager) → standaard niet selecteerbaar in de `concept`-fase voor clubs; scheidsrechter/admin kan met expliciete override + reden alsnog toevoegen (gelogd in override-log). Bij indienen kan dit een boete/forfait worden.

> Geen enkele leeftijdsregel mag een match technisch onmogelijk maken zolang het blad niet ingediend is. De blokkade is een drempel voor clubs, geen muur voor officials.

## 6. Extra speelgerechtigdheid-checks (naast leeftijd)

Combineer de leeftijdscheck met de andere voorwaarden uit `WEDSTRIJDBLAD-PROMPT.md` voordat een speler definitief selecteerbaar is:
- **Vergunningsstatus** = `geldig` (bol groen) — gezet door federatie.
- **Medisch attest** aanwezig.
- **Knipjes/sanctie-drempel** niet overschreden (administratief systeem — drempels nog op te vragen bij federatie).
- (Senioren-specifiek, later) de "5× in hogere reeks → niet meer in lagere reeks"-regel (RCVK §29) en "max. 1 speler die in hetzelfde weekend al lager speelde" (§29.2). Deze raken reeks-doorschuiven, niet leeftijd — apart afhandelen.

## 7. Waarschuwing bij randgevallen

- Toon op het lid altijd de **berekende categorie + het peiljaar** waarop ze gebaseerd is, zodat een club ziet waarom iemand in een bepaalde categorie valt.
- Bij seizoenswissel (nieuw `Season`-record) herberekent het systeem alle categorieën automatisch — leden schuiven door. Bewaar historiek zodat oude wedstrijdbladen de toen-geldige categorie blijven tonen.
- Geslacht-afhankelijke regels (balgewicht; U16 meisjes spelen met 3/2 worpen, U16 jongens met 4/3) horen bij de **categorie+geslacht-combinatie**, niet bij de leeftijdsberekening zelf.
