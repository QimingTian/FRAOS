import type { NextConfig } from 'next'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  outputFileTracingIncludes: {
    '/api/imaging/variable-stars': ['./Variables/**/*'],
  },
  async redirects() {
    return [
      { source: '/', destination: '/fraos', permanent: true },
      { source: '/products', destination: '/fraos', permanent: true },
      { source: '/products/personal', destination: '/fraos/standard', permanent: true },
      { source: '/products/organization', destination: '/fraos/ultra', permanent: true },
      { source: '/fraos/personal', destination: '/fraos/standard', permanent: true },
      { source: '/fraos/organization', destination: '/fraos/ultra', permanent: true },
      { source: '/products/standard', destination: '/fraos/standard', permanent: true },
      { source: '/products/pro', destination: '/fraos/pro', permanent: true },
      { source: '/products/max', destination: '/fraos/max', permanent: true },
      { source: '/products/ultra', destination: '/fraos/ultra', permanent: true },
    ]
  },
}

export default nextConfig
