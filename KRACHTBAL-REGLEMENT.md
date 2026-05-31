# Krachtbal — Officieel Reglement (referentie)

> Bron: **RCVK — Reglementering competitie KVKBF vzw, geldig vanaf 01/07/2025** (krachtbal.be/1_RCVK.pdf).
> Dit document is de gezaghebbende referentie voor alle spellogica in dit platform. Bij twijfel telt deze tekst.
> Secties gemarkeerd met **⚙️ SYSTEEM** bevatten regels die de applicatie automatisch moet toepassen.

---

## 1. Het spel (essentie)

Krachtbal wordt gespeeld door 2 ploegen van elk 4 veldspelers. Doel: de bal op voorgeschreven wijze in het doelgebied van de tegenstander aan de grond krijgen, en de tegenstander reglementair beletten te scoren. Geleid door een scheidsrechter + grensrechter.

**Winnaar**: de ploeg met de meeste doelpunten op het einde van de speeltijd. De uitslag = het aantal op het wedstrijdformulier ingevulde doelpunten.

---

## 2. Speelveld en afmetingen ⚙️ SYSTEEM

Het veldschema in de app moet exact deze maten gebruiken (alles symmetrisch):

- **Lengte midden-deel**: 26 m (tussen de twee doelgebieden)
- **Lengte inclusief beide doelgebieden**: 46 m
- **Breedte**: 14 m
- **Doelgebied**: minimum 10 m lang (15 m voor nieuw aan te leggen terreinen), max. onbeperkt; breedte = breedte terrein (14 m)
- **Vrijeworplijn**: op **4 m** van de doellijn, evenwijdig eraan. Dit is de dichtste plaats vanwaar naar het doel van de tegenpartij gegooid mag worden.
- **Middellijn**: verdeelt het terrein in twee gelijke helften.
- **Doellijn**: begrenst samen met zijlijnen en achterlijn het doelgebied.
- **Achterlijn**: op 1 m van de afsluiting achter het doelgebied. Geldt als "virtuele afsluiting": een bal die deze lijn raakt/overschrijdt = buitenspel.
- **Inworphoek**: doellijnen worden 50 cm doorgetrokken voorbij de zijlijn-hoek, bepaalt vanwaar ingeworpen wordt bij buitenspel in het doelgebied.
- **Neutrale zone**: min. 2 m (bij voorkeur 3 m) rondom, evenwijdig aan de zijlijnen. Geen hindernissen, publiek erbuiten.

Afmetingen gemeten van midden tot midden van de lijnen, behalve zijlijnen (binnenkant). Lijnen 8–12 cm breed.

**Geometrie voor de app** (afgeleid): totale veldlengte = 46 m (2 doelgebieden van 10 m + 26 m middenstuk). Vrijeworplijn ligt op doelgebiedrand (10 m) − 4 m... let op: de vrijeworplijn ligt 4 m vóór de doellijn, dus binnen het 26 m middenstuk gemeten vanaf de doellijn. Middellijn ligt op 23 m vanaf elke doellijn (= 13 m vanaf elke vrijeworplijn). **Verifieer deze exacte coördinaten bij implementatie tegen een officieel veldschema.**

---

## 3. Balgewicht per categorie ⚙️ SYSTEEM

Bepaalt mee de categorie-instelling bij matchregistratie.

**Heren**: U8/U10: 800 g · U12: 1 kg · U14: 2 kg · U16/U18: 3 kg · U20/senior: 4 kg
**Dames**: U8/U10: 800 g · U12/U14/U16: 1 kg · U18/U20/senior: 2 kg

---

## 4. Ploegen

- 4 veldspelers per ploeg (minimum 3 om te spelen)
- Max. 4 wisselspelers
- Truien genummerd op de rug (cijfers ≥ 10 cm), geen gelijke nummers binnen één ploeg → **rugnummer is unieke identifier per speler per ploeg**
- Posities: achterspeler, twee vleugelspelers, baragespeler
- Elke ploeg duidt een kapitein aan (mag time-outs/vervangingen vragen)

