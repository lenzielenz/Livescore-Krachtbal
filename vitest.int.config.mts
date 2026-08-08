import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

// Config voor `pnpm test:int`. Identiek aan vitest.config.mts, met één verschil:
// `fileParallelism: false`.
//
// De integratietests praten allemaal met dezelfde lokale SQLite-database. Draaien ze in
// parallelle workers, dan botsen ze op elkaars schrijfslot ("SQLITE_BUSY: database is locked")
// en faalt er willekeurig één suite — een valse rode build. Eén bestand tegelijk lost dat op.
// De unit tests (pnpm test:unit) raken de database niet en blijven dus wél parallel draaien.
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/int/**/*.int.spec.ts', 'tests/unit/**/*.unit.spec.ts'],
    fileParallelism: false,
  },
})
