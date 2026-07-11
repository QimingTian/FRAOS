#!/usr/bin/env node
/**
 * Regenerate Tauri icon sets for Control Client + Station from shared/app-icon-source.png
 * Source icon is cropped from general-platforms/BOREAN LOGO.png (B mark only, no wordmark).
 *
 * To rebuild source PNG from logo:
 *   python3 scripts/extract-app-icon-source.py
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const standardRoot = path.resolve(__dirname, '..')
const source = path.join(standardRoot, 'shared/app-icon-source.png')

const apps = ['control-client', 'station']

for (const app of apps) {
  const cwd = path.join(standardRoot, app)
  const out = path.join(cwd, 'src-tauri/icons')
  console.log(`Generating icons for ${app}…`)
  const result = spawnSync('npx', ['tauri', 'icon', source, '-o', out], {
    cwd,
    stdio: 'inherit',
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

console.log('Done.')
