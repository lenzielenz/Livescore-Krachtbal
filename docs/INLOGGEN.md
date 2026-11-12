# Inloggen met Google, Microsoft en Apple

Naast e-mail en wachtwoord kan iedereen inloggen (of een account maken) met Google, Microsoft of Apple.
Elke knop verschijnt pas als de sleutels van die dienst in de omgeving staan (Railway → Variables). Zonder
sleutels blijft alles zoals het was.

Terugkeer-URL ("redirect URI") bij elke dienst, voor live:

```
https://livescore.roodgries.be/api/auth/oauth/google/callback
https://livescore.roodgries.be/api/auth/oauth/microsoft/callback
https://livescore.roodgries.be/api/auth/oauth/apple/callback
```

Voor de demo en de federatie-testomgeving: hetzelfde pad op hun eigen domein (voeg ze toe aan dezelfde
app, of maak per omgeving een eigen app). `PUBLIC_SERVER_URL` moet op elke omgeving het publieke adres zijn.

## Google

1. [Google Cloud Console](https://console.cloud.google.com/) → nieuw project → *APIs & Services* →
   *OAuth consent screen*: type *External*, appnaam, supportadres, logo; scopes `openid`, `email`, `profile`.
2. *Credentials* → *Create credentials* → *OAuth client ID* → *Web application*; voeg de terugkeer-URL toe.
3. Zet `GOOGLE_CLIENT_ID` en `GOOGLE_CLIENT_SECRET`.
4. Publiceer het consent screen (*In production*), anders kunnen enkel testgebruikers inloggen.

## Microsoft

1. [Azure portal](https://portal.azure.com/) → *Microsoft Entra ID* → *App registrations* → *New registration*.
   Accounttype: *Accounts in any organizational directory and personal Microsoft accounts*. Redirect URI:
   platform *Web*, de terugkeer-URL.
2. *Certificates & secrets* → *New client secret* (noteer de vervaldatum: daarna moet er een nieuw geheim komen).
3. Zet `MICROSOFT_CLIENT_ID` (Application (client) ID) en `MICROSOFT_CLIENT_SECRET`. `MICROSOFT_TENANT` blijft `common`.
4. Aanbevolen: *Token configuration* → *Add optional claim* → ID → `email` en `xms_edov`. Zonder `xms_edov`
   koppelt een werk- of schoolaccount niet aan een bestaand account op e-mailadres (zie *Veiligheid*);
   persoonlijke accounts (outlook.com, hotmail.com) werken altijd.

## Apple

Vraagt een betaald Apple Developer-account.

1. [Apple Developer](https://developer.apple.com/account/) → *Identifiers* → een *App ID* met *Sign in with Apple*.
2. *Identifiers* → *Services IDs* → nieuw (bv. `be.krachtbal.livescore.web`) → *Sign in with Apple* →
   *Configure*: domein `livescore.roodgries.be`, *Return URL* de terugkeer-URL.
3. *Keys* → nieuwe sleutel met *Sign in with Apple* → download het `.p8`-bestand (dat kan maar één keer).
4. Zet `APPLE_CLIENT_ID` (de Services ID), `APPLE_TEAM_ID`, `APPLE_KEY_ID` en `APPLE_PRIVATE_KEY` (de inhoud
   van het .p8-bestand; regeleinden als `\n` mag).

Apple laat gebruikers hun adres verbergen (`…@privaterelay.appleid.com`): dan ontstaat er een nieuw account.

## Hoe het werkt

`src/lib/oauth.ts` (diensten, controle van het id-token), `src/lib/oauth-login.ts` (account vinden, koppelen of
maken; sessie), routes `src/app/api/auth/oauth/[dienst]/`. Tests: `tests/unit/oauth.unit.spec.ts`,
`tests/int/oauth-login.int.spec.ts`.

- **Wie ben je?** Een al gekoppeld extern account → dat account. Anders een account met hetzelfde e-mailadres,
  enkel als de dienst het adres als geverifieerd meldt → koppelen. Anders een nieuw account met de gewone
  rol (zoals zelf registreren). Rollen van een bestaand account blijven ongewijzigd.
- **Sessie:** dezelfde als bij het gewone inloggen (sessie in de databank, cookie van 30 dagen). Uitloggen werkt
  hetzelfde.
- **Wachtwoord:** een account dat met Google/Microsoft/Apple begon, heeft een onbekend willekeurig wachtwoord.
  Wie toch met e-mail wil inloggen, kiest er een via *Wachtwoord vergeten*.

## Veiligheid

- `state` (tegen CSRF), `nonce` (tegen hergebruik van een token) en PKCE (Google, Microsoft). Het id-token wordt
  gecontroleerd met de publieke sleutels van de dienst: handtekening, uitgever, publiek en vervaldatum.
- Enkel een **geverifieerd** e-mailadres koppelt aan een bestaand account. Bij Microsoft is dat een persoonlijk
  account of een organisatie die het domein bewezen bezit (`xms_edov`): een werkaccount kan anders een
  willekeurig adres in het token zetten en zo andermans account overnemen ("nOAuth").
- Na het inloggen stuurt een korte pagina op het eigen domein door naar de bestemming: zo is de eerste pagina
  een same-origin navigatie en aanvaardt Payload het sessiecookie meteen (CSRF-regel van Payload).
- Terugsturen enkel naar een pad binnen de site (geen open redirect).
