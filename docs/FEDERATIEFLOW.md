# Federatieflow

De officiële kant van het platform: van club aanmaken tot speler van het jaar. Wie wat doet, waar,
en welke regel de server afdwingt. Test dit eerst op de federatie-testomgeving
([TESTOMGEVING.md](TESTOMGEVING.md)).

## 1. Clubs en logins — federatie

`/beheer/clubs`: club aanmaken en een clubbeheerder uitnodigen. De uitnodiging is een eenmalige link
(24 uur), dezelfde als bij "wachtwoord vergeten"; de persoon kiest zelf een wachtwoord. Een
federatie- of adminaccount, of een account van een andere club, wordt nooit overgenomen.

## 2. Rechten in de club — clubbeheerder

`/beheer/club-team`: elk lid krijgt een **rol** en eventueel **functies** (meerdere tegelijk).

| | Mag |
|---|---|
| club-beheerder (admin van de club) | alles van de eigen club |
| club-medewerker | aantekenen, opstellingen, spelers en training |
| coach | opstelling van zijn ploegen |
| trainer | training van zijn ploegen |
| jeugdverantwoordelijke | opstelling en training van alle jeugdploegen van de club |
| speler / lid | eigen gegevens en training bekijken |

Eén bron: `src/lib/club-functies.ts`. De functie die iemand zelf op zijn profiel kiest, geeft
nergens rechten.

## 3. Spelers registreren — club, dan federatie

1. Club, `/club/leden`: naam, voornaam, geboortedatum, geslacht, speler of gewoon lid, datum van de
   medische keuring, doktersattest (PDF of foto).
2. De club vinkt aan wie klaar is en dient in. Achter elke naam staat de stand: ✅ mag spelen,
   ⏳ bij de federatie, ✎ nog aan te vullen, ✗ afgekeurd met de reden.
3. Federatie, `/beheer/leden`: de wachtrij bovenaan met attest, vergunningsnummer, goedkeuren (ook
   alles tegelijk) of afkeuren met een reden.

Regels (`src/lib/registratie.ts`): een keuring is één jaar geldig; terwijl de federatie beslist
ligt het lid vast; na goedkeuring wijzigt enkel de federatie naam, geboortedatum en geslacht. Het
attest zien enkel de federatie en de staf van de eigen club.

## 4. Inschrijving, kalender en scheidsrechters — federatie

**Inschrijving** (`/beheer/inschrijvingen` → `/club/inschrijving`). De federatie opent een ronde: seizoen,
deadline, eerste en laatste speelweekend, weekends zonder competitie (beker, feestdagen). Alle clubs krijgen
een melding. Elke club schrijft vóór de deadline haar ploegen in (vooraf ingevuld met die van vorig
seizoen), per ploeg: reeks, thuisdag (za/zo), thuisuur en eventueel een **koppelploeg** (bv. de dames bij
de heren). Daarbij: aantal velden, weekends dat het terrein **niet vrij** is (kermis, eigen tornooi —
"kan echt niet" of "liever niet") en vrije wensen. Tot de deadline aanpassen en opnieuw indienen kan.
De federatie ziet per club wat er binnen is en **verwerkt** (ploegen bijgewerkt of aangemaakt, koppels
gezet). Code: `src/lib/inschrijving.ts`.

**Seizoenskalender met voorkeuren** (onderaan `/beheer/inschrijvingen`). Per reeks een Berger-tabel (heen en
terug, thuis/uit in balans). Gekoppelde ploegen krijgen in hun reeks hetzelfde nummer, zodat ze — als de
tegenstander ook in beide reeksen speelt — **hetzelfde weekend tegen dezelfde club op hetzelfde terrein**
spelen, na elkaar (bv. dames 14:00, heren 16:00). Een lokale zoektocht vermijdt thuiswedstrijden op
weekends dat het terrein niet vrij is. Het voorstel toont wat niet lukte, in gewone taal, en hoeveel
koppels samen vallen; pas na bevestigen worden de wedstrijden aangemaakt. Code:
`src/lib/kalender-planner.ts` (puur, getest), `src/lib/kalender-plan-server.ts`.

