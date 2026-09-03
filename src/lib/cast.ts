// Gedeelde Chromecast-instellingen voor de zender (controle-toestel) en de
// ontvanger (de Chromecast zelf).
//
// CAST_APP_ID komt uit de Google Cast Developer Console. Registreer daar een
// "Custom Receiver" die wijst naar https://<jouw-domein>/cast-tv en plak de
// gegenereerde App ID in de env-variabele NEXT_PUBLIC_CAST_APP_ID.
// Zie docs/CHROMECAST.md voor de volledige opzet.
//
// `.trim()` is geen sierlijkheid: een lege variabele betekent "casten bestaat hier niet" en dan
// blijft de knop weg — precies goed. Maar een variabele die per ongeluk een spatie bevat, zou
// wél als ingesteld tellen, en dan staat er een knop die om een toestel vraagt en faalt. Niets
// tonen is beter dan een knop die niet werkt.
export const CAST_APP_ID = (process.env.NEXT_PUBLIC_CAST_APP_ID ?? '').trim()

// Eigen berichtkanaal tussen controle-toestel en Chromecast. Via dit kanaal
// stuurt de bediening welk scherm (welk pad) de Chromecast moet tonen.
export const CAST_NAMESPACE = 'urn:x-cast:be.krachtbal.cast'

// De ontvanger-pagina die elke Chromecast laadt. Achter dit ene scherm laden we
// per Chromecast een ander pad (veldscherm of kantinescherm) in een iframe.
export const CAST_RECEIVER_PATH = '/cast-tv'
