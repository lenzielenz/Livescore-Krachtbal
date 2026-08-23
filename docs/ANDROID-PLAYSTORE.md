# Krachtbal Live in de Google Play Store

Deze app hoeft niet herschreven te worden voor Android. We publiceren de bestaande webapp als
**TWA** (Trusted Web Activity): een dunne Android-schil die Chrome gebruikt om precies deze site te
tonen — zonder browserbalk, met eigen icoon, splashscreen en pushmeldingen. Eén codebase, één
deploy: wat je op Railway uitrolt, staat meteen ook in de app.

> **Wat hier al voor klaar staat:** het webmanifest (naam, iconen, kleuren, `scope`), de service
> worker met offline-scherm, het endpoint `/.well-known/assetlinks.json`, het privacybeleid
> (`/privacy`) en het zelf verwijderen van je account (`/account-verwijderen`) — allemaal
> Play-vereisten. Wat je zélf moet doen staat hieronder, in volgorde.

---

## 0. Wat je nodig hebt

| Wat | Waarom | Kost |
| --- | --- | --- |
| Google Play Console-account | Om te publiceren | eenmalig $25 |
| Een vast domein met HTTPS | De app wijst naar dit domein | (heb je) |
| Node 18+, **JDK 17**, Android SDK | Bubblewrap bouwt het app-bestand | gratis |
| Een keystore (ondertekeningssleutel) | Zonder deze sleutel kan je nooit meer een update uitbrengen | gratis, **goed bewaren** |

De Play Console vraagt ook een **ontwikkelaarsidentiteit** (naam, adres, telefoon) en verifieert die.
Voor een federatie of vzw: registreer als organisatie, niet als privépersoon — dan hoeft er geen
privéadres in de winkel te staan (bij een privéaccount toont Google jouw adres wél publiek).

---

## 1. Kies je package-naam (één keer, voor altijd)

De package-naam identificeert de app in Play en kan **nooit** meer veranderen. Omgekeerde
domeinnotatie, kleine letters:

```
be.krachtbal.live
```

Zet dezelfde waarde in `android/twa-manifest.json` (`packageId`) én later in de omgeving
(`ANDROID_PACKAGE_NAME`).

---

## 2. Bouw het app-bestand met Bubblewrap

```bash
# Eenmalig: gereedschap controleren (JDK 17 + Android SDK)
npx @bubblewrap/cli doctor

# In een lege map buiten deze repo (het Android-project hoort niet in de webrepo):
mkdir -p ~/krachtbal-android && cd ~/krachtbal-android
cp <repo>/android/twa-manifest.json .

# Pas host/packageId aan als je domein anders is, en bouw:
npx @bubblewrap/cli init --manifest https://<jouw-domein>/manifest.webmanifest
npx @bubblewrap/cli build
```

`init` stelt een reeks vragen; de antwoorden staan al in `android/twa-manifest.json` (naam, kleuren,
iconen, snelkoppelingen naar het live-bord en de rangschikking). Bij de vraag over de
ondertekeningssleutel: laat Bubblewrap er een aanmaken als je er nog geen hebt.

> ⚠️ **De keystore en zijn wachtwoord horen niet in git.** Verlies je ze, dan kan je geen updates
> meer uitbrengen onder dezelfde app. Bewaar ze in een wachtwoordmanager én in een back-up.

Resultaat: `app-release-bundle.aab` — dat bestand upload je naar Play.

