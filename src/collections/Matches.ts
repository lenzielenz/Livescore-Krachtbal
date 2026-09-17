import type { CollectionConfig, FieldHook, Where } from 'payload'

import { isFederationLevel } from '../lib/access'
import { CATEGORY_OPTIONS } from '../lib/categories'
import { unpairFieldScreensForMatch } from '../lib/field-screens-data'
import { verwijderMatchKinderen } from '../lib/match-cleanup'
import { notifyMatchStatusChange } from '../lib/match-notify'
import { REEKS_OPTIONS, reeksCategorie, type Reeks } from '../lib/reeksen'
import { seasonFromDate } from '../lib/seasons'

// Vul het seizoen automatisch in uit de datum wanneer het leeg gelaten wordt (de admin mag het
// expliciet overschrijven). Zo heeft elke wedstrijd een seizoen zonder extra werk.
const deriveSeizoen: FieldHook = ({ value, siblingData }) => {
  if (typeof value === 'string' && value.trim()) return value
  const raw = (siblingData as { date?: string | null })?.date
  if (!raw) return value
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? value : seasonFromDate(d)
}

export const MATCH_STATUS_OPTIONS = [
  { label: 'Gepland', value: 'scheduled' },
  { label: 'Live', value: 'live' },
  { label: 'Afgelopen', value: 'finished' },
] as const

