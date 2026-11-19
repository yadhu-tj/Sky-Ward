import fs from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const MEDIAPIPE_HANDS_FILES = [
  'hands.js',
  'hands.binarypb',
  'hand_landmark_lite.tflite',
  'hand_landmark_full.tflite',
  'hands_solution_packed_assets.data',
  'hands_solution_packed_assets_loader.js',
  'hands_solution_simd_wasm_bin.data',
  'hands_solution_simd_wasm_bin.js',
  'hands_solution_simd_wasm_bin.wasm',
  'hands_solution_wasm_bin.js',
  'hands_solution_wasm_bin.wasm',
] as const

const MEDIAPIPE_MIME_TYPES: Record<string, string> = {
  '.js': 'application/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.tflite': 'application/octet-stream',
  '.binarypb': 'application/octet-stream',
}

function mediapipeHandsAssetsPlugin(): Plugin {
  const sourceDir = path.resolve(process.cwd(), 'node_modules/@mediapipe/hands')
  const allowedFiles = new Set<string>(MEDIAPIPE_HANDS_FILES)

  return {
    name: 'mediapipe-hands-same-origin-assets',
    configureServer(server) {
      server.middlewares.use('/mediapipe/hands', (req, res, next) => {
        const cleanUrl = (req.url || '').split('?')[0].replace(/^\/+/, '')
        const fileName = path.basename(cleanUrl)
        if (!fileName || !allowedFiles.has(fileName)) {
          next()
          return
        }
        const filePath = path.join(sourceDir, fileName)
        if (!fs.existsSync(filePath)) {
          next()
          return
        }
        const ext = path.extname(fileName)
        res.setHeader('Content-Type', MEDIAPIPE_MIME_TYPES[ext] || 'application/octet-stream')
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        fs.createReadStream(filePath).pipe(res)
      })
    },
    writeBundle(options) {
      const outDir = options.dir ? path.resolve(options.dir) : path.resolve(process.cwd(), 'dist')
      const targetDir = path.join(outDir, 'mediapipe', 'hands')
      fs.mkdirSync(targetDir, { recursive: true })
      for (const fileName of MEDIAPIPE_HANDS_FILES) {
        const src = path.join(sourceDir, fileName)
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(targetDir, fileName))
        }
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), mediapipeHandsAssetsPlugin()],
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
})
