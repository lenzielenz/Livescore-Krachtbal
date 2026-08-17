# Regels vs. implementatie — conformiteitsanalyse

> Bron van waarheid: `KRACHTBAL-REGLEMENT.md` (RCVK, geldig vanaf 01/07/2025).
> Dit document zet elke ⚙️ SYSTEEM-regel naast de code en zegt of ze klopt, vereenvoudigd is,
> of ontbreekt. Bedoeld als checklist vóór we op de afgeleide statistiek (analyse) gaan bouwen:
> een analysemodule is maar zo betrouwbaar als de regel eronder.

Peildatum: augustus 2026. Codebestanden: `src/lib/field.ts`, `src/lib/krachtbal-rules.ts`,
`src/lib/categories.ts`, `src/lib/match-engine.ts`.

---

## 1. Wat klopt ✅

| Regel | Waar | Opmerking |
| --- | --- | --- |
| §2 veldmaten: 26 m speelveld, 14 m breed, vrijeworplijn op 4 m | `field.ts` `FIELD` | Doelgebiedsdiepte is per wedstrijd instelbaar (`goalAreaDepth`, min. 10 m / 15 m nieuw); doellijn én vrijeworplijn schuiven correct mee, de middellijn blijft op 0.5 |
| §2 afstand op schaal | `distanceM` | y-component schaalt met de échte veldlengte (26 + 2×diepte), niet met een vaste 46 m |
| §6.3/§6.8 worpaantal per opzetplaats | `throwsAllowed` + `categoryConfig` | Eigen helft 3 (4 jeugd), tegenhelft 2 (3 jeugd) |
| §6.8 U16-meisjes spelen met senioren-worpaantal | `matchThrowsAllowed` + `reeksUsesSeniorThrows` | Override op reeksniveau, dus niet op categorie — correct |
| §6.3 opzet exact op de middellijn = 2 (of 3) worpen | `isOnOwnHalf` (strikt `< 0.5`) | Een opzet óp de lijn valt op `opponent`, dus het lagere worpaantal |
| §6.3 "de middellijn is nooit beperkend voor de voet" | — | Er wordt nergens een voetbeperking op de middellijn afgedwongen |
| §6.6 doelpunt pas als de doellijn **volledig** overschreden is | `isInTargetGoalArea` (strikt `>`) | Bal óp de doellijn = géén doelpunt |
| §6.6 rugworp = 2 punten, nekworp = 1 | `pointsForThrow` | |
| §12/Item 48.1 vrije worp levert **altijd** 1 punt op | `pointsForThrow` (`freeThrow` wint van `rug`) | |
| §6.7 + §10.2-18 kruisjes | `isCrossThrow`, `reduceTotals`, `CROSS_LIMIT` | Enkel de doelworp telt, enkel rechtstreeks buiten (zij/achter) zonder aanraking, een vrije worp telt nooit mee, en bij het 3e kruisje volgt een vrije worp + reset naar 0 |
| §6.9 dezelfde speler mag geen 2 opeenvolgende worpen | `match-engine.ts` (harde fout bij registratie) | |
| §6.11.1 inworp is voor de ploeg die het buitenspel niet veroorzaakte | `nextSetup` | `touchedBeforeOut` houdt de bal bij de werpende ploeg |
| §6.11.1 "inworp van rechtover die plaats" | `nextSetup` | De breedte (x) van de landing blijft behouden i.p.v. altijd centraal te herstarten |
| §6.8 worpaantal ná inworp volgt de helft waar de bal buiten ging | `nextSetup` (`isOnOwnHalf(landing)`) | |
| §6.12 + §6.4 vangst | `nextSetup` (`caught`) | Balbezit draait om, vangplaats wordt werpplaats; vangst ín het doelgebied verschuift naar de doellijn |
| §6.3 opzet vanaf de vrijeworplijn bij aftrap en na een doelpunt | `startMatch`, `nextSetup` (`goal`) | |
| §8 speelduur 2×20 (U12/U14/U16) en 2×25 (U18+) | `categoryConfig` | |
| §8.1 time-outs: 2 per ploeg per helft | `recordTimeout` (`TIMEOUTS_PER_HALF`) | Wordt afgedwongen, niet enkel geteld |
| §8.1 scheidsrechtersonderbreking telt niet in het quotum | `recordRefereeStop` | |
| §12 "alleen de scheidsrechter oordeelt" → undo verplicht | `undoLastThrow` | Ook een toegekende maar nog niet genomen vrije worp kan ongedaan gemaakt worden |
| §12/§19 uitslag definitief na afloop | finished-guard in `recordThrow` | |
| §8 vrije worp toegekend vóór het rustsignaal mag nog genomen worden | `endHalf` + `isPendingFreeThrow` | Een toegekende, nog niet genomen vrije worp blijft openstaan; het scorekeeper-scherm toont het veld tot ze geregistreerd is. `startNextHalf` ruimt ze op als ze niet meer genomen werd |
| §6.4 werpplaats schuift terug tot op de vrijeworplijn | `projectWerpplaats` (`field.ts`), toegepast in `recordThrow` én in het veldschema | Van dichter dan 4 m werpen kan niet meer; afstandsstatistiek klopt |
| §4 posities (achterspeler, 2 vleugels, barage) en uniek rugnummer | `Players`, `assertValidLineup` | Minimum 3 veldspelers wordt gecontroleerd |
| §11 scheiding ruwe invoer / afgeleide staat | event-sourcing over `throws` | Score, balbezit, worpteller en kruisjes worden nergens apart bewaard |

