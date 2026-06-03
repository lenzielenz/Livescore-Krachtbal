# Schermen naar tv

Toon het **veldscherm** en het **kantinescherm** op een tv, en bedien vanaf je
eigen gsm/laptop wát erop verschijnt. De bedienpagina staat op `/cast` (ook via
_Meer → 📺 Schermen naar tv_).

## De eenvoudige manier (werkt op elk toestel)

Geen Chromecast, geen registratie, geen App ID. Werkt ook op iPhone/iPad.

1. **Open op de tv** één keer de scherm-URL:
   - Veldscherm: `https://<jouw-domein>/veld/scherm`
   - Kantinescherm: `https://<jouw-domein>/kantine/scherm`

   Hoe je die op de tv krijgt, hangt af van je opstelling:
   - **Smart-tv / Android-tv / Fire TV**: typ de URL in de ingebouwde browser.
   - **Laptop of mini-pc aan de tv (hdmi)**: open de URL in de browser, zet op
     volledig scherm (F11).
   - **Chromecast**: zie _Chromecast_ hieronder.

   Op `/cast` staat per scherm de exacte URL met knoppen **Kopieer**, **Openen**
   en een **QR-code** om met het tv-toestel te scannen.

2. **Bedien vanaf je gsm/laptop** op `/cast`:
   - **Veldscherm**: kies de wedstrijd. De veld-tv wisselt vanzelf — geen
     herladen of opnieuw verbinden.
   - **Kantinescherm**: kies de wedstrijden via _Kantine_. De kantine-tv volgt.

De tv hoef je daarna niet meer aan te raken. Beide schermen pollen de centrale
selectie en de scores lopen live via SSE — net zoals wanneer je de pagina's
rechtstreeks op een tv opent.

> Eén tv toont één scherm. Wil je het veldscherm én het kantinescherm tegelijk,
> gebruik dan twee tv's (of twee browservensters/Chromecasts).

## Chromecast (optioneel)

Wil je rechtstreeks vanaf de bedienpagina naar een Chromecast casten met behoud
van je eigen scherm, dan kan dat via een geregistreerde Custom Receiver. Dit is
**optioneel** — de eenvoudige manier hierboven heeft het niet nodig.

- `/cast-tv` is de **Custom Receiver** die elke Chromecast laadt; ze toont het
  juiste scherm in een schermvullend iframe.
- Op `/cast` verschijnt dan per scherm een knop _Of: cast via Chromecast_.

### Eenmalige opzet

1. Ga naar de **Google Cast SDK Developer Console**:
   <https://cast.google.com/publish> (eenmalige registratie van ~$5).
2. **Add new application → Custom Receiver**.
3. **Receiver Application URL**: je productie-URL eindigend op `/cast-tv`,
   bv. `https://krachtbal-live.up.railway.app/cast-tv` (moet via **HTTPS**).
4. Bewaar → je krijgt een **Application ID** (8 tekens).
5. Voor het **testen** registreer je onder _Cast Receiver Devices_ het
   serienummer van elke Chromecast en wacht je ~15 min + een herstart. Na het
   **publiceren** van de app werkt het op alle Chromecasts.

### Instellen in de app

Zet de App ID als env-variabele (build-time):

```bash
NEXT_PUBLIC_CAST_APP_ID=A1B2C3D4
```

Op Railway voeg je dit toe bij de service-variabelen en deploy je opnieuw.
Zonder deze variabele blijft de Chromecast-knop verborgen; de eenvoudige manier
(URL/QR) werkt altijd.

### Beperkingen Chromecast

- Werkt enkel in **Chrome** of **Edge** (desktop of Android). iPhone/iPad
  ondersteunen geen Chromecast in de browser — gebruik daar de eenvoudige manier.