export const Matches: CollectionConfig = {
  slug: 'matches',
  labels: {
    singular: 'Wedstrijd',
    plural: 'Wedstrijden',
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'date', 'reeks', 'status'],
    group: 'Wedstrijden',
  },
  access: {
    // Iedereen mag wedstrijden lezen (publiek live-bord). Aanmaken/wijzigen/verwijderen
    // is voorbehouden aan federatie/admin — zoals bij teams, clubs en officials.
    read: () => true,
    create: ({ req }) => isFederationLevel(req.user),
    update: ({ req }) => isFederationLevel(req.user),
    delete: ({ req }) => isFederationLevel(req.user),
  },
  hooks: {
    // Supporters verwittigen bij de start en het einde van een (gewone) wedstrijd. We reageren op
    // de status-overgang naar 'live'/'finished'; analyse-only en demo's verwittigen niemand. Het
    // versturen gebeurt losgekoppeld (zie notifyMatchStatusChange) zodat het de actie niet vertraagt.
    afterChange: [
      ({ doc, previousDoc, operation }) => {
        const status = (doc as { status?: string }).status ?? ''
        const prevStatus = operation === 'update' ? ((previousDoc as { status?: string } | undefined)?.status ?? null) : null
        notifyMatchStatusChange({
          id: (doc as { id: number }).id,
          status,
          prevStatus,
          analyseOnly: Boolean((doc as { analyseOnly?: boolean }).analyseOnly),
          isDemo: Boolean((doc as { isDemo?: boolean }).isDemo),
        })
      },
      // Een veldscherm dat aan deze wedstrijd gekoppeld stond, ontkoppelt zodra ze afloopt — via
      // welk pad dan ook (aantekenscherm, forfait, .xls-import, federatie-sync): één plek voor
      // "de wedstrijd is voorbij" i.p.v. dat elk finish-pad dit apart zou moeten onthouden. Zie
      // lib/field-screens-data.ts.
      async ({ doc, previousDoc, operation, req }) => {
        const status = (doc as { status?: string }).status
        const prevStatus = operation === 'update' ? (previousDoc as { status?: string } | undefined)?.status : null
        if (status === 'finished' && prevStatus !== 'finished') {
          await unpairFieldScreensForMatch(req.payload, (doc as { id: number }).id)
        }
      },
    ],
    // Een wedstrijd verwijderen moet ook de eraan vastgekoppelde data opruimen. Noodzakelijk
    // omdat elke `match_id` verplicht is: de Postgres-sleutel staat op ON DELETE SET NULL, wat
    // botst met die NOT NULL-kolom en anders een onleesbare databasefout geeft.
    //
    // De lijst staat in match-cleanup.ts en niet hier. Ze stond hier ooit wél, met vier
    // collections, terwijl de verwijderknop in de app er negen kende — verwijderen via /admin
    // faalde dus op alles wat later was bijgekomen. Eén lijst, één volgorde, alle wegen.
    //
    // Ongevallen (verzekeringsdossiers) laten we bewust staan: `accidents.match` is nullable, dus
    // de database koppelt de verwijzing los en het dossier overleeft.
    beforeDelete: [
      async ({ req, id }) => {
        await verwijderMatchKinderen(req.payload, id, req)
      },
    ],
  },
  fields: [
    {
      // Snelkoppeling naar het tablet-aantekenscherm vanuit de admin.
      name: 'scorekeeperLink',
      type: 'ui',
      admin: {
        components: {
          Field: '/components/admin/ScorekeeperLink#ScorekeeperLink',
        },
      },
    },
    {
      // Leesbare titel, samengesteld uit de ploegen. Niet handmatig in te vullen.
      name: 'title',
      label: 'Titel',
      type: 'text',
      admin: {
        readOnly: true,
        hidden: true,
      },
      hooks: {
        beforeChange: [
          async ({ siblingData, req }) => {
            const { homeTeam, awayTeam } = siblingData as {
              homeTeam?: string
              awayTeam?: string
            }
            if (!homeTeam || !awayTeam) return undefined
            const [home, away] = await Promise.all([
              req.payload.findByID({ collection: 'teams', id: homeTeam, depth: 0 }).catch(() => null),
              req.payload.findByID({ collection: 'teams', id: awayTeam, depth: 0 }).catch(() => null),
            ])
            if (!home || !away) return undefined
            return `${home.name} — ${away.name}`
          },
        ],
      },
    },
    {
      // Optionele live-uitzending: een link naar de stream (YouTube, Facebook of Twitch). Is ze
      // ingevuld, dan kunnen supporters de wedstrijd live volgen op de wedstrijdpagina.
      name: 'livestreamUrl',
      label: 'Livestream-URL (optioneel)',
      type: 'text',
      admin: {
        description: 'Link naar de live-uitzending (YouTube, Facebook of Twitch). Supporters volgen de wedstrijd dan live op de wedstrijdpagina.',
      },
    },
    {
      // Video-analyse: de opname van de wedstrijd, geijkt op de wedstrijdklok. Met één ijkpunt per
      // helft ("op welke seconde in de video begint deze helft?") springt de analyse van elk
      // doelpunt/worp naar het juiste beeld. Zie src/lib/video-sync.ts.
      type: 'collapsible',
      label: 'Video-analyse',
      admin: { initCollapsed: true, description: 'Opname van de wedstrijd, gekoppeld aan de tijdlijn (analysemodule).' },
      fields: [
        {
          name: 'videoUrl',
          label: 'Video-URL',
          type: 'text',
          admin: {
            description: 'YouTube-link of een direct videobestand (.mp4/.webm). Een bestand laat exact springen; YouTube herlaadt bij elke sprong.',
            placeholder: 'https://youtu.be/… of https://…/wedstrijd.mp4',
          },
        },
        {
          type: 'row',
          fields: [
            {
              name: 'videoOffsetH1',
              label: 'Aftrap 1e helft (seconden in de video)',
              type: 'number',
              min: 0,
              admin: { description: 'Meestal makkelijker te zetten via "IJk hier" in de analysepagina.' },
            },
            {
              name: 'videoOffsetH2',
              label: 'Aftrap 2e helft (seconden in de video)',
              type: 'number',
              min: 0,
              admin: { description: 'Leeg = doorrekenen alsof de video ononderbroken loopt.' },
            },
          ],
        },
        {
          // Tweede camera: een veld van 46 m past zelden in één beeld, dus wordt er vaak met twee
          // toestellen gefilmd — elk op één kant van het veld. Beide opnames projecteren via hun
          // éigen kalibratie naar hetzelfde veld-assenstelsel; de analyse draait per camera en
          // voegt de detecties daarna samen op veldcoördinaat + tijd (zie src/lib/cv-samenvoegen.ts).
          type: 'row',
          fields: [
            {
              name: 'video2Url',
              label: 'Tweede camera (andere kant van het veld)',
              type: 'text',
              admin: {
                description: 'Geüpload bestand van de tweede camera. Enkel zinvol náást de eerste video.',
              },
            },
            {
              // Alle tijden in de app (voorstellen, ijkpunten, tijdlijn) staan in de tijdlijn van
              // camera 1. Dit ene getal vertaalt: seconde 0 van camera 1 = deze seconde in camera 2.
              // Negatief mag — camera 2 kan later gestart zijn.
              name: 'video2OffsetS',
              label: 'Tijdsverschil camera 2 (sec)',
              type: 'number',
              admin: {
                description: 'Op welke seconde in camera 2 valt seconde 0 van camera 1? IJk dit via de analysepagina.',
              },
            },
          ],
        },
        {
          // Wie is wie: van werper-volgnummer (uit de videoanalyse) naar speler-id.
          //
          // Het model leest geen rugnummers, maar het kan dezelfde persoon volgen zolang die in
          // beeld blijft. Deze tabel is wat een mens daaraan toevoegt: één keer per werper zeggen
          // welke speler dat is. Vorm: { "3": 42, "7": 43 }.
          name: 'cvWerpers',
          label: 'Werpers uit de video → spelers',
          type: 'json',
          admin: { hidden: true, description: 'Beheerd via /api/cv/match/[id]/werpers.' },
        },
        {
          // Twee wegen naar een analyse, en ze sluiten elkaar niet uit maar vragen wél iets
          // anders van je:
          //   'manueel' — je tikt elke worp aan op het veldschema; de video is er om te
          //               herbekijken. Dit is de weg waarmee het platform begon.
          //   'video'   — je voert niets in. De opname wordt doorgerekend en de voorstellen
          //               die eruit komen bevestig je. Dan is "wedstrijd aangetekend" geen
          //               stap die nog moet gebeuren, en het voortgangsbord hoort dat te weten.
          name: 'analyseModus',
          label: 'Hoe wordt deze analyse gemaakt?',
          type: 'select',
          defaultValue: 'manueel',
          options: [
            { label: 'Manueel aantekenen', value: 'manueel' },
            { label: 'Alles uit de video', value: 'video' },
          ],
          admin: {
            description: 'Bepaalt welke stappen het voortgangsbord vraagt. Enkel voor analyse-opnames.',
          },
        },
        {
          // Kalibratie van dít terrein, aangeklikt in de app op een videoframe: welke
          // beeldpunten horen bij welke lijnkruisingen van het veld. Zonder deze punten kan
          // de server wel worpen hérkennen maar niet zeggen wáár ze landden.
          // Vorm: { punten: [{label, x, y}], beeldBreedte, beeldHoogte, gezet }.
          name: 'cvKalibratie',
          label: 'Veldkalibratie (aangeklikt op de video)',
          type: 'json',
          admin: {
            hidden: true,
            description: 'Beheerd via de analysepagina. Niet handmatig bewerken.',
          },
        },
        {
          // Eigen kalibratie voor de tweede camera: die staat op een andere plek en ziet dus
          // andere lijnkruisingen. Zelfde vorm als cvKalibratie.
          name: 'cvKalibratie2',
          label: 'Veldkalibratie camera 2',
          type: 'json',
          admin: {
            hidden: true,
            description: 'Beheerd via de analysepagina (camera 2). Niet handmatig bewerken.',
          },
        },
        {
          // Wie is wie in de spelerstracking: van tracking-spoor naar speler-id. Een ánder
          // nummerbereik dan cvWerpers (de sporen komen uit cv/tracking.py, de werpers uit
          // cv/houding.py — twee id-ruimtes die niets met elkaar te maken hebben).
          // Vorm: { "3": 42, "100005": 43 } — sporen van camera 2 dragen CAMERA2_BASIS erbij
          // (cv-samenvoegen.ts). De gereserveerde sleutel "_posities" (geen getal) draagt de
          // vingerafdruk van de tracking-run waar deze toewijzing bij hoort: draait de tracking
          // opnieuw, dan zijn de spoornummers nieuw en is de toewijzing waardeloos.
          name: 'cvSporen',
          label: 'Tracking-sporen → spelers',
          type: 'json',
          admin: { hidden: true, description: 'Beheerd via /api/cv/match/[id]/sporen.' },
        },
        {
          // Stand van de server-side video-analyse: wachtrij → bezig → klaar/mislukt, met de
          // stap waar hij mee bezig is. Zo weet de analysepagina wat ze moet tonen, ook nadat
          // de gebruiker wegklikte of de server tussendoor herstartte.
          name: 'cvAnalyse',
          label: 'Video-analyse (servertaak)',
          type: 'json',
          admin: {
            hidden: true,
            description: 'Beheerd via /api/cv/match/[id]/analyseer. Niet handmatig bewerken.',
          },
        },
        {
          // Fysieke statistiek uit de videotracking (cv/fysiek.py): per speler gelopen afstand,
          // sprintjes en topsnelheid. Vorm: { spelers: [{team,rugnummer,naam?,afstand_m,sprints,
          // topsnelheid_m_s,actieve_s}], bron, bijgewerkt }. Geen afgeleide van de worp-events —
          // dit is een eigen meting uit de video, dus mág opgeslagen worden.
          name: 'cvFysiek',
          label: 'Fysieke stats uit video (tracking)',
          type: 'json',
          admin: {
            hidden: true,
            description: 'Geüpload via /api/cv/match/[id]/fysiek. Niet handmatig bewerken.',
          },
        },
      ],
    },
    {
      // Eerste keuze: de reeks. Die bepaalt de categorie én filtert de kiesbare ploegen.
      name: 'reeks',
      label: 'Reeks / niveau',
      type: 'select',
      options: [...REEKS_OPTIONS],
      required: true,
      admin: {
        description: 'Kies eerst de reeks. De categorie volgt automatisch en de ploegen worden hierop gefilterd.',
      },
    },
    {
      name: 'seizoen',
      label: 'Seizoen',
      type: 'text',
      admin: {
        position: 'sidebar',
        description: 'Bv. 2025-2026. Leeg laten = automatisch afgeleid uit de datum (juli–juni).',
      },
      hooks: { beforeChange: [deriveSeizoen] },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'homeTeam',
          label: 'Thuisploeg',
          type: 'relationship',
          relationTo: 'teams',
          required: true,
          // Toon enkel ploegen uit de gekozen reeks (kies dus eerst de reeks) en nooit de ploeg die
          // al als uitploeg gekozen is — een ploeg kan niet tegen zichzelf spelen.
          filterOptions: ({ siblingData }) => {
            const sd = siblingData as { reeks?: string; awayTeam?: unknown; analyseOnly?: boolean }
            if (!sd?.reeks) return false
            const other = sd.awayTeam
            const otherId = other && typeof other === 'object' ? (other as { id?: unknown }).id : other
            // Analyse-wedstrijd → enkel analyse-ploegen; competitie-wedstrijd → enkel competitie-ploegen.
            const and: Where[] = [{ reeks: { equals: sd.reeks } }, { analyseOnly: sd.analyseOnly ? { equals: true } : { not_equals: true } }]
            if (otherId != null) and.push({ id: { not_equals: otherId } })
            return { and }
          },
          admin: { description: 'Kies eerst een reeks hierboven.' },
        },
        {
          name: 'awayTeam',
          label: 'Uitploeg',
          type: 'relationship',
          relationTo: 'teams',
          required: true,
          filterOptions: ({ siblingData }) => {
            const sd = siblingData as { reeks?: string; homeTeam?: unknown; analyseOnly?: boolean }
            if (!sd?.reeks) return false
            const other = sd.homeTeam
            const otherId = other && typeof other === 'object' ? (other as { id?: unknown }).id : other
            // Analyse-wedstrijd → enkel analyse-ploegen; competitie-wedstrijd → enkel competitie-ploegen.
            const and: Where[] = [{ reeks: { equals: sd.reeks } }, { analyseOnly: sd.analyseOnly ? { equals: true } : { not_equals: true } }]
            if (otherId != null) and.push({ id: { not_equals: otherId } })
            return { and }
          },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'date',
          label: 'Datum',
          type: 'date',
          required: true,
          admin: {
            date: { pickerAppearance: 'dayAndTime', displayFormat: 'dd/MM/yyyy HH:mm', timeFormat: 'HH:mm' },
          },
        },
        {
          name: 'status',
          label: 'Status',
          type: 'select',
          options: [...MATCH_STATUS_OPTIONS],
          defaultValue: 'scheduled',
          required: true,
        },
        {
          name: 'goalAreaDepth',
          label: 'Diepte doelgebied (m)',
          type: 'number',
          defaultValue: 10,
          min: 5,
          max: 25,
          required: true,
          admin: {
            description: 'Min. 10 m (15 m voor nieuwe terreinen, 5 m in zalen). Bepaalt de veldlengte en de afstandsberekening.',
          },
        },
        {
          // Niet elk terrein is exact reglementair: wie de échte maten opmeet en hier invult,
          // krijgt overal echte meters terug — hoe ver en waarheen er gegooid werd.
          name: 'veldBreedte',
          label: 'Veldbreedte (m)',
          type: 'number',
          min: 6,
          max: 20,
          admin: {
            description: 'Opgemeten breedte van dít terrein. Leeg = reglementair 14 m.',
          },
        },
        {
          name: 'veldSpeelveld',
          label: 'Speelveld tussen de doellijnen (m)',
          type: 'number',
          min: 10,
          max: 30,
          admin: {
            description: 'Opgemeten afstand tussen de twee doellijnen. Leeg = reglementair 26 m.',
          },
        },
      ],
    },
    {
      // Demo/oefenwedstrijd: bedoeld om de live-registratie uit te leggen. Een demo mag
      // altijd geopend worden (geen opstelling-/scheidsrechtercontrole) en toont in het
      // aantekenscherm een stap-voor-stap uitleg.
      name: 'isDemo',
      label: 'Demo / oefenwedstrijd',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description: 'Aanvinken voor een oefen-/uitlegwedstrijd. Mensen kunnen die starten om de live-registratie te leren; alle startcontroles worden overgeslagen.',
        position: 'sidebar',
      },
    },
    {
      // Enkel-voor-analyse: een wedstrijd die je manueel opneemt om data te verzamelen,
      // maar die NIET publiek/live getoond wordt (niet op de startpagina, het live-bord,
      // de rangschikking …). Dient puur om in de analysemodule te bekijken.
      name: 'analyseOnly',
      label: 'Enkel voor analyse (niet live tonen)',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description: 'Aanvinken voor een wedstrijd die je enkel opneemt voor analyse. Ze verschijnt niet live of in de rangschikking — alleen in de analysemodule.',
        position: 'sidebar',
      },
    },
    {
      // Kwam de eindstand automatisch binnen (federatie-sync of de officiële .xls-export) i.p.v.
      // dat iemand ze zelf via de app registreerde (veldschema, wedstrijdblad, of een supporter die
      // de eindstand doorgaf)? Puur herkomst-metadata — telt niet mee in de score/stand-berekening,
      // maar laat de weekrecap onderscheid maken tussen "door supporters ingevuld" en "automatisch
      // aangevuld" (zie weekly-recap-data.ts / uitslagen-toepassen.ts / results/import route).
      name: 'autoImported',
      label: 'Automatisch geïmporteerd (federatie/export)',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description: 'Automatisch gezet bij de federatie-sync of de officiële .xls-import. Nooit door een mens aangevinkt.',
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      // Aangeduide verantwoordelijke per club (coach/aantekenaar) die deze wedstrijd "claimt"
      // via Mijn club, zodat iedereen in de club ziet wie waar staat. Thuis en bezoek apart.
      type: 'row',
      fields: [
        {
          name: 'homeCoach',
          label: 'Verantwoordelijke thuis',
          type: 'relationship',
          relationTo: 'users',
          admin: { readOnly: true, position: 'sidebar', description: 'Geclaimd via Mijn club.' },
        },
        {
          name: 'awayCoach',
          label: 'Verantwoordelijke bezoek',
          type: 'relationship',
          relationTo: 'users',
          admin: { readOnly: true, position: 'sidebar', description: 'Geclaimd via Mijn club.' },
        },
      ],
    },
    {
      // Openstaande overname-aanvraag per kant: wie vraagt om de claim van de huidige
      // verantwoordelijke over te nemen (via Mijn club). De huidige verantwoordelijke keurt goed.
      type: 'row',
      fields: [
        {
          name: 'homeTakeover',
          label: 'Overname-aanvraag thuis',
          type: 'relationship',
          relationTo: 'users',
          admin: { readOnly: true, position: 'sidebar', description: 'Aanvraag via Mijn club.' },
        },
        {
          name: 'awayTakeover',
          label: 'Overname-aanvraag bezoek',
          type: 'relationship',
          relationTo: 'users',
          admin: { readOnly: true, position: 'sidebar', description: 'Aanvraag via Mijn club.' },
        },
      ],
    },
    {
      // Categorie volgt automatisch uit de reeks (leeftijdsniveau voor de spelregels) —
      // niet meer handmatig te kiezen.
      name: 'category',
      label: 'Categorie (afgeleid uit reeks)',
      type: 'select',
      options: CATEGORY_OPTIONS,
      admin: { readOnly: true },
      hooks: {
        beforeChange: [
          ({ siblingData, value }) => {
            const r = (siblingData as { reeks?: Reeks })?.reeks
            return r ? reeksCategorie(r) : (value ?? 'senioren')
          },
        ],
      },
    },
    {
      // Actieve opstelling: de spelers die momenteel op het veld staan (max. 4 per ploeg).
      // Alleen deze spelers kunnen werpen; wissels passen deze lijst aan.
      type: 'row',
      fields: [
        {
          name: 'homeLineup',
          label: 'Opstelling thuis (op het veld)',
          type: 'relationship',
          relationTo: 'players',
          hasMany: true,
          admin: {
            components: {
              Field: {
                path: '/components/admin/LineupSelector#LineupSelector',
                clientProps: { teamPath: 'homeTeam', label: 'Opstelling thuis (op het veld)' },
              },
            },
          },
        },
        {
          name: 'awayLineup',
          label: 'Opstelling uit (op het veld)',
          type: 'relationship',
          relationTo: 'players',
          hasMany: true,
          admin: {
            components: {
              Field: {
                path: '/components/admin/LineupSelector#LineupSelector',
                clientProps: { teamPath: 'awayTeam', label: 'Opstelling uit (op het veld)' },
              },
            },
          },
        },
      ],
    },
    {
      // Kapitein per ploeg (één van de veldspelers). Reglement: een eigen doelpunt
      // wordt op naam/nummer van de kapitein genoteerd. Wordt aangeduid bij de opstelling
      // en getoond met een 'K'-badge op scorebord/matchpagina.
      type: 'row',
      fields: [
        {
          name: 'homeCaptain',
          label: 'Kapitein thuis',
          type: 'relationship',
          relationTo: 'players',
          filterOptions: ({ siblingData }) => {
            const t = (siblingData as { homeTeam?: string })?.homeTeam
            return t ? { team: { equals: t } } : false
          },
        },
        {
          name: 'awayCaptain',
          label: 'Kapitein uit',
          type: 'relationship',
          relationTo: 'players',
          filterOptions: ({ siblingData }) => {
            const t = (siblingData as { awayTeam?: string })?.awayTeam
            return t ? { team: { equals: t } } : false
          },
        },
      ],
    },
    {
      // Klokstaat — runtime live-state. De definitieve tijdlijn blijft afleidbaar uit MatchEvents.
      label: 'Klokstaat',
      type: 'collapsible',
      admin: {
        initCollapsed: true,
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'currentHalf',
              label: 'Helft',
              type: 'number',
              defaultValue: 1,
              min: 1,
              max: 2,
            },
            {
              name: 'clockSeconds',
              label: 'Klok (sec, telt op vanaf 0)',
              type: 'number',
              defaultValue: 0,
              min: 0,
            },
            {
              name: 'clockRunning',
              label: 'Klok loopt',
              type: 'checkbox',
              defaultValue: false,
            },
          ],
        },
        {
          // Tijdstip waarop de klok voor het laatst is gestart/bijgewerkt — om de live
          // verstreken tijd te berekenen wanneer clockRunning = true.
          name: 'clockUpdatedAt',
          label: 'Klok bijgewerkt op',
          type: 'date',
          admin: {
            date: { pickerAppearance: 'dayAndTime', displayFormat: 'dd/MM/yyyy HH:mm', timeFormat: 'HH:mm' },
          },
        },
      ],
    },
    {
      // Simpele aantekenmodus (snelscoremodus): snelle doelpunten +1/+2 en kruisjes,
      // los van het worp-/balbezit-model. Vorm: { goals: [...], crosses: {home,away} }.
      // Zie src/lib/simple-score.ts. buildMatchState telt dit mee in de stand.
      name: 'simpleScore',
      label: 'Simpele score (Starter-modus)',
      type: 'json',
      admin: {
        hidden: true,
        description: 'Beheerd via het simpele aantekenscherm. Niet handmatig bewerken.',
      },
    },
    {
      // Vertrouwenslaag op supporters-scores: wie deze wedstrijd claimde als official scorer, wie
      // meetekende, en de bevestigingen/betwistingen van andere kijkers. Bepaalt het 🟢/🟡-label op
      // het scorebord. Vorm: zie src/lib/score-trust.ts (MatchTrust). Automatisch beheerd.
      name: 'scoreTrust',
      label: 'Vertrouwen op de score',
      type: 'json',
      admin: {
        hidden: true,
        description: 'Official scorer + bevestigingen van de supporters-score. Automatisch beheerd.',
      },
    },
    {
      // Live tribune — persistente opslag zodat de emoji-tellers en shoutouts NIET verdwijnen
      // wanneer (even) niemand kijkt of de server herstart. Het live-kanaal hydrateert hieruit.
      name: 'liveReactions',
      label: 'Live reacties (tellers)',
      type: 'json',
      admin: {
        hidden: true,
        description: 'Cumulatieve emoji-tellers van de live tribune. Automatisch beheerd.',
      },
    },
    {
      name: 'liveShoutouts',
      label: 'Live shoutouts',
      type: 'json',
      admin: {
        hidden: true,
        description: 'Recente supporter-berichten van de live tribune. Automatisch beheerd.',
      },
    },
    {
      name: 'livePoll',
      label: 'Voorspel-poll (stemmen)',
      type: 'json',
      admin: {
        hidden: true,
        description: 'Cumulatieve voorspel-stemmen (home/draw/away). Automatisch beheerd.',
      },
    },
    {
      name: 'scorePredictions',
      label: 'Score-voorspellingen (clubcompetitie)',
      type: 'json',
      admin: {
        hidden: true,
        description: 'Exacte-uitslag-voorspellingen van clubleden: [{userId,name,clubId,home,away,at}]. Automatisch beheerd.',
      },
    },
    {
      // Bonusrad: puntenmultiplier voor de pronostiek van deze wedstrijd (1 = normaal, 2 = bonus).
      // De weekendwinnaar draait aan het rad en kiest zo 3 bonuswedstrijden voor het komende weekend.
      name: 'pronostiekBonus',
      label: 'Pronostiek-bonus (×)',
      type: 'number',
      defaultValue: 1,
      min: 1,
      max: 5,
      admin: {
        position: 'sidebar',
        description: 'Puntenmultiplier voor de pronostiek (1 = normaal, 2 = bonus via het rad). Automatisch beheerd.',
      },
    },
    {
      // Eigenaar van een analyse-opname: de gebruiker die deze (analyseOnly) wedstrijd opnam.
      // Analyse-data is privé per persoon — je ziet enkel je eigen opnames. Federatie/admin ziet
      // alles en kan zo achteraf alle data samenbrengen.
      name: 'analyseOwner',
      label: 'Analyse-eigenaar',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Wie deze analysewedstrijd opnam. Bepaalt wie ze ziet (privé per persoon).',
      },
    },
    {
      // Tijdstip waarop de wedstrijd afgelopen is. Wordt automatisch gezet zodra de status op
      // 'finished' gaat en bepaalt het 1-uur-navenster waarin supporters nog kunnen reageren.
      name: 'finishedAt',
      label: 'Afgelopen op',
      type: 'date',
      admin: {
        position: 'sidebar',
        readOnly: true,
        date: { pickerAppearance: 'dayAndTime', displayFormat: 'dd/MM/yyyy HH:mm', timeFormat: 'HH:mm' },
        description: 'Automatisch gezet bij het beëindigen. Bepaalt het 1u-navenster van de live tribune.',
      },
      hooks: {
        beforeChange: [
          ({ siblingData, value }) => {
            const status = (siblingData as { status?: string })?.status
            if (status === 'finished') return value || new Date().toISOString()
            // Niet (meer) afgelopen → geen eindtijd (bv. heropend).
            return null
          },
        ],
      },
    },
  ],
}
