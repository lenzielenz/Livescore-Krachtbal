# Federatie — wat er nog ontbreekt

Vergelijking (november 2026) van wat dit platform de federatie biedt met wat sportfederaties
elders doen en wat Vlaanderen van een erkende federatie verwacht. Bronnen: de verplichtingen uit het
decreet van 10 juni 2016 (erkenning en subsidiëring van de georganiseerde sportsector) en het decreet
van 15 maart 2024 over een veilig sportklimaat, de handleiding *Goed bestuur* van Sport Vlaanderen,
en de modules van federatiesoftware (Profixio, Analyticom, Spordle, SportLoMo, Playbook, Sportlink,
Twizzit, TidyHQ). De vergelijking is bedoeld als keuzelijst, niet als belofte.

## Wat er al is

Clubs en logins, ledenregistratie met medische keuring en vergunning, medische kaarten, inschrijving
van ploegen, seizoenskalender en planner, verplaatsingen, scheidsrechters toewijzen (met toevoegen
in één klik), wedstrijddag van selectie tot ingediend blad, afgelastingen, blessures en
ongevalsdossiers, boetes en scheidsrechterskosten, klachten over bladen, knipjes en schorsingen,
reglement met versies en regels, referendum, bekerfinale, statistieken, nieuws, meldingen en push,
berichten aan groepen, en sinds november 2026 het **bord** (`/federatie/aanvragen`): alles wat
binnenkomt op één plek, oppakken, doorgeven aan een collega, op wacht zetten, notities, vrije taken.

## Wat ontbreekt, in volgorde van nut

| # | Wat | Waarom | Grootte |
|---|---|---|---|
| 1 | **Transfers / clubwissel** | Elke federatie regelt hoe een speler van club verandert: aanvraag, akkoord van de oude club, transferperiode, bevestiging door de federatie, en pas dan speelgerechtigd bij de nieuwe. Nu moet dat via het beheerpaneel. | middel |
| 2 | **Beschikbaarheid en licentie van scheidsrechters** | Een scheidsrechter geeft op wanneer hij niet kan; "Vul automatisch" houdt er rekening mee. Licentie of bijscholing met geldigheidsdatum, zodat wie niet in orde is niet toegewezen wordt. | middel |
| 3 | **Meldpunt / aanspreekpunt integriteit (API)** | Verplicht sinds het decreet veilig sportklimaat (2024): elke erkende federatie heeft een aanspreekpunt en een kanaal voor meldingen van grensoverschrijdend gedrag. Vertrouwelijk, enkel de API leest het; past in de dossierlaag van het bord maar met strikte toegang. | middel; GDPR-gevoelig |
| 4 | **Bestuur: vergaderingen, besluiten en documenten** | Goed bestuur (Sport Vlaanderen) vraagt een spoor van beslissingen: agenda, verslag, besluiten met datum, statuten, verzekeringspolis, beleidsplan. Nu bestaan enkel de reglementsverslagen. | klein–middel |
| 5 | ~~**Lidgeld en facturatie per club**~~ | **Gebouwd (november 2026)**: facturen met gestructureerde mededeling, bankafschrift-import, online betalen (Mollie), betaal-QR, boekhoudexport — zie FEDERATIEFLOW "Facturen en betalingen". Nog open: Peppol, export in het formaat van een boekhoudpakket. | — |
| 6 | **Opleidingen en bijscholingen** | Cursussen voor scheidsrechters, trainers en tafelmensen: inschrijven, aanwezigheid, attest. Koppelt aan punt 2. | middel |
| 7 | **Jaarrapport voor Sport Vlaanderen** | Ledenaantallen per leeftijd, geslacht en club, ongevallen, scheidsrechters — de statistieken bestaan al; een export in het formaat van de subsidieaanvraag ontbreekt. | klein |
| 8 | **Vrijwilligers en functies op de wedstrijddag** | Wie doet tafel, kantine, veld op welke dag; herinneringen. De clubfuncties bestaan; een rooster per speeldag niet. | middel |
| 9 | **Evaluatie van scheidsrechters** | Kort verslag van club of waarnemer na een wedstrijd; gemiddelde per scheidsrechter. | klein |
| 10 | **Archief per seizoen** | Seizoen afsluiten: klassementen, bladen en boetes bevriezen, nieuw seizoen openen met de inschrijvingsronde. | middel |

## Gedaan in november 2026 (de keten)

- **Forfait melden door de club** (item 34), met boete volgens het moment (tijdig / laat / ter plaatse) en
  vervallen bij een verplaatsing — naar het voorbeeld van de KBVB, waar clubs digitaal forfait verklaren en
  alle partijen automatisch verwittigd worden.
- **Voorbehoud en uitsluiting op het blad** (items 25, 27), met bekrachtigen binnen 5 werkdagen of afzien, en
  het voorstel van 75 euro als niemand reageert.
- **Administratieve kost bij een verplaatsing** (item 33), per doelgroep (senioren / jeugd).
- **Het ondertekende blad naar iedereen** (item 23): ook de scheidsrechter, de kapiteins en de coaches.
- **Termijn van 8 dagen voor ongevallen** (item 41) op het bord.
- **Integratietests in CI**, met een ketentest van eerste lid tot boete.
- **Scheidsrechtersrapport** (item 27): verplicht na voorbehoud, uitsluiting of forfait ter plaatse; ondertekend,
  met bijlagen, naar het comité op het bord; *zie scheidsrechtersrapport* op het blad.
- **Uitlenen van jeugdspelers** (item 45): overeenkomst getekend door beide clubs, bevestigd door de federatie,
  pas dan op de selectielijst; de PDF voor iedereen.
- **Voorbehoud per comité** (item 25.3): het onderwerp bepaalt sportcomité of scheidsrechterscomité.
- **Termijnen in werkdagen met de wettelijke feestdagen**, en **herinneringen** (voorbehoud, ongeval, rapport,
  uitlening) elke ochtend, één keer per termijn; de boetevoorstellen lopen voortaan ook dagelijks.

## Wat bewust niet

- Een eigen boekhouding: exporteren naar het pakket van de boekhouder is genoeg.
- Een eigen mailplatform: meldingen + push, en voor massamail een nieuwsbrief-dienst.
- Antidoping-administratie: ligt bij NADO Vlaanderen; de federatie heeft enkel een contactpersoon.
