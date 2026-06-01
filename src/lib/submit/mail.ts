// Mailt het PDF-wedstrijdblad naar de clubs (Resend, dezelfde aanpak als LenzieLenz).
// Werkt als stub wanneer RESEND_API_KEY ontbreekt — dan wordt enkel gelogd, geen fout.

export type MailResult = { sent: boolean; reason?: string; ids?: string[] }

export async function mailMatchSheet(opts: {
  to: string[]
  subject: string
  html: string
  pdf: Uint8Array
  filename: string
}): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.MATCHSHEET_MAIL_FROM || 'wedstrijdblad@krachtbal.be'
  const recipients = opts.to.filter((t) => typeof t === 'string' && t.includes('@'))

  if (!apiKey) {
    console.info('[mailMatchSheet] RESEND_API_KEY ontbreekt — mail overgeslagen (stub).', {
      to: recipients,
      subject: opts.subject,
    })
    return { sent: false, reason: 'no-api-key' }
  }
  if (recipients.length === 0) {
    return { sent: false, reason: 'no-recipients' }
  }

  const base64 = Buffer.from(opts.pdf).toString('base64')
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: recipients,
      subject: opts.subject,
      html: opts.html,
      attachments: [{ filename: opts.filename, content: base64 }],
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { sent: false, reason: `resend-${res.status}: ${text.slice(0, 200)}` }
  }
  const json = (await res.json().catch(() => ({}))) as { id?: string }
  return { sent: true, ids: json.id ? [json.id] : [] }
}