---

## 2. Vereenvoudigd — bewuste of stilzwijgende benadering 🟡

### 2.1 De achterlijn valt samen met de veldrand (§2)

Het reglement legt de achterlijn op 1 m achter het doelgebied; de app laat het doelgebied doorlopen
tot `y = 1` en beschouwt alles daarbuiten als `out_back`. Een tik in die laatste meter telt dus als
doelpunt i.p.v. buitenspel. In de praktijk marginaal (de aantekenaar tikt waar de bal valt, en de
diepte is instelbaar), maar het is een echte afwijking.

### 2.2 Zijlijn: "op of buiten" vs. strikt buiten (§6.11)

`isOutSide` test `x < 0 || x > 1`. Het reglement noemt een bal die de grond raakt **op** de zijlijn
al buitenspel. Genormaliseerd valt de binnenkant van de lijn op `x = 0`, dus de app is één lijnbreedte
te mild. Verwaarloosbaar ten opzichte van de tikprecisie, maar goed om te weten.

### 2.3 Inworphoek niet gemodelleerd (§2, §6.11.1)

"Verdediger duwt de bal buiten ter hoogte van het doelgebied → inworp vanaf de inworphoek" bestaat
niet als aparte uitkomst; die inworp herstart gewoon op de landingsplaats.

### 2.4 Inworp achter de eigen doellijn (§6.11.1, §10.1-15)

De verplichte "pass van buiten het veld naar een medespeler achter de doellijn" — en het balverlies
wanneer die pass er niet komt — worden niet gemodelleerd. `out_back` geeft simpelweg een opzet aan de
tegenpartij (of aan de werpende ploeg bij `touchedBeforeOut`).

### 2.5 Kruisjes lopen over de volledige wedstrijd

De teller reset enkel bij het 3e kruisje, niet bij de rust. Het reglement zegt hier niets over;
we leggen de keuze hier expliciet vast zodat ze niet per ongeluk verandert.

---

## 3. Ontbreekt ⛔

### 3.1 Eigen doelpunt (§6.6) — echte gat

> "Bal aan de grond in eigen doelgebied = doelpunt voor de tegenpartij (genoteerd op naam/nummer
> van de kapitein)."

`deriveOutcome` kijkt uitsluitend naar het **aangevallen** doelgebied (`isInTargetGoalArea`). Een tik
in het eigen doelgebied levert `in_field` op: geen punt, geen balbezitwissel. Zeldzaam (het vergt een
achterwaartse worp of een misgrepen bal in eigen doelgebied), maar de score klopt dan niet.
Oplossing vraagt een nieuwe uitkomst (`own_goal`) op de `throws`-collection plus toewijzing aan de
kapitein — dus een schema- + migratiewijziging.

### 3.2 Middellijnregel bij jeugd (§6.9 / Item 14.9) — te bevestigen

> "De **2e (of 3e)** worp na opzet uit eigen helft moet de middellijn raken/overschrijden."

