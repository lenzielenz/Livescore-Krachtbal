# Casten naar tv (Chromecast)

Stuur het **veldscherm** en het **kantinescherm** naar twee Chromecasts terwijl
je de bediening op je eigen gsm/laptop houdt. De bedienpagina staat op `/cast`
(ook bereikbaar via _Meer → 📺 Casten naar tv_).

## Hoe het werkt

- `/cast-tv` is de **Custom Receiver**: de pagina die elke Chromecast laadt. Ze
  wacht op een bericht en toont dan het juiste scherm in een schermvullend
  iframe.
- `/cast` is de **zender** (bediening). Per scherm (veld + kantine) opent ze de
  Chromecast-kiezer en stuurt het te tonen pad (`/veld/<id>` of
  `/kantine/scherm`) naar het gekozen toestel.
- Omdat één Chromecast maar één beeld toont, gebruik je **twee Chromecasts**:
  kies bij elke knop een ander toestel. Beide draaien dan tegelijk, bediend
  vanaf hetzelfde toestel.

Het beeld zelf blijft live: het veldscherm loopt via SSE, het kantinescherm
pollt de centrale selectie — net zoals wanneer je die pagina's rechtstreeks op
een tv opent.

## Eenmalige opzet: een App ID registreren

Casten van een eigen webscherm met behoud van de bediening vereist een
geregistreerde Cast-ontvanger. Tab-spiegelen volstaat niet (dan ben je je eigen
scherm kwijt).

1. Ga naar de **Google Cast SDK Developer Console**:
   <https://cast.google.com/publish> (eenmalige registratie van ~$5, met een
   Google-account).
2. Klik **Add new application → Custom Receiver**.
3. Geef bij **Receiver Application URL** je productie-URL op, eindigend op
   `/cast-tv`, bijvoorbeeld `https://krachtbal-live.up.railway.app/cast-tv`.
   - De URL moet via **HTTPS** bereikbaar zijn.
4. Bewaar de app. Je krijgt een **Application ID** (8 tekens, bv. `A1B2C3D4`).
5. Voor het **testen** registreer je onder **Cast Receiver Devices** het
   serienummer van elke Chromecast die je gebruikt, en wacht je ~15 min + een
   herstart van het toestel. Pas na **publiceren** van de app werkt het op alle
   Chromecasts zonder registratie.

## Instellen in de app

Zet de App ID als env-variabele (build-time, want de zender draait in de
browser):

```bash
NEXT_PUBLIC_CAST_APP_ID=A1B2C3D4
```

Op Railway voeg je dit toe bij de service-variabelen en deploy je opnieuw.
Zolang de variabele leeg is, toont `/cast` een uitleg in plaats van te casten.

## Gebruiken

1. Open `/cast` op je gsm/laptop (zelfde wifi als de Chromecasts).
2. **Veldscherm**: kies de wedstrijd, druk _Cast veldscherm_, kies de tv aan het
   veld. Wissel later van wedstrijd met _Wissel wedstrijd_ — geen herverbinding
   nodig.
3. **Kantinescherm**: druk _Cast kantinescherm_, kies de kantine-tv. Welke
   wedstrijden erop staan, kies je via `/kantine`.
4. Stoppen kan per scherm met _Stop_.

## Beperkingen

- Casten werkt in **Chrome** of **Edge** (desktop of Android). iPhone/iPad
  ondersteunen geen Chromecast in de browser.
- Voor twee gelijktijdige schermen heb je **twee Chromecasts** nodig.
