# Demoruimte

Een aparte plek om **alles** voor te stellen wat het platform kan, zonder ook maar iets aan de live
site of de echte gegevens te raken. Eén knop zet een volledige, geloofwaardige competitie klaar; een
draaiboek leidt je door het verhaal; met één tik wissel je van rol (federatie, club, coach, tafel,
scheidsrechter, speler, ouder, supporter).

| | Live | Demoruimte |
|---|---|---|
| Adres | livescore.roodgries.be | bv. demo.livescore.roodgries.be |
| Databank | Postgres (productie) | **eigen** Postgres — niets gedeeld |
| Aantekenmodus | uit de settings (nu: supporters) | **altijd federatie** |
| Zoekmachines | geïndexeerd | `noindex` |
| Herkenbaar aan | — | paarse band "🎬 Demoruimte" met *Kijk als …* en *Draaiboek* |

Code: `src/lib/omgeving.ts` (`PLATFORM_OMGEVING=demo`), `src/lib/demoruimte/` (rollen, draaiboek,
klaarzetten, toegang), `src/app/(frontend)/demoruimte/`, `src/app/api/demoruimte/`.

## Een demo geven

1. Open `https://<demo-adres>/demoruimte` (eerst de toegangscode, als die ingesteld is).
2. Druk **vlak voor de presentatie** op **▶ Demo klaarzetten** (± 15–60 s). Dan staan de wedstrijden
   van *vandaag* juist: de hoofdwedstrijd begint binnen een half uur, de U14 loopt live, een andere
   is net gedaan.
3. Volg de hoofdstukken. Elke stap wisselt meteen van rol en opent het juiste scherm. Bovenaan elke
   pagina staat de band: **Kijk als …** (wissel van rol waar je ook bent) en **📖 Draaiboek**.
4. Na de presentatie, of als iemand iets "kapot" klikte: **↻ Opnieuw klaarzetten**.

### Wat er klaarstaat

- 6 clubs (Sint-Michiels, Baasrode, Zandberg, Lebbeke, Opwijk, Sint-Gillis), heren en dames gekoppeld,
  twee U14-ploegen, ± 80 spelers met rugnummers; 2 nieuwe leden wachten op de federatie.
- Een seizoenskalender (planner met koppels) over 14 weekends; de eerste helft al gespeeld, met
  scorers, ingediende bladen, één forfait en één blad dat nog niet ingediend is.
- **Vandaag:**
  - *Sint-Michiels – Baasrode heren*: beide selecties staan; Baasrode stond in de file en schoof de
    aftrap 15 minuten op. De scheidsrechter moet nog controleren en vrijgeven; dan tekent de tafel aan.
  - *Sint-Michiels – Baasrode dames* (later): de coach moet nog selecteren.
  - *U14 Sint-Michiels – Baasrode*: loopt live in de 2e helft, aangetekend door de tafel — om
    *overnemen* en het *noodblad* te tonen.
  - *Zandberg – Baasrode heren*: net gedaan; Jens Aerts verzwikte zijn enkel. Wacht op aftekenen.
  - *Lebbeke – Zandberg dames*: afgelast met een foto van het ondergelopen veld.
- Een verplaatsingsaanvraag van Baasrode, door Sint-Michiels aanvaard: de federatie beslist.
- De boetelijst, voorstellen van het systeem en twee opgelegde boetes; scheidsrechterskosten per club.
- Inschrijvingen voor volgend seizoen: Baasrode en Zandberg ingediend (Baasrode met een kermisweekend),
  Lebbeke in concept, Sint-Michiels nog niets (dat toon je zelf).
