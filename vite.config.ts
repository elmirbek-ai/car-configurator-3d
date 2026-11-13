import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Keep development candidates in public/ for inspection, but publish only runtime assets.
const releaseAssets = [
  'models/CarConcept.glb',
  'models/candidates/ToyotaCamry2018_WheelLOD_v1.glb',
  'models/candidates/bmw-m5-f90/bmw_m5_f90.glb',
  'basis/basis_transcoder.js',
  'basis/basis_transcoder.wasm',
  'basis/LICENSE',
  'basis/NOTICE',
] as const

export default defineConfig({
  plugins: [react(), {
    name: 'release-public-assets',
    apply: 'build',
    generateBundle() {
      for (const fileName of releaseAssets) {
        this.emitFile({ type: 'asset', fileName, source: readFileSync(resolve('public', fileName)) })
      }
    },
  }],
  build: { copyPublicDir: false },
})
