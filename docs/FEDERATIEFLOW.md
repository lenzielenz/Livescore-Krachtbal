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
3. Federatie, `/beheer/leden` → *Registraties & kaarten*: de wachtrij met attest, vergunningsnummer,
   goedkeuren (ook alles tegelijk) of afkeuren met een reden. Ook op het bord.

Regels (`src/lib/registratie.ts`): een keuring is 365 dagen geldig; terwijl de federatie beslist
ligt het lid vast; na goedkeuring wijzigt enkel de federatie naam, geboortedatum en geslacht. Het
attest zien enkel de federatie, de staf van de eigen club en het lid (of de ouder).

### Het ledenregister (federatie)

`/beheer/leden` is gebouwd voor duizenden leden bij honderden clubs: niets laadt "alles" in de browser.
- **Tellingen** bovenaan: leden, mag spelen, wacht, aan te vullen, afgekeurd, keuring verloopt (≤ 30 dagen),
  verlopen, geen keuringsdatum. Een klik opent die leden in het register.
- **Per club**: wie het meeste werk heeft bovenaan; elk getal opent die leden; *Herinneren* stuurt de staf
  van de club de lijst van wat niet in orde is (met de datum van de vorige herinnering).
- **Ledenregister**: zoeken (naam, vergunningsnummer, e-mail), filteren op club, toestand, keuring,
  categorie en geslacht, sorteren, bladeren per 50 en exporteren als CSV (Excel). Elk filter staat in de
  URL: terug-knop en een gedeelde link werken.
- **Dossier per lid** (`/beheer/leden/[id]`): gegevens, registratie en vergunning, keuring met het attest,
  medische kaart, ongevallen, uitleningen, sancties, en de acties van de federatie (goed-/afkeuren,
  vergunning, attest, doktersverbod). Een keuring die de club na de goedkeuring vernieuwde, staat
  gemarkeerd om het nieuwe attest na te kijken.

**Verlopen keuring.** In de instellingen kiest de federatie: *waarschuwen* (standaard, de speler mag nog
spelen, de opstelling toont het) of *blokkeren*. De pagina toont hoeveel spelers blokkeren zou raken. Zonder
keuringsdatum (oudere leden) blokkeert niets; die staan apart in het register. Elke ochtend krijgt de staf
van elke club één lijst per week met (bijna) verlopen keuringen, en het lid of de ouder één melding per
keuring. Op `/club/leden` filtert de club op *keuring (bijna) verlopen*.

Gemeten op Postgres met 5000 leden in 200 clubs: alle tellingen ±0,3 s, een registerpagina of filter
10–30 ms, een export van alle leden ±0,3 s. Code: `src/lib/leden-register.ts` (de regels, ook als
databankfilter; `tests/int/leden-register.int.spec.ts` bewaakt dat beide hetzelfde zeggen) en
`src/lib/leden-register-server.ts`.

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
  club) in het rood; "Vul automatisch" verdeelt eerlijk. Elke scheidsrechter krijgt een melding (🔔 en push),
  en wie een wedstrijd kwijtraakt aan een collega ook — anders rijdt hij voor niets naar het terrein.
  Een nieuwe scheidsrechter voeg je toe met **Snel doen → Scheidsrechter toevoegen** (met e-mailadres
  meteen een login en een uitnodigingslink).
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
   de officials volledig zijn en "wie speelde" bevestigd is. Daarna is het blad onwijzigbaar. Na de laatste
   handtekening dient het systeem zelf in.
8. **Iedereen krijgt het blad** (vroeger: de bezoekende kapitein een exemplaar, de thuisploeg een, de
   scheidsrechter het blad voor de federatie — RCVK item 23). De PDF wordt bewaard bij het blad
   (`matchsheets.pdf`, onwijzigbaar) en een melding met de link gaat naar: de staf van beide clubs, de
   federatie, de scheidsrechter(s), beide kapiteins (en hun ouders bij de jeugd) en de coaches van beide
   ploegen. Code: `src/lib/submit/index.ts` (`bladOntvangers`).

### Voorbehoud en uitsluiting (RCVK items 25, 27)