- Een medische kaart, aangevraagd door de ouder van een U14-speler.
- Leden die **niet in orde** zijn, verspreid over de clubs: een nieuw lid zonder keuring
  (Sint-Michiels), een afgekeurd lid (Baasrode), leden in concept (Lebbeke, Zandberg) en keuringen die
  binnen 30 dagen verlopen. De federatie ziet op `/beheer/leden` per club hoeveel spelers er zijn, wie
  goedgekeurd is, wie wacht en wie niet in orde is, bekijkt de **herinnering** vooraf (tekst en
  ontvangers) en verstuurt ze. Ze gaat naar de clubbeheerders en -medewerkers (🔔 meldingen + push);
  clubs zonder beheerder met een account krijgen niets — dat staat er ook bij.
- Een open **referendum** (RHA/RDA, minimum 3 wedstrijden): 16 spelers stemden al, de demo-speler
  (Jens Aerts) mag nog stemmen. De federatie ziet de tussenstand, sluit en maakt bekend (erelijst).
  **↻ Referendum resetten** (in dat hoofdstuk van het draaiboek) wist enkel de stemmen en de uitslag
  van dit seizoen en zet de ronde opnieuw open — de rest van de demo blijft staan.
- De **seizoensstatistieken** van de club (`/club/seizoen`): per ploeg plaats, punten, W–G–V, saldo en
  vorm; topscorers en meeste wedstrijden over de hele club.

Alles wat een rol "doet", gebeurt via dezelfde routes als in de echte app (selectie, controle,
vrijgave, start, blessure, afgelasting, aftrap, verplaatsing): de demo toont nooit iets wat de app
zelf niet kan.

## Veiligheid

- Rol wisselen zonder wachtwoord, en alles wissen, bestaat **enkel** met `PLATFORM_OMGEVING=demo`.
  Op live en op de federatie-testomgeving geeft die route 404.
- Klaarzetten weigert een databank die er niet als demo uitziet (meer dan 5 echte accounts of meer
  dan 600 spelers): een per vergissing gezette variabele op live kan dus niets wissen.
- De demo-accounts (`…@demo.krachtbal.be`) hebben een wachtwoord dat afgeleid is van `PAYLOAD_SECRET`
  en nergens leesbaar is; inloggen gebeurt via de demoruimte. Wijzigt iemand toch een wachtwoord,
  dan zet rol wisselen het stil terug.
- Met `DEMO_TOEGANGSCODE` vraagt de demoruimte eerst een code (één keer per toestel). Zet die als
  het adres gedeeld wordt.
- Een beheerder die de omgeving opzette (eigen account, geen demo-adres) blijft bij het klaarzetten
  gewoon bestaan.

## Opzetten in Railway (eenmalig)

1. Project **Livescore-krachtbal** → bovenaan de omgevingskeuze → **New Environment** →
   *Duplicate environment* van `production`, naam `demo`.
2. In `demo`: verwijder de tijdelijke diensten (`tmp-…`). Hou de app-service en Postgres. De Postgres
   van deze omgeving is een **nieuwe, lege** databank.
3. Variabelen op de app-service:

   | Variabele | Waarde |
   |---|---|
   | `PLATFORM_OMGEVING` | `demo` |
   | `NEXT_PUBLIC_PLATFORM_OMGEVING` | `demo` |
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` — de Postgres **van de demo-omgeving** |
   | `PAYLOAD_SECRET` | een **nieuw** geheim (min. 32 tekens, niet dat van live) |
   | `DEMO_TOEGANGSCODE` | een code die je bij een presentatie ingeeft (aangeraden) |
   | `LIVE_URL` | `https://livescore.roodgries.be` |

   Laat `CRON_SECRET`, `SEED_SECRET`, `CV_BRIDGE_TOKEN`, `RESEND_API_KEY` en de VAPID-sleutels weg:
   een demo stuurt geen echte mails of pushberichten.
4. **Settings → Networking**: genereer een domein of koppel `demo.livescore.roodgries.be`.
   Railway bouwt en draait de migraties (`payload migrate`), zoals op live.
5. Optioneel op **live**: `DEMO_URL` = het adres van de demo. Dan verwijst `/demoruimte` op live
   door naar de echte demoruimte.
6. Open `/demoruimte` op het nieuwe adres en druk op **▶ Demo klaarzetten**.
