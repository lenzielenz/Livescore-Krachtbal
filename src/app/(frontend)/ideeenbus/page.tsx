import { SiteHeader } from '@/components/SiteHeader'
import { IdeasForm } from './IdeasForm'
import './ideeenbus.css'

export const metadata = {
  title: 'Ideeënbus — Krachtbal Live',
  description: 'Deel een idee, aanpassing of probleem voor Krachtbal Live.',
}

export default function IdeeenbusPage() {
  return (
    <>
      <SiteHeader />
      <div className="site ideas-page">
        <span className="ideas-kicker">SAMEN BETER</span>
        <h1 className="page-title">💡 <span className="brand">Ideeënbus</span></h1>
        <p className="ideas-intro">
          Zie je iets dat slimmer, duidelijker of leuker kan? Laat het weten. Elk voorstel komt
          rechtstreeks bij de beheerder terecht en blijft bewaard tot het bekeken is.
        </p>
        <IdeasForm />
      </div>
    </>
  )
}
