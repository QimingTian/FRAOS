import { FraosTierPage, generateFraosTierMetadata } from '@/app/fraos/_tier-page'

export const metadata = generateFraosTierMetadata('pro')

export default function FraosProPage() {
  return <FraosTierPage plan="pro" />
}