### Leeftijdscategorieën
U6 <6j · U8 6-7j · U10 8-9j · U12 10-11j · U14 12-13j · U16 14-15j · U18 16-17j · U20 18-19j · senior ≥20j.

---

## 5. Officials

- **Scheidsrechter**: leidt het spel, telt luidop de werpbeurten ("laatste worp" bij 2e/3e/4e beurt), oordeelt als enige over geldigheid doelpunt, vrije worp en toekenning opzet. **Na hervatting kunnen voorgaande fases niet meer bestraft worden.**
- **Grensrechter**: gaat na waar de bal de grond raakte of gevangen werd, controleert buitenspel.
- **Aantekenaar** (lid thuisploeg): noteert op het wedstrijdblad → **dit is de rol die de app digitaliseert**:
  - de aangevraagde onderbrekingen (time-outs)
  - de doelpunten
  - het nummer van de scorende speler
  - het aantal laatste worpen dat rechtstreeks buitenspel veroorzaakt (zonder aanraking tegenpartij)
- **Tijdopnemer** (lid bezoekers): bewaakt speelduur, verwittigt 1 min voor einde helft, belt bij einde speeltijd én bij 3e rechtstreeks buitenspel (ander geluid dan scheidsrechter).
- **Coach**: tijdens spel op de bank; vanaf U18 beperkt tot zone tussen vrijeworplijn en middellijn.

---

## 6. Spelverloop

### 6.1 Toss
Winnaar kiest doelgebied óf opzet. Bij start 2e helft: van doelgebied wisselen, en de ploeg die in de 1e helft niet opzette, zet nu op.

### 6.2 Werpwijzen ⚙️ SYSTEEM
Bal moet met beide armen geworpen (niet gestoten/geduwd). Twee wijzen:
- **Nekworp**: gelaat naar werprichting, bal over het hoofd, symmetrische zwaaibeweging. Mag na aanloop (onbeperkt in lengte) en met sprong.
- **Rugworp**: rug naar werprichting, bal voor lichaam/tussen benen, over het hoofd rugwaarts. Mag met sprong of achterwaarts rollen. **Rugworp na aanloop = fout (vrije worp).**

### 6.3 Opzetten (= start van de aanval) ⚙️ SYSTEEM — KERNREGEL WORPENAANTAL
Aantal werpbeurten hangt af van wáár wordt opgezet:
- **Opzet vanaf eigen speelhelft**: 3 werpbeurten (4 bij jeugd)
- **Opzet vanaf speelhelft tegenstander**: 2 werpbeurten (3 bij jeugd)
- **Opzet vanaf middellijn**: 2 werpbeurten (3 bij jeugd)

De middellijn is **nooit** beperkend voor de voet bij opzet of 2e/3e worp.

**Opzet met volle veldbreedte**:
- Vanaf de **vrijeworplijn**: bij begin speelhelft + na een doelpunt
- Vanaf de **doellijn**: na vangen in eigen doelgebied + na inworp tussen doellijn en achterlijn

**Opzet vanaf vaste werpplaats**:
- Ploeg die bal opvangt na worp tegenpartij → opzet vanaf vangplaats
- Werpplaats overschreden → tegenpartij zet op vanaf die werpplaats

### 6.4 De werpplaats ⚙️ SYSTEEM
De werpplaats = plaats waar de bal na een worp/inworp/zijwaartse pass gevangen wordt of de grond raakt.
- Bal gevangen **in doelgebied** → werpplaats verschuift naar doellijn, volle breedte beschikbaar.
- Bal raakt grond **tussen doellijn en vrijeworplijn** → werpplaats loodrecht geprojecteerd tot juist vóór de vrijeworplijn.
- **De vrijeworplijn is enkel beperkend bij**: aanvang spel; opzet na doelpunt; doelworp naar dichtstbijzijnde doelgebied; worp richting dichtstbijgelegen doel na inworp vanaf inworphoek of tussen doellijn/vrijeworplijn; vrije worp naar dichtstbijzijnde doelgebied.
- **De doellijn is enkel beperkend** bij opzet uit het doelgebied.
- **De middellijn is nooit beperkend.**

