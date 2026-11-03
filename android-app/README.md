# Krachtbal Aantekenaar en Krachtbal Federatie (Android)

Native Android-apps voor het Krachtbal Live-platform (`livescore.roodgries.be` / krachtbal.live), uit **één codebasis**
(productvarianten in `app/build.gradle.kts`):

| App | `applicationId` | Waarvoor |
| --- | --- | --- |
| **Krachtbal Aantekenaar** (`aantekenaar`) | `be.krachtbal.aantekenaar` | De tafel: **wedstrijd kiezen → klok starten → score, kruisjes, time-outs, rust en einde invullen.** Dezelfde snelscore-modus als `/scorekeeper/[id]` op de website. |
| **Krachtbal Federatie** (`federatie`) | `be.krachtbal.federatie` | De **hele wedstrijddag** van de federatieflow (`docs/FEDERATIEFLOW.md` §5): selectie, controle en vrijgave, aantekenen, wissels, aftekenen en indienen. Begint op de demoruimte en is bedoeld als officieel pakket. |

Beide praten met dezelfde API als de website: er is geen aparte backend en niets te deployen. Ze staan naast elkaar op één toestel.

## Installeren

0. **Het makkelijkst: van de website.** Open `https://livescore.roodgries.be/app` (of het adres van de demo, `/app`) op de telefoon
   en tik op *Download voor Android*. Zie `docs/APP-DOWNLOAD.md` voor hoe een nieuwe versie daar komt.
1. Of zet het APK-bestand uit `app-downloads/` (één map hoger) op de telefoon (kabel, Drive, mail).
2. Open het bestand en sta "installeren van onbekende bronnen" toe voor die app (bv. Bestanden).
3. Open de app. *Aantekenaar*: log in met je gewone account van de site. *Federatie*: kies een rol in de demo (zie hieronder) of log in met je account.

Minimaal Android 8.0. Een update installeren over een oudere versie behoudt je login, op voorwaarde
dat ze met dezelfde sleutel ondertekend is (zie *Sleutel* hieronder).

## Krachtbal Federatie: de wedstrijddag

De app opent op de **demoruimte** (`https://krachtbal-demo-production.up.railway.app`, `DEFAULT_SERVER` in `build.gradle.kts`).
Bovenaan het inlogscherm kies je **"Kijk als …"** (coach, scheidsrechter, tafel, clubbeheerder, federatie): zonder wachtwoord, via
`POST /api/demoruimte/als`. Vraagt de demo een toegangscode (`DEMO_TOEGANGSCODE` in Railway), vul die dan eerst in.

Een wedstrijd uit de lijst opent de **hub**: alle stappen met live status en wie aan zet is (ververst elke 10 s). Elke stap opent zijn scherm:

