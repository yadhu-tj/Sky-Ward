import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { readFileSync, readdirSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

function mediaPipeRuntime(): Plugin {
  const root = dirname(createRequire(import.meta.url).resolve('@mediapipe/hands'))
  const names = readdirSync(root).filter(name => /\.(wasm|data|tflite|binarypb)$/.test(name) || /^hands_solution_.*\.js$/.test(name))
  const prefix = 'mediapipe/hands-0.4.1675469240-gz1/'
  return {
    name: 'mediapipe-runtime',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = (request.url ?? '').split('?')[0]
        if (!path.startsWith('/' + prefix)) return next()
        const name = path.slice(prefix.length + 1)
        if (!names.includes(name)) return next()
        response.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : name.endsWith('.js') ? 'application/javascript' : 'application/octet-stream')
        response.end(readFileSync(join(root, name)))
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        if ((request.url ?? '').startsWith('/' + prefix)) response.setHeader('Content-Encoding', 'gzip')
        next()
      })
    },
    generateBundle() {
      for (const name of names) this.emitFile({ type: 'asset', fileName: prefix + name, source: gzipSync(readFileSync(join(root, name)), { level: 9 }) })
    },
  }
}

export default defineConfig({
  plugins: [react(), mediaPipeRuntime()],
  build: { assetsInlineLimit: 0 },
  server: { host: '0.0.0.0', port: 3000 },
})