### 6.5 Vijf-seconden-regel
Volgende worp/spelhervatting moet binnen 5 sec ingezet worden (telt vanaf bal in zone tussen beide doellijnen komt of opgeraapt wordt). Achteruit gaan voor aanloop telt niet als inzet; de aanloop richting doel wel.

### 6.6 Het doelpunt ⚙️ SYSTEEM — KERNREGEL SCORE
Doelpunt wanneer de bal na een reglementaire worp/pass/inworp **de grond raakt in het doelgebied**. De bal moet de doellijn volledig overschreden hebben **zonder eerst buiten het doelgebied de grond te raken** (een bal die tussen doellijn en vrijeworplijn de grond raakt en dan over de doellijn rolt = géén doelpunt).

**Een doelpunt met rugworp telt DUBBEL (2 punten). Nekworp = 1 punt.**

Eigen doelgebied: bal aan de grond in eigen doelgebied = doelpunt voor de tegenpartij (own-goal → genoteerd op naam/nummer van de kapitein).

### 6.7 De doelworp (laatste worp) ⚙️ SYSTEEM — KERNREGEL KRUISJES
- De **laatste** werpbeurt (3e of 4e na opzet eigen helft; 2e of 3e na opzet tegenhelft) is de doelworp.
- Dichtste plaats voor doelworp = vrijeworplijn.

### 6.8 Aantal worpen (samengevat) ⚙️ SYSTEEM
- **U18/U20/senioren (+ U16 meisjes)**: 3 werpbeurten (of 2 bij opzet tegenhelft)
- **U8/U10/U12/U14/U16 jongens**: 4 werpbeurten (of 3 bij opzet tegenhelft)

**Na inworp**: eigen helft → 3 (of 4); tegenhelft → 2 (of 3); middellijn afhankelijk van waar gevangen.

### 6.9 Opeenvolging van worpen ⚙️ SYSTEEM
- Worp niet gevangen door tegenpartij + bal raakt grond binnen terrein → aanvallende ploeg mag volgende worp nemen tot max. bereikt.
- **Dezelfde speler mag nooit twee opeenvolgende worpen nemen** (fout → vrije worp).
- Opeenvolging onderbroken door: buitenspel/inworp, worp door tegenpartij, worp door ploegmakker, doelpunt in eigen doel, fout met vrije worp.
- **De 2e (of 3e) worp na opzet uit eigen helft moet de middellijn raken/overschrijden.** Zo niet → bal aan tegenpartij, opzet vanaf waar de bal de grond raakte. (Item 14.9)

### 6.10 De pass ⚙️ SYSTEEM
- Spelers mogen de bal 5 sec aan elkaar doorgeven vóór een worp.
- **Doorgeven mag enkel zijwaarts (evenwijdig middellijn) of achterwaarts.** Uitzondering: in eigen doelgebied mag voorwaarts.
- Voorwaartse/schuin-voorwaartse pass = fout → opzet tegenpartij vanaf vorige werpplaats. (Item 14.10)
- Rollen van de bal = verboden.
- Zijwaartse pass verlegt de werpplaats naar waar de vanger staat.

### 6.11 Buitenspel ⚙️ SYSTEEM — KERNREGEL
Buitenspel ontstaat wanneer:
- de bal de grond raakt op of buiten de zijlijnen of achterlijn;
- een speler in contact met de bal de grond raakt op of buiten de zijlijnen;
- een speler buiten het veld contact heeft met de speler-met-bal binnen het veld.

Buitenspel ontstaat **waar de situatie zich voordoet**, niet waar de bal de zijlijn in de lucht oversteekt. (Een bal die enkel de ruimte boven de zijlijn schendt zonder de grond te raken = geen buitenspel, tenzij hij een voorwerp raakt.)