**Planner** (`/beheer/planner`): alle geplande wedstrijden per speelweekend in kolommen. Verplaatsen =
slepen, of aantikken en dan het weekend aantikken (tablet). Dag en uur blijven, gekoppelde wedstrijden gaan
mee. Weekends waar het niet kan (ploeg speelt al, terrein niet vrij, geen competitie) worden grijs met de
reden; botsingen staan rood. Ongedaan maken, en opslaan verwittigt iedereen (clubs, scheidsrechter, spelers).

**Verplaatsingsaanvraag** (wedstrijdpagina): de staf van een club stelt een nieuwe datum voor met een reden;
de tegenpartij gaat akkoord of weigert; de federatie keurt goed (in de planner of op de wedstrijdpagina) of
wijst af. Bij goedkeuring krijgt de wedstrijd de nieuwe datum en hoort iedereen het; de scheidsrechter laat
weten als hij dan niet kan. Code: `src/lib/verplaatsing.ts`.

- `/beheer/kalender`: snel één reeks: heen en terug, thuis en uit eerlijk verdeeld, vrije data,
  vast thuisuur per ploeg (ook "za 16:00" uit de reeksindeling). Eerst een voorstel, dan aanmaken.
- `/beheer/scheidsrechters`: per speeldag toewijzen; conflicten (dubbel geboekt, fluiten bij de eigen
  club) in het rood; "Vul automatisch" verdeelt eerlijk. Elke scheidsrechter krijgt een melding.
- `/beheer/wedstrijden`: wedstrijden verplaatsen; beide clubs, de scheidsrechter en de spelers krijgen een melding.

## 5. Wedstrijddag

Elke stap bewaakt de volgende; het wedstrijdblad volgt de wedstrijd vanzelf
(`src/lib/blad-status.ts`: vrijgegeven → *wedstrijdklaar*, gestart → *bezig*, afgelopen → *af te tekenen*).

1. **Selectie — coach** (`/opstelling/[id]`, of via "Mijn club": een coach ziet er zijn eigen ploegen).
   - Hij vinkt spelers aan (⭐ favorieten bovenaan, spelers uit een lagere ploeg met hun knipjes),
     past zo nodig het **rugnummer op dit blad** aan en duidt de **kapitein (C)** aan.
   - De server aanvaardt enkel spelers van die ploeg (of een lagere ploeg van de club) die mogen spelen.
   - Tot de scheidsrechter vrijgeeft, kan de coach wijzigen. Daarna ligt de selectie vast; een speler die
     laat toekomt, zet de scheidsrechter er nog bij.
2. **Controle en vrijgave — scheidsrechter** (`/scheidsrechter/[id]`):
   - hij **controleert elke speler** op beide lijsten ("jij bent die speler, alles in orde"). Wie volgens
     het reglement niet in orde is (vergunning, medische keuring, knipjes, vastgespeeld, categorie),
     staat in het rood en komt niet op de speellijst — ook de scheidsrechter kan dat niet overschrijven,
     enkel de federatie;
   - hij bevestigt de materiële keuring;
   - dan geeft hij vrij met zijn QR of code. Dat kan pas met twee opstellingen (min. 3 spelers, reglement §4), alle
     spelers gecontroleerd en in orde, en een bevestigde keuring.
   Enkel de toegewezen (of backup-)scheidsrechter kan iets aan déze wedstrijd doen.
3. **Aantekenen — tafel** (`/scorekeeper/[id]`): kiest uit de selectie van de coach, met de rugnummers
   van het blad. Starten kan pas na de vrijgave (en niet als de wedstrijd afgelast is).
4. **Blessure** — op elk moment: 🚑 in het aantekenscherm, op de scheidsrechterspagina of bij het
   aftekenen. De scheidsrechter, de tafel, of de coach/club van die ploeg kiest de speler en omschrijft
   kort; het moment (helft, klok, stand) komt er vanzelf bij. Zie *Blessures* hieronder.
5. **Aftekenen** (`/aftekenen/[id]`), pas na het eindsignaal: beide kapiteins en de scheidsrechter. De
   kapiteins tekenen op het toestel van de scheidsrechter (of met hun eigen login, of via clubstaf/coach);
   hun naam komt uit de opstelling. Een handtekening is definitief. Tekent de backup-scheidsrechter
   (de toegewezen was er niet), dan staat zíjn naam op het blad en krijgt hij de vergoeding.
