# Uitslagen overnemen van krachtbal.be

De federatie publiceert tijdens het seizoen alle uitslagen op haar eigen site
(`krachtbal.be/kalender.php`). Dit is de weg om die automatisch op ons platform te krijgen, zonder
dat iemand cijfers overtypt.

## Hoe het werkt

1. **De server haalt de pagina op.** Niet de browser: die mag krachtbal.be niet uitlezen (CORS), en
   zo hoeft niemand eerst een bestand te downloaden. Enkel adressen op `krachtbal.be` worden
   aanvaard — het endpoint is geen open proxy (`src/lib/federatie-fetch.ts`).
2. **De pagina wordt gelezen.** Twee leeswijzen na elkaar: de strikte kolomvolgorde van de
   officiële export (`results-import.ts`, bestond al) en een herkennende lezing die per tabelrij de
   score zoekt — twee losse getallen naast elkaar, of één cel als "12 - 8" — met de twee namen
   ervóór als thuis en bezoeker (`federatie-uitslagen.ts`). Die tweede lezing overleeft een
   layoutwijziging die vaste kolomnummers zou breken.
3. **De uitslagen worden op onze kalender toegepast** (`uitslagen-toepassen.ts`), met de regels
   hieronder.

## De regels bij het toepassen

| Situatie | Wat er gebeurt |
| --- | --- |
| Wedstrijd staat bij ons zonder eigen registratie | Eindstand wordt overgenomen, status op *afgelopen* |
| Wij tekenden ze **zelf** aan (worpen of een ingediend wedstrijdblad) | **Onaangeroerd**, en gemeld in het rapport |
| Zelfde stand als wat er al staat | Niets — telt als "al gelijk" |
| Andere stand dan bij ons | De federatie wint (officiële bron), maar het verschil wordt gemeld |
| Ploeg of wedstrijd niet gevonden | Gemeld, **geen** nieuwe ploeg of wedstrijd aangemaakt |

Die eerste twee regels zijn de belangrijkste. De geïmporteerde eindstand wordt in de match-state
**opgeteld** bij de score uit de worpen — een import over een zelf aangetekende wedstrijd zou de
stand dus verdubbelen. Vandaar dat zulke wedstrijden overgeslagen worden in plaats van bijgewerkt.
Het wedstrijdblad gaat trouwens sowieso vóór een webpagina: dat is het officiële document.

Er worden bewust **geen nieuwe wedstrijden of ploegen** aangemaakt. Het speelplan importeer je één
keer per seizoen (reeksindeling + kalender); deze sync vult daar enkel de uitslagen in. Zo levert
een tikfout in een ploegnaam een melding op in plaats van een spookploeg.

## Met de hand

Analyse → **Uitslagen importeren** → *Uitslagen ophalen bij de federatie*.

Eerst **Ophalen en tonen**: je ziet wat er herkend werd, wat overgeslagen wordt en wat niet
teruggevonden is — er wordt nog niets opgeslagen. Klopt het, dan **Uitslagen overnemen**.

Herkent de lezing niets, dan toont het scherm het begin van de eerste tabel van de pagina. Stuur dat
door; daarmee is de lezing bij te stellen.

## Automatisch

Zet een scheduler op het cron-endpoint, met hetzelfde geheim als de weekrecap:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<domein>/api/cron/uitslagen
```

Een zinnig ritme is **elk uur op zaterdag en zondag** (en eventueel maandagochtend voor late
correcties). Vaker heeft weinig zin: de federatie zet de uitslagen er zelf ook niet meteen op.

Test het één keer met `?preview=1` erachter — dan schrijft het niets weg maar krijg je wel het
volledige rapport terug.

Zonder `CRON_SECRET` doet het endpoint niets (401). Elke run logt één regel in Railway met wat ze
deed, zodat je achteraf kan zien of er iets binnenkwam.

## Wat dit níet vervangt

Onze eigen livescore blijft de snelste en rijkste bron: die geeft de stand tijdens de wedstrijd,
plus worpen, statistieken en het wedstrijdblad. De federatie-uitslag komt pas later en is enkel de
eindstand. Deze sync is er voor de wedstrijden die **niemand** bij ons aantekende — zodat het
klassement toch klopt.