#### 6.11.1 De inworp — plaats ⚙️ SYSTEEM
Genomen door de ploeg die het buitenspel **niet** veroorzaakte, door de speler die de bal recupereert.
- **Rechtstreeks buitenspel voorbij de eigen doellijn**: inworp = pass van langs de zijlijn buiten het veld naar een medespeler achter de doellijn binnen het veld; de **doellijn wordt de nieuwe werpplaats**. Gebeurt dit niet (eerste worp zonder pass van buiten) → **balverlies, inworp tegenpartij**.
- **Bal/speler raakt zijlijn**: inworp van rechtover die plaats, beide voeten buiten het terrein (niet op de lijn).
- **Verdediger duwt bal buiten thv doelgebied**: inworp vanaf de **inworphoek**.

### 6.12 Het vangen van de bal ⚙️ SYSTEEM
Bal is gevangen wanneer volledig tot stilstand gebracht met één/beide armen, zonder de grond te raken. Gevangen bal → de vangende ploeg wordt aanvaller en zet op vanaf de vangplaats (zie 6.3/6.4).

---

## 7. Dode bal & dode tijd ⚙️ SYSTEEM (klok)
**Dode bal**: vanaf eerste grondcontact na de worp tot een speler de bal opraapt voor nieuwe worp/pass/inworp.
**Spel ligt stil (klok-pauze)**: bij vervanging tot fluitsignaal; vóór vrije worp (vanaf toekenning tot fluit); bij buitenspel tot teken inworp; tussen beide helften; bij time-out.

---

## 8. Speelduur ⚙️ SYSTEEM (klok)
- **U12/U14/U16**: 2 × 20 min
- **U18/U20/senioren**: 2 × 25 min
- Rust: max. 10 min tussen helften
- Klok start bij eerste fluit voor opzet; **affluiten scheidsrechter bepaalt einde**.
- Tijdopnemer verwittigt 1 min voor einde helft.
- Na het eindsignaal géén doelpunt meer, **behalve** een vrije worp die binnen de speeltijd werd toegekend (die wordt nog genomen, kan scoren).

### 8.1 Time-out ⚙️ SYSTEEM (tellers)
- **Elke ploeg mag per helft 2× één minuut onderbreking vragen.**
- Kan enkel onmiddellijk na een gelukt doel, of vóór het nemen van een vrije worp.
- Scheidsrechter-onderbreking (SR time-out) stopt de klok maar telt niet in het ploegquotum.

---

## 9. Vervanging
Onbeperkt aantal, maar enkel na aanvraag + toestemming scheidsrechter, op deze momenten: na doelpunt, na time-out, vóór vrije worp, vóór inworp; gekwetste onmiddellijk; uitgesloten speler vóór de vrije worp die uit de uitsluiting volgt. Speler die vrijwillig het veld verlaat mag die helft niet meer vervangen worden. (U12: onbeperkt wisselen op elk moment, mits aanvraag.)

---

## 10. Overtredingen — overzicht

### 10.1 Fouten ZONDER vrije worp (Item 14) → gevolg = opzet/inworp tegenpartij ⚙️ SYSTEEM
1. Bal laten vallen → doelgebied = doelpunt; zijlijn = buitenspel; elders = bal aan tegenpartij (behalve laatste/vrije worp).
2. Bal raken/vangen van eigen ploegmakker die richting tegendoel vordert → opzet tegenpartij.
3/4. Voet op/buiten zijlijn bij worp/aanloop/vangen → buitenspel, inworp tegenpartij.
6. Zijdelings afwijken (>1 m van werpplaats) → opzet tegenpartij vanaf juiste werpplaats.
7. 5-seconden-fout / opzettelijk vertragen → opzet tegenpartij.
9. **2e (of 3e) worp niet op/over middellijn na opzet eigen helft → bal aan tegenpartij, opzet vanaf waar bal grond raakte.**
10. Voorwaartse/schuin-voorwaartse pass → opzet tegenpartij vanaf vorige werpplaats.
14. Voorbij de werpplaats lopen → opzet tegenpartij vanaf werpplaats.
15. Na rechtstreeks buitenspel tussen doellijn/achterlijn geen pass van buiten → balverlies, inworp tegenpartij vanuit inworphoek.

