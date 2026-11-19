import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { readFileSync, readdirSync } from 'node:fs'

function mediaPipeRuntime(): Plugin {
  const root = dirname(createRequire(import.meta.url).resolve('@mediapipe/hands'))
  const names = readdirSync(root).filter(name => /\.(wasm|data|tflite|binarypb)$/.test(name) || /^hands_solution_.*\.js$/.test(name))
  const prefix = 'mediapipe/hands-0.4.1675469240/'
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
    generateBundle() {
      for (const name of names) this.emitFile({ type: 'asset', fileName: prefix + name, source: readFileSync(join(root, name)) })
    },
  }
}

export default defineConfig({
  plugins: [react(), mediaPipeRuntime()],
  build: { assetsInlineLimit: 0 },
  server: { host: '0.0.0.0', port: 3000 },
})
