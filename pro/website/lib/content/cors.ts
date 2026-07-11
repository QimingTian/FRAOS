import { NextResponse } from 'next/server'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
}

export function contentOptions() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export function contentJson<T extends object>(body: T, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS })
}