### 10.2 Fouten MET vrije worp (Item 15) ⚙️ SYSTEEM
1. Foutieve nek-/rugworp (niet op voorgeschreven wijze).
2. Foutief hinderen (binnen 2 m).
3. **Dezelfde speler neemt 2+ opeenvolgende worpen.**
5. Aanvaller in tegendoelgebied tijdens worp/aanloop ploegmaat.
7. Gevaarlijk/opzettelijk werpen naar lichaam tegenstrever (naar hoofd → ook uitsluiting).
11. **Ploeg neemt meer worpen dan toegelaten** (2/3/4 naargelang categorie + opzetplaats).
17. Rugworp na aanloop.
18. **Driemaal een laatste worp rechtstreeks buiten → bij de 3e wordt de inworp vervangen door een vrije worp.** ← KRUISJES-REGEL
24. Opzettelijke fout van verdediger op werper: bij scoren nek/rug = 1/2 punten + 1 extra vrije worp; bij niet scoren: nekworp = 1 vrije worp, rugworp = 2 vrije worpen.

### 10.3 Vrije worp — uitvoering (Item 13)
- Genomen vanaf de vrijeworplijn, langs de kant van en naar het doelgebied van de in-fout-zijnde ploeg.
- Max. 1 verdediger tussen doellijn en vrijeworplijn, rest op doellijn/in doelgebied.
- Aanvallers (behalve werper) mogen vrijeworplijn pas over na bal grond/verdediger raakt.
- Werper beschikt over volle breedte.
- Mag geweigerd worden als de ploeg vóór de fout nog meerdere worpen mocht nemen.

---

## 11. Wat de app registreert vs. wat het systeem afleidt

### Aantekenaar voert in (ruwe feiten):
- Welke speler werpt (rugnummer)
- Waar de bal landt (tik op veldschema) → 1 tik = grond, 2 tiks = gevangen
- Worp-type: nekworp (default) of rugworp (toggle)
- Buiten → voor wie de bal is + (bij achter doellijn) aangeraakt ja/nee
- Time-outs, vervangingen, klok start/stop

### Systeem leidt autonoom af:
- Afstand (hemelsbreed, op schaal) + zone (links/midden/rechts op 14 m breedte)
- Worpnummer in de aanval + of het de laatste toegelaten worp is (dynamisch naar opzetplaats + categorie)
- Doelpunt ja/nee + aantal punten (rugworp ×2)
- Balbezit-omkering bij vangst (vangplaats = nieuwe werpplaats, richting flipt)
- Kruisjes-teller per ploeg (enkel laatste worp rechtstreeks buiten zonder aanraking; 3e → vrije worp → reset)
- Time-out-quotum per ploeg per helft (2)
- Stand, statistieken per speler

### Publiek scorebord toont:
Score · tijd + helft · genomen time-outs per ploeg · kruisjes (rechtstreeks buiten) · event-tijdlijn.

---

## 12. Belangrijke nuances om niet te vergeten

- **Score-autoriteit**: officieel telt het wedstrijdblad, niet het scorebord. De scheidsrechter stelt de score vast na elke helft. (Item 19)
- **Alleen de scheidsrechter** oordeelt over geldigheid doelpunt/vrije worp/opzet. Een volledig autonoom systeem moet daarom een **undo/correctie** hebben — de werkelijkheid op het veld heeft voorrang.
- **Rugworp dubbel** geldt voor doelpunten in open spel; **vrije worpen en bekerstrafworpen leveren altijd 1 punt op**, ongeacht werpwijze. (Item 48.1)
- Bal die grond raakt tussen doellijn en vrijeworplijn en dán over de doellijn rolt = **geen** doelpunt.
