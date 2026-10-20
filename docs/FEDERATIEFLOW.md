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

## 4. Kalender en scheidsrechters — federatie

- `/beheer/kalender`: per reeks heen en terug, thuis en uit eerlijk verdeeld, vrije data,
  vast thuisuur per ploeg. Eerst een voorstel, dan aanmaken.
- `/beheer/scheidsrechters`: per speeldag toewijzen; conflicten (dubbel geboekt, fluiten bij de eigen
  club) in het rood; "Vul automatisch" verdeelt eerlijk. Elke scheidsrechter krijgt een melding.
- `/beheer/wedstrijden`: wedstrijden verplaatsen; beide clubs krijgen een melding.

## 5. Wedstrijddag

1. De coach kiest zijn selectie (`/opstelling/[id]`); ⭐ favorieten staan bovenaan. De server
   aanvaardt enkel spelers van die ploeg die mogen spelen.
2. De scheidsrechter geeft akkoord, er wordt aangetekend, de kapiteins tekenen af.
3. Na de wedstrijd bevestigt de scheidsrechter **wie speelde**. Dat staat daarna bij elke speler
   (`/spelers/[id]`: geselecteerd / gespeeld) en telt voor het referendum.

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
