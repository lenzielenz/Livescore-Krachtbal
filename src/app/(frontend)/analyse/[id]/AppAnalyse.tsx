import { ondertekendeUrl, type AppManifest } from '@/lib/app-analyse'

import { AppViewer } from './app/AppViewer'
import './app-analyse.css'

// De analysepagina van een wedstrijd die door de krachtbal-analyse-app verwerkt is. De server maakt
// enkel de ondertekende links naar het pakket; de viewer (client) laadt de meetdata en bouwt er
// alles interactief uit op: video en notities, 3D, het tactiekbord, spelers, worpen, passen,
// tactiek, het originele wedstrijdcentrum en delen.

export interface AppAnalyseProps {
  matchId: number
  manifest: AppManifest
  coachtekst: string | null
  namen: { thuis: string; uit: string }
  kleuren: { thuis: string; uit: string }
  centrumHref: string
  beheert: boolean
  deel?: string
  titel: string
}

export function AppAnalyse({ matchId, manifest, coachtekst, namen, kleuren, centrumHref, beheert, deel, titel }: AppAnalyseProps) {
  const heeft = new Set(manifest.bestanden.map((b) => b.naam))
  const url = (naam: string) => ondertekendeUrl(matchId, naam)
  const bestanden = manifest.bestanden.map((b) => ({ naam: b.naam, url: url(b.naam), titel: b.titel ?? TITELS[b.naam] }))
  const gemaakt = manifest.gemaakt ? new Date(manifest.gemaakt) : null

  return (
    <div className="appa">
      {heeft.has('wedstrijd_data.json') ? (
        <AppViewer
          matchId={matchId}
          dataUrl={url('wedstrijd_data.json')}
          videoUrl={heeft.has('video.mp4') ? url('video.mp4') : null}
          centrumUrl={heeft.has('wedstrijdcentrum.html') ? url('wedstrijdcentrum.html') : null}
          centrumHref={centrumHref}
          bestanden={bestanden}
          coachtekst={coachtekst}
          namen={namen}
          kleuren={kleuren}
          titel={titel}
          beheert={beheert}
          deel={deel}
        />
      ) : (
        <p className="appa-uitleg">De meetdata van deze analyse ontbreekt; stuur de analyse opnieuw door vanuit de app.</p>
      )}
      <p className="appa-bron">
        Gemaakt met de krachtbal-analyse-app
        {gemaakt && !Number.isNaN(gemaakt.getTime())
          ? ` · ${gemaakt.toLocaleString('nl-BE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Brussels' })}`
          : ''}
        {manifest.appVersie ? ` · versie ${manifest.appVersie}` : ''}
      </p>
    </div>
  )
}

const TITELS: Record<string, string> = {
  'video.mp4': 'De wedstrijdvideo',
  'samenvatting.pdf': 'Samenvatting (PDF)',
  'samenvatting.png': 'Samenvatting (afbeelding)',
  'veldbeeld.png': 'Veldbeeld (afbeelding)',
  'spelers.csv': 'Spelers (CSV, voor Excel)',
  'wedstrijd_data.json': 'Alle meetdata (JSON)',
  'analyse.json': 'Analyse en inzichten (JSON)',
  'wereldmodel.json': 'Wereldmodel (JSON)',
  'wedstrijdcentrum.html': 'Wedstrijdcentrum (los bestand)',
  'coachanalyse.html': 'Coachanalyse (los bestand)',
  'coachtekst.txt': 'Coachtekst',
}
