// Een gewone e-mail versturen via Resend (zelfde dienst als het wedstrijdblad, lib/submit/mail.ts).
// Zonder RESEND_API_KEY gebeurt er niets en meldt de functie dat: de aanroeper valt dan terug op een
// link die iemand zelf doorgeeft. Nooit de inhoud loggen — een uitnodiging bevat een geheime link.

export type MailUitkomst = { verstuurd: boolean; reden?: string }

export async function stuurMail(opts: { aan: string; onderwerp: string; html: string }): Promise<MailUitkomst> {
  const apiKey = process.env.RESEND_API_KEY
  const van = process.env.PLATFORM_MAIL_FROM || process.env.MATCHSHEET_MAIL_FROM || 'noreply@krachtbal.be'
  if (!apiKey) return { verstuurd: false, reden: 'geen-mailconfiguratie' }
  if (!opts.aan.includes('@')) return { verstuurd: false, reden: 'geen-adres' }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: van, to: [opts.aan], subject: opts.onderwerp, html: opts.html }),
    })
    return res.ok ? { verstuurd: true } : { verstuurd: false, reden: `http-${res.status}` }
  } catch {
    return { verstuurd: false, reden: 'netwerk' }
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

/** De uitnodiging voor een nieuw lid: link om zelf een wachtwoord te kiezen. */
export function uitnodigingHtml(naam: string, club: string, link: string): string {
  return `<p>Dag ${esc(naam)},</p>
<p>Je registratie bij ${esc(club)} is goedgekeurd door de federatie. Je hebt nu een eigen login op Krachtbal Live:
je ziet er je wedstrijden, je medische keuring en je kan je medische kaart aanvragen.</p>
<p><a href="${esc(link)}">Kies hier je wachtwoord</a> (de link is 7 dagen geldig).</p>
<p>Sportieve groeten,<br>KVKBF</p>`
}

/** De uitnodiging voor een ouder: login met het dossier van het kind. */
export function ouderUitnodigingHtml(kind: string, club: string, link: string): string {
  return `<p>Dag,</p>
<p>${esc(club)} gaf je e-mailadres op als ouder van ${esc(kind)}. Je hebt nu een login op Krachtbal Live:
je ziet er het spelersdossier van ${esc(kind)}, je voert de medische keuring in en je vraagt de medische kaart aan.</p>
<p><a href="${esc(link)}">Kies hier je wachtwoord</a> (de link is 7 dagen geldig).</p>
<p>Sportieve groeten,<br>KVKBF</p>`
}
