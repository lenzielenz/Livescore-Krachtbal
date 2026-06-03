'use client'

// Brug naar de externe Google Cast Receiver-SDK, die geen TypeScript-types meelevert.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from 'react'

import { CAST_NAMESPACE } from '@/lib/cast'

const RECEIVER_SDK = 'https://www.gstatic.com/cast/sdk/libs/caf_receiver/v3/cast_receiver_framework.js'

// De Chromecast-ontvanger. Ze start de Cast-receiverframework, luistert op ons
// eigen berichtkanaal en toont het pad dat het controle-toestel doorstuurt
// (bv. /veld/12 of /kantine/scherm) in een schermvullend iframe. Eén undefined
// idle-timeout houdt het scherm aan, ook al speelt er geen media.
export function CastReceiver() {
  const [src, setSrc] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    const start = () => {
      const cast = (window as any).cast
      if (!cast?.framework?.CastReceiverContext) return
      const context = cast.framework.CastReceiverContext.getInstance()
      context.addCustomMessageListener(CAST_NAMESPACE, (event: any) => {
        const path = event?.data?.path
        // Alleen interne, absolute paden toelaten — nooit een externe URL.
        if (typeof path === 'string' && path.startsWith('/')) setSrc(path)
      })
      const options = new cast.framework.CastReceiverOptions()
      options.disableIdleTimeout = true
      options.customNamespaces = { [CAST_NAMESPACE]: cast.framework.system.MessageType.JSON }
      context.start(options)
    }

    if ((window as any).cast?.framework) {
      start()
    } else {
      const s = document.createElement('script')
      s.src = RECEIVER_SDK
      s.onload = start
      document.head.appendChild(s)
    }
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#06140d' }}>
      {src ? (
        <iframe
          key={src}
          src={src}
          title="Krachtbal scherm"
          style={{ border: 0, width: '100%', height: '100%', display: 'block' }}
        />
      ) : (
        <div
          style={{
            display: 'grid',
            placeItems: 'center',
            height: '100%',
            color: '#e8f5ee',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '7vmin', fontWeight: 800 }}>
              Krachtbal <span style={{ color: '#ffd166' }}>Live</span>
            </div>
            <p style={{ fontSize: '3vmin', opacity: 0.75, marginTop: '1.5vmin' }}>Verbonden — wacht op scherm…</p>
          </div>
        </div>
      )}
    </div>
  )
}
