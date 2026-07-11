import { NextRequest } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { contentOptions } from '@/lib/content/cors'

export const runtime = 'nodejs'

const MODEL_ROOT = path.join(process.cwd(), 'public', 'telescope-models')
const ALLOWED_MODELS = new Set([
  'Default.obj',
  'Reflector.obj',
  'Refractor.obj',
  'SchmidtCassegrain.obj',
  'RitcheyChretien.obj',
  'RitcheyChretienTruss.obj',
])

export function OPTIONS() {
  return contentOptions()
}

export async function GET(request: NextRequest) {
  const model = request.nextUrl.searchParams.get('model') ?? 'Reflector.obj'
  if (!ALLOWED_MODELS.has(model)) {
    return new Response(JSON.stringify({ ok: false, error: 'Unknown model' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }

  const fullPath = path.join(MODEL_ROOT, model)
  try {
    const content = await fs.readFile(fullPath, 'utf8')
    return new Response(content, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Model file not found' }), {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
}
