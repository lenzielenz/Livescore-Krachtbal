import { redirect } from 'next/navigation'

// De homepagina is het flashscore-stijl live-bord (zie /live).
export default function HomePage() {
  redirect('/live')
}
