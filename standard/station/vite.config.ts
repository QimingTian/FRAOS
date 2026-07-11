import path from 'node:path'
import fs from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function resolveTenantConfigPath(): string {
  const root = path.resolve(__dirname, '..')
  const prod = path.join(root, 'build-config/tenant.json')
  const dev = path.join(root, 'build-config/tenant.dev.json')
  return fs.existsSync(prod) ? prod : dev
}

export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
      '@tenant-config': resolveTenantConfigPath(),
    },
  },
  clearScreen: false,
  server: {
    port: 1422,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
}))
