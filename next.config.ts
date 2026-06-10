import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)

const nextConfig: NextConfig = {
  // Sta dev-toegang toe vanaf het lokale netwerk (bv. tablet bij het veld).
  // Zonder dit blokkeert Next 16 in dev de client-runtime bij een niet-localhost origin,
  // waardoor de pagina niet hydrateert en knoppen niet reageren.
  allowedDevOrigins: ['192.168.0.65'],
  // ffmpeg-static levert een binaire ffmpeg (webm→mp4 voor replay-clips); niet mee bundelen,
  // anders klopt het pad naar de binary niet meer.
  serverExternalPackages: ['ffmpeg-static'],
  images: {
    localPatterns: [
      {
        pathname: '/api/media/file/**',
      },
    ],
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
  turbopack: {
    root: path.resolve(dirname),
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
