import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

import { getPayloadClient } from '@/lib/payload-client'

// Eigen wachtwoord wijzigen. Vereist het huidige wachtwoord (geverifieerd via een login-poging),
// zodat een gekaapte sessie het wachtwoord niet zomaar kan overschrijven.
export async function POST(req: Request) {
  const payload = await getPayloadClient()
  const { user } = await payload.auth({ headers: await headers() }).catch(() => ({ user: null }))
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  let body: { currentPassword?: unknown; newPassword?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  }

  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''
  if (newPassword.length < 8) return NextResponse.json({ error: 'Nieuw wachtwoord moet minstens 8 tekens zijn.' }, { status: 400 })

  const email = (user as { email?: string }).email
  if (!email) return NextResponse.json({ error: 'Geen e-mail bekend voor dit account.' }, { status: 400 })

  // Huidig wachtwoord verifiëren.
  const ok = await payload
    .login({ collection: 'users', data: { email, password: currentPassword } })
    .then(() => true)
    .catch(() => false)
  if (!ok) return NextResponse.json({ error: 'Huidig wachtwoord klopt niet.' }, { status: 400 })

  await payload.update({ collection: 'users', id: (user as { id: number }).id, data: { password: newPassword }, overrideAccess: true })
  return NextResponse.json({ ok: true })
}
