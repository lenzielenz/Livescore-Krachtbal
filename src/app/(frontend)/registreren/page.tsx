import { SiteHeader } from '@/components/SiteHeader'
import { RegisterForm } from './RegisterForm'
import '../wedstrijdblad.css'

export const dynamic = 'force-dynamic'

// Publieke supporter-registratie: een gratis account om wedstrijden mee te volgen.
export default function RegistrerenPage() {
  return (
    <>
      <SiteHeader active={null} />
      <div className="site">
        <h1 className="page-title">
          <span className="brand">Registreren</span>
        </h1>
        <p className="wb-intro">
          Maak een gratis account aan om krachtbalwedstrijden mee te volgen. Ben je clubmedewerker,
          scheidsrechter of van de federatie? Registreer je gerust ook — een beheerder kent je daarna
          de juiste rol toe.
        </p>
        <RegisterForm />
      </div>
    </>
  )
}
