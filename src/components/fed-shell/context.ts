'use client'

import { createContext, useContext } from 'react'

// Staat deze pagina binnen de zijbalk van het federatieplatform? Dan trekt de gewone SiteHeader
// zich terug: de zijbalk en de topbalk nemen navigatie, meldingen en account over. Zo hoeven de
// ±40 federatiepagina's die zelf <SiteHeader> renderen niet aangepast te worden.
const FedShellContext = createContext(false)

export const FedShellProvider = FedShellContext.Provider
export const useInFedShell = (): boolean => useContext(FedShellContext)
