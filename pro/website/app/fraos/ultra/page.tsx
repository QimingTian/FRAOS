import { FraosTierPage, generateFraosTierMetadata } from '@/app/fraos/_tier-page'

export const metadata = generateFraosTierMetadata('ultra')

export default function FraosUltraPage() {
  return <FraosTierPage plan="ultra" />
}