*Geen zin in een lokale Android-toolchain?* [PWABuilder](https://www.pwabuilder.com) doet hetzelfde
in de browser: domein invullen → Android-pakket downloaden. Het gebruikt dezelfde techniek en
dezelfde manifestgegevens.

---

## 3. Maak de app in de Play Console en upload

1. **Alle apps → App maken**: naam `Krachtbal Live`, taal Nederlands (België), type *App*, gratis.
2. **Testen en uitrollen → Interne tests**: maak een release en upload de `.aab`.
   Begin altijd met een interne test — niet meteen productie.
3. Google ondertekent je app zelf (*Play App Signing*). Dat is verplicht en prima: jouw sleutel
   blijft de *upload*-sleutel.

---

## 4. Koppel de app aan het domein (assetlinks) — de belangrijkste stap

Zonder deze stap start de app mét browserbalk. Dat is meteen zichtbaar en ziet er half af uit.

1. Play Console → **Testen en uitrollen → Instellingen → App-ondertekening**.
2. Kopieer de **SHA-256-certificaatvingerafdruk** van:
   - de *app-ondertekeningssleutel* (die van Google), en
   - de *uploadsleutel* (die van jou) — handig om je lokale testbuild ook geverifieerd te krijgen.
3. Zet ze in de omgeving van de webapp (Railway → Variables):

```bash
ANDROID_PACKAGE_NAME=be.krachtbal.live
# Beide vingerafdrukken, gescheiden door een komma:
ANDROID_CERT_FINGERPRINTS=AB:CD:...:12,34:56:...:90
```

4. Deploy en controleer: `https://<jouw-domein>/.well-known/assetlinks.json` moet je package en
   vingerafdrukken tonen. Staat er `[]`, dan klopt de configuratie niet (zie hieronder).
5. Controleer de koppeling met Google's
   [Statement List Tester](https://developers.google.com/digital-asset-links/tools/generator).

**Waarom een endpoint en geen bestand?** De vingerafdruk is pas bekend ná de eerste upload, en kan
wijzigen bij een sleutelrotatie. Zo volstaat een omgevingsvariabele — geen herbouw, geen commit.
De route staat in `src/app/.well-known/assetlinks.json/route.ts`; de logica (met tests) in
`src/lib/assetlinks.ts`. Een onleesbare of onvolledige waarde levert bewust `[]` op in plaats van
kapotte JSON, want daar faalt de verificatie stil op.

---

## 5. Vul de winkelpagina en het beleid in

Play laat je niet publiceren tot dit compleet is:

| Onderdeel | Wat invullen |
| --- | --- |
| Korte beschrijving (80 tekens) | bv. "Live-scores, klassementen en statistieken voor krachtbal." |
| Volledige beschrijving | Wat de app doet: live volgen, aantekenen, wedstrijdblad, pronostiek, analyse |
| App-icoon | 512×512 PNG — gebruik `public/icon-512.png` |
| Feature graphic | 1024×500 PNG — moet je nog ontwerpen |
| Schermafbeeldingen | Minstens 2 telefoonschermen (zie stap 6) |
| Categorie | Sport |
| **Privacybeleid** | `https://<jouw-domein>/privacy` |
| **Account verwijderen** | `https://<jouw-domein>/account-verwijderen` (App-inhoud → Gegevensveiligheid) |
| Gegevensveiligheid | Zie de tabel hieronder |
| Contentrating | Vragenlijst invullen; deze app is *Iedereen* |
| Doelgroep | 13+ — kies **niet** "ook voor kinderen": dan geldt het strengere Families-beleid, en dat past niet bij een platform met ledenadministratie |
| Advertenties | Toon je sponsorbanners op het veld-/kantinescherm in de app? Antwoord dan **ja, bevat advertenties**. Het zijn eigen afbeeldingen zonder advertentienetwerk, maar Google rekent gesponsorde inhoud mee |

### Gegevensveiligheid — wat je aanvinkt

Gebaseerd op wat de app echt bewaart (zie ook `/privacy`):

- **Persoonlijke info**: naam, e-mailadres — *verzameld*, *versleuteld onderweg*, *verwijderbaar*.
- **Foto's**: profielfoto en tribunefoto's — *verzameld*.
- **Gezondheid**: ongevalsaangiften bevatten medische gegevens — *verzameld*, enkel toegankelijk
  voor club en federatie.
- **App-activiteit**: check-ins, stemmen, pronostiek.
- **Niet**: locatie, contacten, advertentie-ID, delen met derden.
- Vink aan: *gegevens worden versleuteld verzonden* en *gebruikers kunnen verwijdering aanvragen*.

> Ga hier zorgvuldig door: een foutief ingevulde gegevensveiligheidsverklaring is een van de
> vaakste redenen voor een afkeuring, en medische gegevens vallen op.

---

## 6. Schermafbeeldingen maken

Play wil minstens twee telefoonschermen. De eerlijkste manier: neem ze op een échte wedstrijddag,
op een gsm (Android: aan/uit + volume omlaag). Kies schermen die tonen waar de app om draait:

1. het live-bord met een lopende wedstrijd,
2. het aantekenscherm met het veldschema,
3. de rangschikking,
4. een spelersprofiel of de analysepagina.

Bijsnijden hoeft niet — Play aanvaardt gewone gsm-schermafbeeldingen (min. 320 px, max. 3840 px,
verhouding tussen 16:9 en 9:16).

---

## 7. Uitrollen

1. Interne test → installeer via de testlink op je eigen toestel.
2. Controleer: **geen browserbalk** (anders klopt stap 4 niet), icoon en splashscreen kloppen,
   pushmeldingen werken, en de terugknop doet wat je verwacht.
3. Werkt alles? Promoveer de release naar **Productie**.

Google beoordeelt een eerste publicatie doorgaans in enkele dagen. Bij een nieuw
ontwikkelaarsaccount komt daar een verificatieperiode bij.

---

## Onderhoud

- **Inhoud updaten** = gewoon deployen. De app haalt de site op; er is geen nieuwe release nodig.
- **Wél een nieuwe release nodig** bij: een ander icoon of andere naam, nieuwe snelkoppelingen, of
  wanneer Google de vereiste *target API level* optrekt (jaarlijks). Dan: `npx @bubblewrap/cli
  update`, `build`, en de nieuwe `.aab` uploaden met een hoger `appVersionCode`.
- **Sleutelrotatie** → vingerafdrukken bijwerken in `ANDROID_CERT_FINGERPRINTS` (meerdere mogen
  tegelijk).

## Als de browserbalk toch zichtbaar blijft

1. `https://<domein>/.well-known/assetlinks.json` opvragen — komt daar `[]`? Dan zijn
   `ANDROID_PACKAGE_NAME`/`ANDROID_CERT_FINGERPRINTS` niet (goed) gezet.
2. Package-naam in het bestand identiek aan die in Play?
3. De vingerafdruk van de **app-ondertekeningssleutel** (Google) meegegeven, niet enkel die van je
   uploadsleutel?
4. Verificatie wordt gecachet: verwijder de app, herstart het toestel en installeer opnieuw.

## Later: betaalpakketten

`/prijzen` toont vandaag enkel het gratis pakket en er is geen betaalintegratie. Zet je later
betalende clubpakketten aan die je **in de app** verkoopt, dan verplicht Google daarvoor Play
Billing (met een commissie). Verkoop je ze buiten de app (factuur aan de club), dan valt dat onder
de uitzondering voor zakelijke diensten — maar dan mag de app er ook niet naar doorlinken. Bekijk
dat opnieuw op het moment dat het speelt.