De kapitein (U12–U16: de coach) vraagt de scheidsrechter voorbehoud aan te tekenen. De scheidsrechter
noteert het op `/scheidsrechter/[id]` (blok *Voorbehoud en uitsluiting*): voor welke ploeg, wie het vraagt,
**waarover** (dat bepaalt het comité, item 25.3: inrichting, tijdopnemer, officials, leeftijd, aantekenblad of
identiteit → *sportcomité*; doelpunt, scheidsrechter afwezig of te laat, spelregels, speelduur door de
scheidsrechter → *scheidsrechterscomité*), een kort relaas, de stand en de speeltijd. Ook een **uitsluiting** komt hier (speler, reden, stand,
speeltijd). Een verkeerde regel schrappen kan tot de scheidsrechter aftekent; daarna ligt alles vast.

Na het indienen wordt **elk voorbehoud een dossier** bij de club van die ploeg, te bekrachtigen **binnen 5
werkdagen** (zaterdag, zondag en de wettelijke feestdagen tellen niet; op de laatste dag komt een herinnering). De club krijgt een melding
en antwoordt onder het blad (`/aftekenen/[id]`):
- **Bekrachtigen** met een uitgebreid relaas → het dossier gaat naar de federatie (het bord), die beslist
  zoals bij een klacht (blad heropenen of afwijzen, met toelichting).
- **Afzien** → klaar, geen kosten.
- **Niets doen** → na de termijn vervalt het voorbehoud en stelt het systeem de **75 euro administratieve
  kosten** voor (boetelijst, aanleiding *Voorbehoud niet bekrachtigd*).

Op het bord staat zo'n dossier bij *Wacht op anderen* (de club), met de termijn en het comité. Code: `src/lib/voorbehoud.ts`.

### Scheidsrechtersrapport (RCVK item 27)

Bij een voorbehoud, een uitsluiting of een wedstrijd die niet gespeeld kon worden (forfait ter plaatse) is
een rapport **verplicht**; het platform leest dat van het blad. Voor een andere onregelmatigheid vinkt de
scheidsrechter *zie scheidsrechtersrapport* aan (vóór zijn handtekening). Het blad en de PDF vermelden dan
*Zie scheidsrechtersrapport*.

De scheidsrechter maakt het rapport op `/scheidsrechter/[id]` (blok *Scheidsrechtersrapport*): waarover, het
relaas, tot 5 bijlagen (foto of PDF) en zijn naam als handtekening. Daarna verandert het niet meer; een
aanvulling is een nieuw rapport. Het gaat naar het **comité op het bord** (*Rapport lezen* opent de PDF,
*Afhandelen* met een besluit; de scheidsrechter krijgt het besluit). Enkel het comité en de scheidsrechter
lezen het rapport en de bijlagen. Is er een werkdag na het indienen nog geen rapport, dan krijgt de
scheidsrechter een herinnering; na drie werkdagen ook de federatie. Code: `src/lib/sr-rapport.ts`.

### Forfait (RCVK item 34)

Een club meldt een forfait **vooraf** op de wedstrijdpagina (*Planning → Forfait melden*): welke ploeg, en
waarom. Dat kan de staf of de coach van die ploeg, of de federatie. Meteen:
- staat het forfait op het blad en de uitslag in de stand (de andere ploeg wint, `forfaitScore`);
- horen het de tegenpartij, de scheidsrechter (*je hoeft niet te komen*), de spelers op de selectie en de federatie;
- volgt het **boetevoorstel**, volgens het **moment**: vóór vrijdag 12u van het speelweekend is *tijdig*,
  daarna *laat* (midweekwedstrijd: 24 uur vóór de aftrap). Stelt de scheidsrechter ter plaatse vast dat een
  ploeg er niet is, dan is het moment *ter plaatse*. De federatie maakt per moment een boetesoort (bv. 25 /
  50 / 75 euro); elk forfait krijgt precies één voorstel.

"Een forfait vervalt [...] als de match verplaatst wordt": verplaatst de federatie de wedstrijd (los, een
heel weekend of via een goedgekeurde aanvraag), dan vervalt een **vooraf gemeld** forfait — de wedstrijd
staat weer gepland en het boetevoorstel wordt geschrapt. Code: `src/lib/forfait.ts`.

