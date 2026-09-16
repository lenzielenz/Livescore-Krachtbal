import Link from 'next/link'

// Zichtbare, uitnodigende poort naar het bonusrad — vroeger stond hier enkel een kaal tekstlinkje
// midden in een zin. Toont ook meteen de eigen status (beurten over, boosters klaar, in de wacht)
// zodat het niet zomaar reclame is, maar ECHT iets om voor terug te komen.
export function RadTeaser({
  loggedIn,
  eligible,
  spinsLeft,
  heldTokensCount,
  winnerCount,
}: {
  loggedIn: boolean
  eligible: boolean
  spinsLeft: number
  heldTokensCount: number
  winnerCount: number
}) {
  const status = !loggedIn
    ? {
        kicker: 'MAAK KANS',
        title: 'Speel mee voor het bonusrad',
        body: 'Voorspel mee op een livewedstrijd en knok je naar de top — de besten van het weekend mogen aan het rad draaien.',
        cta: 'Bekijk het rad →',
        href: '/pronostiek/rad',
      }
    : spinsLeft > 0
      ? {
          kicker: 'JIJ MAG DRAAIEN',
          title: `Je hebt nog ${spinsLeft}× beurt${spinsLeft === 1 ? '' : 'en'}!`,
          body: 'Draai nu aan het rad en win een vermenigvuldiger voor je volgende voorspelling.',
          cta: '🎡 Draai nu →',
          href: '/pronostiek/rad',
        }
      : heldTokensCount > 0
        ? {
            kicker: 'BOOSTERS KLAAR',
            title: `Je hebt ${heldTokensCount} booster${heldTokensCount === 1 ? '' : 's'} klaarliggen`,
            body: 'Gebruik ze bij je volgende voorspelling — jij kiest zelf welke wedstrijd.',
            cta: 'Bekijk je boosters →',
            href: '/pronostiek/rad',
          }
        : eligible
          ? {
              kicker: 'TOT VOLGENDE WEEK',
              title: 'Je beurten zijn op',
              body: 'Eindig opnieuw bij de besten van het weekend om volgende week weer te mogen draaien.',
              cta: 'Naar het rad →',
              href: '/pronostiek/rad',
            }
          : {
              kicker: 'MAAK KANS',
              title: 'Speel mee voor het bonusrad',
              body: `Enkel de top ${winnerCount || ''} van het weekend mag draaien. Voorspel mee en knok je naar boven!`,
              cta: 'Bekijk het rad →',
              href: '/pronostiek/rad',
            }

  return (
    <Link href={status.href} className="radteaser">
      <div className="radteaser-wheel" aria-hidden>
        <span className="radteaser-spark s1">✦</span>
        <span className="radteaser-spark s2">✦</span>
        <span className="radteaser-spark s3">✦</span>
        <div className="radteaser-ring" />
        <div className="radteaser-hub">🎰</div>
      </div>
      <div className="radteaser-copy">
        <span className="radteaser-kicker">{status.kicker}</span>
        <h2>{status.title}</h2>
        <p>{status.body}</p>
        <span className="radteaser-cta">{status.cta}</span>
      </div>
    </Link>
  )
}