6. **Wie speelde** — de scheidsrechter bevestigt het. Dat telt voor vastspelen en het referendum.
7. **Indienen** — de scheidsrechter: kan pas als de wedstrijd afgelopen is, alle drie getekend hebben,
   de officials volledig zijn en "wie speelde" bevestigd is. Daarna is het blad onwijzigbaar.

### Aftrap later of vroeger

Een ploeg staat in de file, er is ziekte, de vorige wedstrijd loopt uit — of de wedstrijd ervoor valt
weg en de volgende kan vroeger beginnen. Op de wedstrijdpagina of `/scheidsrechter/[id]`: reden kiezen,
+15/+30/… (of een uur), verschuiven. Dat mag de scheidsrechter, de federatie en de staf/coach van beide
clubs. De **volgende wedstrijden van die dag op hetzelfde terrein** (zelfde thuisclub) mee laten
schuiven mag enkel de thuisclub, de scheidsrechter of de federatie. Enkel dezelfde dag, max. 4 uur;
een andere dag is een verplaatsing. Iedereen hoort het: beide clubs, de scheidsrechter(s) en de spelers
op de selectie (en hun ouders). Elke wijziging staat in een logboek (`aftrap-wijzigingen`).
Code: `src/lib/aftrap.ts`.

### Als het toestel uitvalt

- **Geen internet:** elke tik wordt op het toestel bewaard en in volgorde nagestuurd (nooit dubbel).
  Wat de server weigert, staat als "niet verwerkt" in beeld met *Opnieuw* / *Weggooien*. Tikken van
  een vorige sessie (> 15 min oud) worden pas na bevestiging verstuurd.
- **Batterij leeg / gsm vastgelopen:** op een ander toestel *Overnemen*. De scheidsrechter of de federatie
  kan dat meteen; een andere aantekenaar pas na 3 minuten zonder teken van leven van het eerste toestel
  (dat stuurt elke minuut een hartslag). De stand blijft wat er op de server staat.
- **Niemand kan verder:** het **noodblad** (📝 in het aantekenscherm en op de scheidsrechterspagina) is
  een PDF met de stand, de spelers en lege regels. Achteraf geeft de federatie op de wedstrijdpagina de
  **eindstand van papier** in; wat digitaal genoteerd stond blijft staan.

### Afgelasting

Terrein onbespeelbaar of slecht weer? De scheidsrechter gelast af op `/scheidsrechter/[id]`:
reden, toelichting en **minstens één foto** van de omstandigheden. De wedstrijd blijft gepland maar kan
niet starten; de clubs en de federatie krijgen een melding. De federatie (`/beheer/afgelastingen`,
dashboard) bekijkt de foto's en **plant een nieuwe datum** (of trekt de afgelasting in); clubs en
scheidsrechter horen het. Code: `src/lib/afgelasting.ts`.

### Blessures

Een doorgegeven blessure wordt meteen:
- een **ongevalsaangifte** (gekoppeld aan wedstrijd, speler en club);
- een regel bij "Opmerkingen / kwetsuren" op het wedstrijdblad;
- een melding voor de club, de speler (en zijn ouders) en de federatie.

De speler vindt op *Mijn profiel* de **vooraf ingevulde aangifte** en een **geneeskundig getuigschrift**
voor de dokter. Hij laat ze invullen, laadt ze op en dient in. Een club kan dat voor haar speler doen
(`/ongevallen`). De federatie ziet alle dossiers (`/ongevallen`, dashboard) en handelt af of stuurt terug
met een opmerking; de cijfers staan in de statistieken (per maand, categorie en club).
Code: `src/lib/blessure.ts`, `src/lib/ongeval-dossier.ts`.

### Boetes en scheidsrechterskosten

Het reglement in dit project bevat geen bedragen: de federatie zet de **boetelijst** op (beheerpaneel →
Federatie → Boetelijst: omschrijving, artikel, bedrag, en of het systeem ze voorstelt bij een forfait,
een wedstrijdblad dat na X dagen niet ingediend is, of een aftrap die een club zelf later zette wegens
file of ziekte). Het systeem maakt **voorstellen**; de federatie legt op (bedrag aanpasbaar) of schrapt
op `/beheer/boetes`, of legt manueel een boete op. Pas een opgelegde boete ziet de club op
`/club/boetes`: daar meldt ze *Betaald* of *betwist* met uitleg; de federatie bevestigt, handhaaft of
vernietigt. In de instellingen kiest de federatie wie de **scheidsrechterskosten** draagt (federatie,
thuisclub of gedeeld; bij forfait de ploeg die forfait gaf); de club ziet per wedstrijd wat ze verschuldigd
is (€13 + km-vergoeding, zoals op de kwitantie). Code: `src/lib/boetes.ts`.