### Uitlenen van een jeugdspeler (RCVK item 45)

Een jeugdspeler (t/m U18) kan voor één competitie bij een jeugdploeg van een andere club spelen. Op
`/club/uitleningen` (*Mijn club → Uitleningen jeugd*):
1. De **uitlenende club** kiest de speler en de ploeg, vult het adres in en tekent met haar naam. Naam,
   geboortedatum, leeftijd, categorie en de competitie (reeks + seizoen) komen in de overeenkomst.
2. De **ontvangende club** krijgt een melding, leest de overeenkomst (PDF) en tekent.
3. De **federatie** bevestigt of weigert (met reden) op het bord.

Pas na de bevestiging staat de speler op de selectielijst van die ploeg, met *uitgeleend door …*. Hij blijft
lid van zijn club; zijn ploeg verandert niet. Beide clubs, de speler (of zijn ouders) en de federatie
krijgen de overeenkomst. Intrekken kan een club zolang de federatie niet bevestigde; daarna beëindigt enkel
de federatie een uitlening. Wacht een overeenkomst drie dagen op de handtekening van de ontvangende club,
dan krijgt die een herinnering. Een speler of ploeg met een overeenkomst kan niet verwijderd worden. Code:
`src/lib/uitlening.ts`.

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
met een opmerking; de cijfers staan in de statistieken (per maand, categorie en club). De formulieren
horen **binnen de acht dagen** na het ongeval bij de federatie (RCVK item 41); op dag 6 krijgen de speler (of
ouder) en de club een herinnering. Op het bord staat die
termijn bij het dossier zolang de speler de documenten nog moet bezorgen.
Code: `src/lib/blessure.ts`, `src/lib/ongeval-dossier.ts`.

### Boetes en scheidsrechterskosten

Het reglement in dit project bevat geen bedragen: de federatie zet de **boetelijst** op (beheerpaneel →
Federatie → Boetelijst: omschrijving, artikel, bedrag, en of het systeem ze voorstelt bij een forfait
(per moment: tijdig, laat, ter plaatse), een wedstrijdblad dat na X dagen niet ingediend is, een aftrap
die een club zelf later zette wegens file of ziekte, een voorbehoud dat niet bekrachtigd werd (item 25), of
een goedgekeurde verplaatsing (administratieve kost, item 33)). Elke soort heeft een **doelgroep** (alle,
senioren, jeugd): zo kost een verplaatsing 20 euro bij de senioren en 10 bij de jeugd. Het systeem maakt **voorstellen**; de federatie legt op (bedrag aanpasbaar) of schrapt
op `/beheer/boetes`, of legt manueel een boete op. Pas een opgelegde boete ziet de club op
`/club/boetes`: daar meldt ze *Betaald* of *betwist* met uitleg; de federatie bevestigt, handhaaft of
vernietigt. In de instellingen kiest de federatie wie de **scheidsrechterskosten** draagt (federatie,
thuisclub of gedeeld; bij forfait de ploeg die forfait gaf); de club ziet per wedstrijd wat ze verschuldigd
is (€13 + km-vergoeding, zoals op de kwitantie). Code: `src/lib/boetes.ts`.

### Termijnen en herinneringen

Elke ochtend loopt `/api/cron/recap` (GitHub-workflow *Dagelijks onderhoud*, `lib/termijnen.ts`): het maakt de
boetevoorstellen (ook als niemand `/beheer/boetes` opent) en stuurt **één** herinnering per termijn naar wie
aan zet is: de club op de laatste dag om een voorbehoud te bekrachtigen, de speler en de club op dag 6 van
de 8 voor een ongevalsaangifte, de scheidsrechter na 1 werkdag zonder rapport (en de federatie na 3), en de
ontvangende club na 3 dagen zonder handtekening onder een uitlening.

## 6. Dashboard en werkplatform — federatie

Wie federatie of admin is, werkt in een **werkplatform**: een vaste zijbalk met alle tools in groepen
(Competitie, Wedstrijddag, Tucht & geld, Clubs & leden, Seizoen, Systeem), een topbalk met kruimel,
zoeken (**Ctrl+K**: typ "boete", "kaart" of "weekend" en spring naar het juiste scherm), meldingen en
het accountmenu, en daarnaast de pagina zelf. Naast een menu-item staat hoeveel er nog open staat
(klachten, boetes, te keuren leden…); groepen met openstaand werk en de groep van je huidige scherm
staan open, de rest klapt in (en dat onthoudt de browser). Op een smal scherm schuift de zijbalk uit.

