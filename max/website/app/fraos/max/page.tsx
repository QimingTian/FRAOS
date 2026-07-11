import { FraosTierPage, generateFraosTierMetadata } from '@/app/fraos/_tier-page'

export const metadata = generateFraosTierMetadata('max')

export default function FraosMaxPage() {
  return <FraosTierPage plan="max" />
}
