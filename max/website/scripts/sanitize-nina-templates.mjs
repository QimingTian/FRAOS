#!/usr/bin/env node
/**
 * Strip Pomfret/Discord from NINA sequence JSON templates.
 * HTTP session-progress URLs and auth are injected at runtime by nina-sequence-json.ts.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const PLACEHOLDER_URI = 'https://session-progress.invalid/placeholder'

function isDiscordNode(obj) {
  const type = obj?.$type
  return typeof type === 'string' && type.includes('DiscordAlert')
}

function isHttpClientNode(obj) {
  const type = obj?.$type
  return typeof type === 'string' && type.includes('GroundStation.HTTP.HttpClient')
}

function walk(value) {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const item of value) walk(item)
    return
  }
  const rec = value
  if (Array.isArray(rec.$values)) {
    rec.$values = rec.$values.filter((item) => !isDiscordNode(item))
    for (const item of rec.$values) walk(item)
  }
  if (isHttpClientNode(rec) && typeof rec.HttpUri === 'string' && rec.HttpUri.includes('session-progress')) {
    rec.HttpUri = PLACEHOLDER_URI
    rec.HttpAuthUsername = ''
    rec.HttpAuthPassword = ''
  }
  for (const child of Object.values(rec)) {
    if (child && typeof child === 'object') walk(child)
  }
}

function sanitizeFile(filePath) {
  const raw = readFileSync(filePath, 'utf8')
  const data = JSON.parse(raw)
  walk(data)
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  console.log('sanitized', filePath)
}

const roots = process.argv.slice(2)
if (roots.length === 0) {
  console.error('Usage: node sanitize-nina-templates.mjs <dir-or-file>...')
  process.exit(1)
}

for (const root of roots) {
  const st = statSync(root)
  if (st.isFile() && root.endsWith('.json')) {
    sanitizeFile(root)
    continue
  }
  if (!st.isDirectory()) continue
  for (const name of readdirSync(root)) {
    if (!name.endsWith('.json')) continue
    sanitizeFile(join(root, name))
  }
}