`/federatie` is het **dashboard**: kerncijfers (open, dringend, deze week, wedstrijden vandaag), de
takenlijst — dringendste eerst, met per taak de knop om het meteen op te lossen (aanvragen,
wedstrijden zonder scheidsrechter, opstellingen binnen 48 uur, bladen niet ingediend, wedstrijden die
te lang live staan, clubs zonder login) —, het bord in cijfers met wat bij jou ligt, de wedstrijden
van vandaag en de aantekenmodus.

**Snel doen** (de knop **+** in de topbalk, op elke pagina): scheidsrechter toevoegen (dossier, en met
e-mailadres meteen een login met uitnodigingslink, zoals bij een clubbeheerder), een taak op het bord
zetten, een bericht aan alle clubs / scheidsrechters / coaches / de federatie (melding + push), en de
sprongen naar club aanmaken, wedstrijd verplaatsen en leden keuren. Code: `components/fed-shell/SnelMenu.tsx`,
`/api/federatie/scheidsrechters`, `/api/federatie/bericht`.

### Het bord: aanvragen & taken

`/federatie/aanvragen` toont **alles wat binnenkomt** op één bord, in vier kolommen: *Nieuw* (nog
niemand mee bezig), *In behandeling* (een collega werkt eraan), *Wacht op anderen* (de bal ligt bij een
club, speler, scheidsrechter of extern) en *Afgehandeld* (laatste 14 dagen). Erop staan
verplaatsingsaanvragen, registraties, klachten, boetes (voorstel, betwist, betaling gemeld),
ongevalsdossiers, medische kaarten, afgelastingen, inschrijvingen, scheidsrechtersrapporten, uitleningen
van jeugdspelers — en **vrije taken** die de federatie
zelf aanmaakt ("verzekeringspolis vernieuwen").

- **Slepen** = oppakken (naar *In behandeling*: jij wordt behandelaar), doorgeven (de behandelaar
  kiezen in het paneel: de collega krijgt een melding met de link), op wacht zetten (naar *Wacht op
  anderen*: op wie?) of loslaten (naar *Nieuw*).
- **Beslissen** gebeurt met de knoppen op de kaart: goedkeuren, afwijzen, opleggen, afhandelen… —
  dezelfde functies als het werkscherm van die soort, dus met dezelfde meldingen en regels. Daarom kan
  je een aanvraag **niet** naar *Afgehandeld* slepen: afgehandeld is wat de aanvraag zelf zegt.
- Per kaart: behandelaar, op wie we wachten (en waarop), deadline (te laat = rood, bovenaan), notities
  voor je collega's, en een link naar het werkscherm.
- Filters: soort, "mijn dossiers", zoeken. `?dossier=klacht:12` opent een kaart meteen (zo verwijzen de
  meldingen ernaar). In de zijbalk staat als teller wat er *nieuw* is.

Waar de staat zit, en waarom zo:

| | Waar | |
|---|---|---|
| Status van de aanvraag (open, goedgekeurd, betaald, …) | de collection van die soort | **enige bron**; het bord leest ze |
| Behandelaar, wacht op, deadline, notities | `dossiers` (`collections/Dossiers.ts`), één rij per aanvraag, pas aangemaakt bij de eerste handeling | een laag erover, nooit een tweede status |
| Vrije taak | `dossiers` met `bron: 'taak'`, eigen `afgerondOp` | bestaat enkel hier |

Code: `src/lib/aanvragen-bord.ts` (puur: kolom, knoppen, sorteren, filteren — getest),
`src/lib/federatie-aanvragen.ts` (de lijst uit alle bronnen + de knoppen uitvoeren),
`src/lib/dossiers.ts` (de laag), `/api/federatie/aanvragen`, `/api/federatie/dossiers`,
`src/app/(frontend)/federatie/aanvragen/`. **Een nieuwe soort aanvraag** voeg je toe in
`aanvragen-bord.ts` (`Bron`, `BRON_META`, `actiesVoor`) en `federatie-aanvragen.ts` (lezen + uitvoeren),
en aan de enum in `collections/Dossiers.ts` (met migratie). Wat er nog ontbreekt tegenover andere
federaties: [FEDERATIE-ROADMAP.md](FEDERATIE-ROADMAP.md).