## 6. Dashboard — federatie

`/federatie` toont wat er nog te doen is (aanvragen, wedstrijden zonder scheidsrechter, opstellingen
binnen 48 uur, bladen niet ingediend, wedstrijden die te lang live staan, clubs zonder login) en de
tools per taak.

## 7. Referendum — speler, speelster en belofte van het jaar

`/federatie/referendum`: ronde aanmaken, openen, sluiten, uitslag bekendmaken (komt in de Erelijst).
Spelers stemmen op `/referendum`.

- Stemmen en gekozen worden: spelers uit 1NAH (heren) en 1NAD (dames) met minstens 5 gespeelde
  wedstrijden dit seizoen (instelbaar per ronde).
- Elke stemmer geeft 5, 4, 3, 2 en 1 punt aan vijf spelers van de eigen competitie, niet aan
  zichzelf en niet aan de eigen club. Zolang de ronde open is, kan je je stem aanpassen.
- Gelijke stand: meer keer 5 punten wint, dan 4, enz.
- Belofte: de beste jonger dan 21 op de peildatum. Het reglement legt die leeftijd niet vast; de
  federatie stelt ze per ronde in.

Regels: `src/lib/referendum.ts`. "Gespeeld" = bevestigd door de scheidsrechter; voor wedstrijden
zonder bevestiging telt een wedstrijd waarin de speler een worp had.

## 8. Reglement en regels — federatie

`/federatie/reglement`: het reglement is heilig.
- **Reglement:** nieuwe versie als concept, daarna "laten gelden" (de vorige gaat naar het archief).
  `/reglement` toont altijd de geldende versie.
- **Verslagen:** kleine wijzigingen, vastgehangen aan een reglementversie; toevoegen, bewerken,
  intrekken of verwijderen.
- **Regels als bouwstenen**, elk met hun bron (reglement of verslag):
  - *Vastspelen*: na X keer hoger spelen zit een speler vast in die reeks. Speler, club en coach zien
    de teller (🎟️ 2/3), de selectie blokkeert hem in een lagere ploeg.
  - *Eindronde*: zodra de gekozen reeksen uitgespeeld zijn, maakt het systeem zelf de eindronde aan
    met kalender (`/eindronde/[id]`); de federatie krijgt een melding en kan verplaatsen.

Details en aannames: [REGELS-CONFORMITEIT.md §6](REGELS-CONFORMITEIT.md).

## 9. E-mail, login en medische kaart

- Elk lid vanaf 13 jaar (instelbaar) heeft een e-mailadres. Na goedkeuring krijgt het een eigen login.
- Het lid vraagt zijn medische kaart aan vanuit *Mijn profiel*; de club kan het ook voor het lid doen.
  De aanvraag gaat naar de federatie (`/beheer/leden`); de andere partij krijgt een melding (🔔).

### Ouders van jeugdspelers

- De club vult bij een jeugdspeler het **e-mailadres van een ouder** in (`/club/leden`). Dat account
  krijgt het kind meteen (niet pas na goedkeuring); bestaat het nog niet, dan wordt het aangemaakt en
  krijgt de ouder een uitnodiging (of geeft de clubbeheerder de link door: knop "👪 ouder").
- Op *Mijn profiel* ziet de ouder het **dossier van het kind**: status, keuring, aanvragen. Hij vraagt er de
  medische kaart aan en **voert de keuring in** (datum + ingevuld attest). De club krijgt telkens een melding
  om na te kijken en in te dienen.
- Verandert de club het adres, dan ziet de vorige ouder het dossier niet meer. Een ouder kan zichzelf
  niet aan een kind koppelen: enkel de club (via het adres) of de federatie (`Users.kinderen`).
- Code: `src/lib/ouders.ts`, `src/lib/medische-kaart.ts` (`keuringInvoeren`), `/api/medische-kaart/keuring`.