`isMidlineFault` toetst altijd `throwNumber === 2`. Overal elders in het reglement betekent zo'n
haakje "… bij jeugd" (vgl. §6.8: "3 werpbeurten (of 2 bij opzet tegenhelft)"). Consistent gelezen is
de bedoelde worp telkens **de worp vlak vóór de doelworp**: nummer 2 bij 3 worpen, nummer 3 bij 4
worpen. Als dat klopt, straft de app jeugdwedstrijden één worp te vroeg af.

**Niet gewijzigd** — dit verandert echte spelbeslissingen. Voorleggen aan de federatie, dan in
`isMidlineFault` de doelworp-index gebruiken i.p.v. de harde 2.

### 3.3 De pass bestaat niet in het datamodel (§6.10)

Spelers mogen de bal 5 seconden zijwaarts/achterwaarts doorgeven, en **een zijwaartse pass verlegt de
werpplaats**. De app registreert enkel worpen. Gevolgen:

- de werpplaats van de volgende worp klopt niet wanneer er gepast werd → opnieuw de afstandsstatistiek;
- er is geen passnetwerk, geen "wie zet wie op", geen balcirculatie-analyse mogelijk.

Dit is de grootste ontbrekende **analyse**-laag, niet zozeer een scorefout.

### 3.4 Fouten worden niet geregistreerd (§6.2, §6.5, §6.10, §10.1, §10.2)

Geen invoer voor: foutieve nek-/rugworp, rugworp na aanloop, foutief hinderen binnen 2 m,
5-secondenfout, voorwaartse pass, zijdelings afwijken >1 m, voorbij de werpplaats lopen, aanvaller in
het tegendoelgebied, opzettelijke fout van de verdediger (§10.2-24, met 1 of 2 extra vrije worpen).

Dat is grotendeels **bewust**: §11 zegt dat de aantekenaar ruwe feiten invoert en de scheidsrechter
oordeelt. Vandaag is de enige uitweg de handmatige `freethrow`-actie, die het gevolg vastlegt maar
niet de oorzaak. Voor analyse betekent het: geen foutenstatistiek, geen disciplineprofiel per ploeg.

### 3.5 Balgewicht per categorie en geslacht (§3)

Niet gemodelleerd. Puur informatief (wedstrijdblad/materiaalcontrole), geen invloed op afgeleide
staat — maar het hoort wel bij een volledig digitaal wedstrijdblad.

---

## 4. Wat dit betekent voor de analysemodules

| Afgeleide grootheid | Betrouwbaar? |
| --- | --- |
| Score, kruisjes, time-outs, worpnummer/doelworp, balbezitwissels | ✅ regelgetrouw |
| Zone (links/midden/rechts, vanuit aanvalsrichting) | ✅ |
| Worpafstand en alles wat erop bouwt (expected points, gevaarsprofiel, afstandsverdeling) | 🟡 de werpplaats respecteert nu de vrijeworplijn, maar blijft **te kort** zolang passes ontbreken (§3.3) |
| Doelworp-analyse (hoe dicht wordt afgewerkt) | 🟡 idem |
| Passnetwerk, balcirculatie, 5-secondendruk | ⛔ ontbreekt (geen passen in het model) |
| Foutenstatistiek, discipline | ⛔ ontbreekt (geen fout-events) |

Let op: worpen van vóór deze wijziging bewaren de oude (ongeprojecteerde) `distance`. Wie
historische wedstrijden vergelijkt, vergelijkt dus twee lichtjes verschillende definities zolang er
geen herberekening loopt. De ruwe events blijven correct — `distance` is enkel een afgeleide
gemakswaarde op het worp-record.

---

## 5. Voorgestelde volgorde

1. ~~§8 vrije worp bij het eindsignaal~~ — **gedaan**.
2. ~~§6.4 werpplaats-projectie tot vóór de vrijeworplijn~~ — **gedaan** (`projectWerpplaats`).
3. **§3.2 middellijnregel bij jeugd** — eerst bevestigen bij de federatie, dan één regel code.
4. **§3.1 eigen doelpunt** — schema + migratie + toewijzing aan de kapitein.
5. **§3.3 de pass** — nieuwe event-soort; de grootste uitbreiding, maar ook de grootste
   analysewinst (passnetwerk + correcte werpplaats).
6. **§3.4 fout-events** — enkel als de aantekenaar het ritme aankan; anders bewust buiten scope
   houden zoals §11 voorschrijft.