Wie het platform krijgt, en wie niet:

| Wie | Krijgt de zijbalk? |
|---|---|
| Federatie, admin | Ja — op `/federatie`, `/beheer/*`, `/wedstrijdbladen`, `/ongevallen`, `/knipjes`, `/bekerfinale` |
| Club, coach, scheidsrechter, speler, supporter, uitgelogd | Nee: elke pagina ziet er uit zoals voorheen |
| Federatie/admin in *Bekijk als supporter* (kijkmodus) | Nee: dan zie je de site zoals een vers lid |
| Clubluiken onder `/beheer` (`club-team`, `spelers`, `training`) | Nee, ook niet voor de federatie: dat zijn tools van een club of coach |

Code: `src/components/fed-shell/` (zijbalk, topbalk, zoekpalet, `FedShellGate` die per layout beslist
wie de shell krijgt) en `src/lib/federatie-nav.ts` (de indeling). **Een nieuwe federatietool** voeg je
toe aan `FED_NAV` — dan staat ze in de zijbalk én in Ctrl+K — en een test bewaakt dat elke tool uit
`lib/profiles.ts` er ook in staat. Heeft ze een openstaande-taak-teller nodig, laat dan de taak in
`lib/federatie-dashboard.ts` naar dezelfde `href` verwijzen. De tellers komen van
`/api/federatie/taken`. De pagina's zelf blijven ongewijzigd: de gewone `SiteHeader` trekt zich terug
zodra de shell er staat (`components/fed-shell/context.ts`). Draait de federatie daardoor ergens
nieuw, voeg dan in die luik-map een `layout.tsx` toe met `<FedShellGate>` én een `loading.tsx`
(`export { default } from '../loading'`): zonder dat laatste toont een harde laadbeurt eerst de oude
header-layout en springt de zijbalk er pas in als de pagina klaar is. Een test bewaakt dit.

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

### Medische kaart met QR-code

- De kaart is een PDF (één A4 per lid): gegevens van het lid, het deel van de arts (geschikt / niet
  geschikt / onder voorwaarde, datum, stempel en handtekening) en rechtsboven een **QR-code** met de code
  ook leesbaar eronder (bv. `KYA-RWAXQPCD`). De QR bevat enkel een ondertekende code (dossiernummer +
  handtekening met het server-geheim): geen naam, niet te raden of te vervalsen.
- **Afdrukken**: de federatie (per aanvraag of alle open aanvragen in één PDF, en in het dossier), de club
  voor de eigen leden, het lid of de ouder zodra de federatie de aanvraag *verstuurd* zette
  (`/api/medische-kaart/pdf?ids=…`).
- **Opladen**: wie een foto of scan van de ingevulde kaart oplaadt, hoeft niet te zeggen van wie ze is —
  het systeem leest de QR. Een stapel tegelijk via `/medische-kaart/opladen` (club of federatie, optioneel
  één keuringsdatum voor allemaal); de QR scannen met de gsm opent `/k/<code>` met meteen de camera
  (enkel voor het lid, een ouder, de club of de federatie; anderen zien niets over het lid).
- **Controle**: elke upload van een attest (ook bij het lid zelf, in `/club/leden` of *Mijn profiel*)
  leest de QR. Een kaart van een ánder lid wordt geweigerd; een foto zonder leesbare QR blijft gewoon
  mogelijk bij het gekozen lid. In het dossier staat "herkend via QR".
- Code: `src/lib/medische-kaart-code.ts` (code), `medische-kaart-scan.ts` (QR lezen uit foto of PDF:
  sharp + jsQR), `medische-kaart-server.ts` (wie mag wat, opladen), `submit/pdf-medische-kaart.ts`.
  Tests: `tests/unit/medische-kaart-qr.unit.spec.ts`, `tests/int/medische-kaart-qr.int.spec.ts`.

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
