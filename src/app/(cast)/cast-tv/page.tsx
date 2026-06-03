import { CastReceiver } from './CastReceiver'

// Statische schil: het pad dat getoond wordt komt pas binnen via een
// cast-bericht, dus deze pagina hoeft niets van de server te weten.
export const dynamic = 'force-static'

// De pagina die elke Chromecast opent (de "Custom Receiver"). Ze wacht op een
// bericht van het controle-toestel en laadt dan het juiste scherm.
export default function CastTvPage() {
  return <CastReceiver />
}