| Stap | Wie | Wat de app doet |
| --- | --- | --- |
| Selectie | coach (en scheidsrechter) | Spelers kiezen (3–8), rugnummer op dít blad, kapitein, ⭐ favoriet, "onthoud als vaste opstelling". Blokkades uit het reglement (geen vergunning, keuring, knipjes) zijn rood en niet te kiezen. Bevestigen kan pas met een kapitein. |
| Spelers controleren | scheidsrechter | Per speler of per ploeg "gecontroleerd"; wie niet mag spelen staat rood, met een knop om de selectie aan te passen. |
| Materiële keuring | scheidsrechter | OK / NIET OK / n.v.t. per punt, bevestigen. Een punt dat niet in orde is, gaat meteen als melding naar de thuisclub en de federatie. |
| Officials | scheidsrechter | Naam én voornaam per functie, verplicht volgens het reekstype (`fed/Officials.kt` = `src/lib/officials-rules.ts`). |
| Vrijgeven | scheidsrechter / federatie | Met de persoonlijke code, de vrijgavecode of de QR-tekst van de scheidsrechter; de federatie hoeft geen code. |
| Aantekenen | tafel | Het bestaande aantekenscherm, nu met **veldspelers en wissels** (zie hieronder). |
| Wie speelde | scheidsrechter | **Automatisch berekend** uit de veldspelers en wissels; bevestigen met één tik (ook vanuit het aftekenscherm). |
| Aftekenen | beide kapiteins + scheidsrechter | Handtekening met de vinger (PNG). Na de laatste handtekening dient de server het blad zelf in. |
| Meer | scheidsrechter | Aftrap verschuiven, blessure doorgeven, wedstrijd afgelasten (met foto's, verkleind tot 1600 px). |

**Veldspelers en wissels.** Een krachtbalploeg heeft er 4 op het veld; de rest van de selectie zijn wissels. Op het
aantekenscherm staat per ploeg `⇄ Wissel · veld 👑1 2 3 4`: tik een veldspeler én een bankspeler, ze wisselen meteen
(de keuze blijft open voor de volgende wissel; vóór de aftrap kies je zo wie start). **Enkel de 4 op het veld verschijnen
bij "Wie scoorde?"**, met volledige naam. Een wissel is een gewone actie in de wachtrij (`setlineup`): ze werkt dus ook offline
en wordt niet dubbel geteld. Tijdens een lopende wedstrijd legt de app eerst de huidige opstelling vast, want de server logt
een wissel pas op het blad (reglement §9) als hij de vorige opstelling kende. Wie speelde = wie op het einde op het veld
staat plus iedereen die eruit gewisseld werd (`data/Field.kt`, `fed/Played.kt`).

**Wat de server beslist.** De app toont en stuurt; de server bewaakt de volgorde en de rechten en geeft zijn Nederlandse
foutmelding terug, die de app ongewijzigd toont (bv. "Geen geldige QR of code."). De server hoefde niet te veranderen:
schrijven gaat via de bestaande `/api/matchsheet/{id}/…`-routes, lezen via Payload-REST (`select` laat de grote
handtekening-afbeeldingen weg: 2,5 KB per blad). Een coach mag het blad niet lezen (403) en volgt de stand via zijn selectie.

**Nog niet in de app:** de persoonlijke QR van de scheidsrechter scannen of tonen (de code intikken kan; de QR en code
worden op de server uit een geheim berekend en staan enkel op de website), forfait en vergoedingen, het noodblad, en de
pdf van het blad openen.

## Gebruik

* **Lijst**: tabs *Live / Vandaag / Komend / Afgelopen*, met dezelfde zoek- en filterfuncties als de startpagina van de site
  (zie *Zoeken, Thuis/Uit en reeksen* hieronder).
* **Klok**: tik op de grote klok = starten, pauzeren, verder. `− 1 min` / `+ 1 min` om bij te stellen.
  Een echte wedstrijd start pas 30 minuten vóór het geplande uur (regel van de server).
* **+1 nekworp / +2 rugworp** per ploeg, `↩` neemt het laatste doelpunt van díe ploeg terug.
* **Kruisjes, time-outs** (max. 2 per helft) en **scheidsrechter-minuut**: doeltijd schuift mee op.
* **Einde 1e helft** (onderbalk) → rust; tik daarna zelf op de klok voor de 2e helft.
  **Einde wedstrijd**, **heropenen** en **terugzetten** vragen eerst bevestiging.
* In *federatiemodus* (instelling op de site) vraagt de app na elk doelpunt wie scoorde.

## Zoeken, Thuis/Uit en reeksen

De wedstrijdlijst werkt als de startpagina van de site (`live/LiveBoard.tsx`):

* **Zoeken** zoals mensen ze typen: `sint michiels` vindt *KBC St. Michiels B*, `baasro` vindt *'T Botterken Baasrode*, de
  volgorde van de woorden maakt niet uit, accenten en hoofdletters tellen niet. Gezocht wordt op ploegnaam, clubnaam en
  reeks (`data/TeamSearch.kt`, dezelfde regels als `src/lib/team-search.ts`: élk getypt woord moet het *begin* van een woord zijn).
  Vanaf 2 tekens zoekt de lijst over **het hele seizoen** (vanaf twee weken terug), niet enkel in het gekozen tabblad;
  de link *"Wanneer speelt … nog? Bekijk de hele agenda"* opent de volledige agenda op de site.
* **Sorteren**: *Reeks* (gegroepeerd per reeks, de koppen klappen in en uit en tonen het aantal en de live-wedstrijden),
  *Tijdstip* (per dag) en *Thuis/Uit*: per dag eerst de thuiswedstrijden van **de club van je account**, dan de uitwedstrijden,
  dan de rest, met een tagje "🏠 Thuis" / "✈ Uit" boven de kaart. *Thuis/Uit* en *Mijn club* verschijnen enkel als je account
  een club heeft; wie een club heeft start op *Thuis/Uit*, anders op *Reeks*. De laatste keuze wordt bewaard.
* **Filters** (🔎-knop, met een teller): snelfilters *Nu live* en *Mijn club*, en de lijst reeksen met aantallen
  (de leesbare namen uit `data/Reeksen.kt`, overgenomen van `src/lib/reeksen.ts`). *Wis filters* zet alles terug.

**Waarom de app niet `/api/live/search` gebruikt.** Dat endpoint van de site bouwt per zoekopdracht de volledige scorebordgegevens
van het hele seizoen op — prima voor één bezoeker, te zwaar voor een app die per toets zoekt. De app kiest zelf een kleine
kandidatenset (de clubs en reeksen waarvan de naam bij het getypte woord past, zie `data/SeasonSearch.kt`), vraagt enkel die
wedstrijden op via de gewone lijst-API van Payload (`homeTeam.club` / `awayTeam.club` / `reeks` / `title`), en zeeft het resultaat
daarna op het toestel met dezelfde regel als de site. De server mag dus ruimer antwoorden dan nodig, nooit krapper.
De club van je account komt uit het inlogantwoord (`user.club`) en wordt bij het openen van de lijst ververst (`/api/users/me`).

## Huisstijl: dezelfde als de website

De app gebruikt het ontwerpsysteem van de site, zodat alles herkenbaar blijft. Bron: `src/app/(frontend)/styles.css`
(`:root`) en `scorekeeper/[id]/simple-scorekeeper.css`; in de app staat alles op één plek in `ui/Theme.kt`.

| Onderdeel | Zoals op de site |
| --- | --- |
| Kleuren | Antraciet `#16181E` panelen op `#090A0C`, haarlijn `#2E333D`, ijsblauw accent `#6FB2FF`, groen `#0FE0A6` (ok/live-badge), koraalrood `#FF5D6C` (live-status), rood `#EF476F` (gevaar), geel `#F6C544` (waarschuwing) |
| Achtergrond | "Aurora" met ijsblauwe, groene en rode gloed; op de aantekentafel donkergroen met een gloed in de **clubkleur** van thuis (links) en uit (rechts) |
| Ploegkaart | Clubkleur als gloed, rand en 4 dp bovenrand; score in de clubkleur (lichter gemaakt als ze te donker is, zelfde regel als `readableOnDark` op de site) |
| Doelpunt | **+1** (nekworp) vol accentblauw met donkere tekst en groter; **+2** (rugworp) gedempt: accenttekst op lichte tint met haarlijn |
| Selectie | Pil; geselecteerd = vol ijsblauw met donkere vette tekst, anders paneel met haarlijn (tabs, keuzes). Spelerkeuze = groene kaarten met wit rugnummer-schijfje |
| Knoppen | Primair = blauw verloop; gewoon = paneel; gevaar = rode outline; "zacht" = gestippeld |
| Lettertypes | Inter (tekst en cijfers, tabulair) en Sora (titels en merknaam), meegeleverd onder de SIL Open Font License |
| Icoon | Het officiële icoon van de site (`public/icon-maskable-512.png`) |
| Clublogo's | De badge van de site (`TeamLogo`): witte ronde plaat, ring in de clubkleur, de zoom/verschuiving die de club instelde, en initialen als er geen logo is. Naast de klok met gloed in de clubkleur; in de wedstrijdlijst naast de ploegnamen |
| "Klaar" | Op een geplande wedstrijd: groen **✓ klaar — tik om te starten ▶** vanaf 30 min vóór de aftrap, daarvoor gedempt **🔒 starten kan vanaf 19:02** (enkel in supporters-modus; in de federatieflow hangt "klaar" ook van opstelling en scheidsrechter af en dat kent de lijst niet) |

**Hoe de logo's werken.** Dezelfde bron als de site: logo's van krachtbal.be lopen via `/api/clublogo` (een bewaarde kopie,
met terugval op het webarchief; zie `src/lib/logo-bron.ts`), eigen uploads via `/api/media/…`. De app bewaart elk logo ook op
het toestel (7 dagen vers; daarna eerst opnieuw proberen en bij falen het oude gebruiken), dus ze blijven er ook zonder
internet. Lukt een logo niet (of is het een SVG), dan staan de initialen in de badge. Zie `data/LogoSource.kt`, `data/Logos.kt`.

Ook de kleinste details volgen de site, bv. dat de klokrand blauw blijft zolang de klok loopt (rood pas als ze in
overtijd stilstaat). Wijzigt de site haar tokens, pas dan `ui/Theme.kt` aan.

## Instellingen en rechten

Via **⋮ → Instellingen** op de lijst, of **⋯ → ⚙ Instellingen** in een wedstrijd (de wedstrijd blijft
gewoon doorlopen onder het scherm).

| Instelling | Wat het doet |
| --- | --- |
| **Scherm altijd aan** | Nooit · *Tijdens aantekenen* (standaard) · Altijd in de app |
| **Schermstand** | Automatisch · Staand · Liggend (blijft bewaard) |
| **Wedstrijd in volledig scherm openen** | Systeembalken weg bij het openen van een wedstrijd |
| **Trillen bij elke tik** | Korte trilling zodra een tik geregistreerd en op het toestel bewaard is |
| **Wedstrijd actief houden (melding)** | Voorgrondmelding met stand en lopende klok; houdt de app en wachtrij levend |
| **Meldingen** (Android-recht) | Status + knop naar de Android-meldingsinstellingen |
| **Batterij: onbeperkt** (Android-recht) | Status + het Android-venster "Altijd op de achtergrond draaien?" |
| **Databesparing** (Android-recht) | Status + uitzondering vragen, zodat tikken ook op de achtergrond verstuurd worden |
| **Alle app-instellingen van Android** | Rechtstreeks naar de app-info van Android |

De rechten tonen de echte status en verversen zodra je terugkomt uit de Android-instellingen.
Aanbevolen voor een wedstrijddag: batterij op *onbeperkt*, meldingen toegestaan, trillen aan.

## Past op elk scherm

Het aantekenscherm vult altijd het volledige scherm, **zonder scrollen**; klok, beide ploegen, +1/+2,
kruisjes, time-outs, scheidsrechter-minuut en "Einde helft/wedstrijd" staan er tegelijk op.

* **Staand** (telefoon, tablet): kop · status · klok · twee ploegkaarten · onderbalk.
* **Liggend of breed**: thuis | klok + bediening | uit, zoals een scorebord.
* Cijfers en knoppen schalen mee met de beschikbare ruimte (grote telefoon of tablet = grote knoppen;
  kleine telefoon of liggend = compactere kop, +1/+2 naast elkaar).
* Zeldzame acties zitten in het **⋯-menu** onderaan: volledig scherm (systeembalken weg), veldscherm
  koppelen, "wedstrijd was nog niet bezig", wedstrijdpagina, blessure/aftekenen (federatie).

Getest op de emulator van 360×640 dp (kleine telefoon) tot 1280×800 dp (tablet), staand en liggend;
zie `ui/MatchScreen.kt` (`TallBoard`, `WideBoard`).

## Waarom dit stabieler en nauwkeuriger is dan de browser

| Probleem op de website | In de app |
| --- | --- |
| De klok rekent met de muurklok van de gsm tegenover die van de server; een gsm die 40 s voorloopt zet de wedstrijdtijd 40 s mis. | De klok is een anker op de **monotone** systeemklok (`elapsedRealtime`). Een verkeerde of bijgestelde gsm-klok doet niets, en ze loopt door als het toestel slaapt. |
| Een tik die pas seconden later aankomt, start/zet de klok van de kijkers te laat. | Bij het verzenden wordt de klokstand van dát moment meegestuurd (zie `Op.toBody`). Het verschil tussen servertijd en toesteltijd wordt gemeten (`ServerClock`). |
| Een browsertabblad wordt op de achtergrond bevroren of afgesloten. | Voorgrondservice met melding (stand + lopende klok) houdt de app en de wachtrij levend. |
| Een tik kan verloren gaan als de pagina herlaadt. | Elke tik gaat eerst naar **schijf**, daarna pas naar het scherm en het netwerk. Eén verzender in volgorde, met vaste `opId` zodat de server niets dubbel telt. Overleeft app-kill en herstart. |
| Een slapende gsm laat de livestream stil sterven. | SSE met waakhond (45 s stilte = herverbinden), backoff, en meteen herverbinden bij terugkerend netwerk. |

## Zuinig voor de server en de telefoon

De app belast het platform zo weinig mogelijk — dat telt op een drukke zaterdag, en een databank die even stokt mag niet
door de app nog verder overbelast raken (zie de storing van 30 oktober, `docs/` van de site):

| Wat | Hoe |
| --- | --- |
| Live-standen op de lijst | Via **één** gedeelde dagstream van de site (`/api/live/stream?date=…`, `data/LiveScores.kt`), dezelfde als het bord op de site, i.p.v. per lopende wedstrijd apart `/api/match/{id}/state` (tot 12 verzoeken met tientallen queries per keer laden of zoeken). De stream is enkel open terwijl de lijst zichtbaar is én er iets live in beeld staat; op de achtergrond sluit hij. De stand beweegt vanzelf mee. |
| Lijstverzoeken | `populate[teams][name]` en `[club]`: een rij bevat enkel de naam en club van de ploegen i.p.v. twee volledige ploegdocumenten — ruim **twee derde minder bytes**. Zoeken over het seizoen is één lichte vraag (geen scorebordopbouw, zie *Zoeken* hierboven). |
| Logo's | Eén ophaalronde per logo, ook als dezelfde club in tien rijen staat. Geheugencache op **bytes** (6 MB) en gedecodeerd tot 256 px (was tot 48 MB bij 512 px). |
| Herverbinden | Backoff 1 → 15 s met jitter evenredig aan de wachttijd, en pas terug naar 1 s nadat een verbinding minstens 20 s standhield: een server die wel verbindt en dan meteen weer afbreekt, wordt niet elke ~1,5 s bestookt, en honderden toestellen na een herstart verspreiden zich. |
| APK-grootte | R8 + resource-shrinking (`proguard-rules.pro`): **9,1 → 2,2 MB**. De regels voor kotlinx.serialization zijn essentieel: zonder ze faalt het decoderen van elk serverantwoord pas op de telefoon. Test na elke wijziging aan die regels of aan de bibliotheken een **release**-build (niet alleen debug) op een toestel: inloggen, lijst, zoeken, wedstrijd openen, doelpunt aantekenen. |

## Bouwen

Vereist Android Studio (SDK + JDK). Vanuit deze map:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
.\gradlew.bat :app:testFederatieDebugUnitTest :app:testAantekenaarDebugUnitTest   # 103 unit-tests per variant
.\gradlew.bat :app:assembleFederatieRelease :app:assembleAantekenaarRelease        # app/build/outputs/apk/<variant>/release/
```

De release-build is verkleind (R8); `app/build/outputs/mapping/release/mapping.txt` zet een verduisterde stacktrace
terug naar leesbare namen (bewaar hem per uitgebrachte versie als je ooit crashmeldingen verzamelt).

Toolchain = dezelfde als het project `krachtbalgame` (AGP 9.4.1, Kotlin 2.2.10, Compose BOM 2026.02.01,
Gradle 9.8.0). De `applicationId`s zijn `be.krachtbal.aantekenaar` en `be.krachtbal.federatie` — bewust niet
`be.krachtbal.live`, dat blijft gereserveerd voor de TWA uit `docs/ANDROID-PLAYSTORE.md`. Beide varianten delen de sleutel.

### Sleutel

`keystore/aantekenaar.jks` + `keystore.properties` ondertekenen de release. Ze staan **niet in git**
(zie `.gitignore`). **Bewaar ze in een wachtwoordmanager én in een back-up**: zonder deze sleutel kan
je de app niet meer bijwerken zonder ze eerst te verwijderen.

### Lokaal testen zonder productie aan te raken

**De volledige wedstrijddag (demoruimte).** Start de site in demo-modus met een eigen databank en zet de demowereld klaar:

```bash
PLATFORM_OMGEVING=demo NEXT_PUBLIC_PLATFORM_OMGEVING=demo DATABASE_URL=file:./demo-test.db pnpm dev
curl -X POST localhost:3000/api/demoruimte/klaarzetten      # ± 15–30 s; wist en vult de demodatabank
```

In de federatie-app: adres `http://10.0.2.2:3000`, kies een rol. Wedstrijd 43 is de hoofdwedstrijd (Sint-Michiels – Baasrode heren).
De vrijgavecode van de wedstrijd leest enkel de federatie (`select[vrijgaveCode]=true` op `/api/matchsheets`). Zet de demo na een
testronde terug met `klaarzetten`. **Druk nooit op klaarzetten op de echte demo** terwijl iemand ze gebruikt: het wist alles.

**Enkel de tafel (supportersmodus).**

```bash
# in de website-repo (één map hoger): lokale SQLite, aparte secret
printf 'DATABASE_URL=file:./local-test.db\nPAYLOAD_SECRET=%s\n' "$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" > .env
pnpm dev                                  # http://localhost:3000
pnpm seed                                 # twee ploegen + wedstrijd op "nu"
curl -X POST localhost:3000/api/users/first-register -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"Test1234!","passwordConfirm":"Test1234!","name":"Test"}'
```

In de app: *Geavanceerd (server)* → `http://10.0.2.2:3000` (emulator). Cleartext is enkel voor
`10.0.2.2`, `localhost` en `127.0.0.1` toegestaan (`network_security_config.xml`).

## Opbouw

```
data/Models.kt         spiegel van MatchState (src/lib/match-engine.ts)
data/LocalClock.kt     de monotone wedstrijdklok
data/ServerClock.kt    verschil servertijd ↔ toesteltijd
data/Op.kt             een aantekenactie + Overlay (optimistische weergave)
data/SessionStore.kt   wachtrij/klok/stand op schijf (atomair)
data/MatchSession.kt   verzender, livestream, hartslag, alle acties
data/Api.kt, Auth*.kt  HTTP, login (token 30 d, stil opnieuw inloggen)
data/TeamSearch.kt     zoeken zoals mensen typen (spiegel van src/lib/team-search.ts)
data/Reeksen.kt        reekscode → leesbare naam (spiegel van src/lib/reeksen.ts)
data/ListLogic.kt      filteren, sorteren en groeperen van de lijst (puur, getest)
data/SeasonSearch.kt   kandidaten voor "zoeken over het hele seizoen"
data/MatchListModel.kt toestand van de lijst (tabblad, filters, sortering, seizoenszoektocht)
data/Field.kt          veldspelers, bank, wissel en "wie speelde" uit de wissels (puur, getest)
data/DemoAccess.kt     toegangscode en sessie van de demoruimte
data/Me.kt             rollen en clubfuncties van het account
fed/                   de federatie-app: Sheet.kt (blad en selectie), Steps.kt (de stappen, puur), FedApi.kt/FedActions.kt (lezen en
                       schrijven), HubModel.kt + MatchDayScreen.kt (de hub), LineupScreen, RefereeScreen, Extras, SignOffScreens,
                       SignaturePad, Officials.kt, Played.kt
ui/                    Compose-schermen
service/MatchService   voorgrondservice
```

## Bewust niet in versie 1

* Het veldschema met worp-per-worp (analysewedstrijden) — dat blijft de website.
* Het wedstrijdblad als pdf bekijken, forfait en vergoedingen: dat blijft de website.

## Optionele verbetering aan de server (niet doorgevoerd)

Een doelpunt dat offline bewaard werd, krijgt zijn klokminuut van de server **begrensd door de
laatste klokwijziging** (`tikMoment` in `src/lib/simple-match-engine.ts`). Werd ook de *start* offline
getikt en komt die pas later aan, dan krijgen de doelpunten ertussen minuut 0. Laat `simplestart` en
`clock` in `src/app/api/match/[id]/action/route.ts` het meegestuurde `at` honoreren (begrensd op
[nu − 10 min, nu]); de app stuurt het al mee. Zonder die aanpassing werkt alles, enkel die ene
randgeval blijft ongeveer.
