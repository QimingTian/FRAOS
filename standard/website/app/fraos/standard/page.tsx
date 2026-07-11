import { FraosTierPage, generateFraosTierMetadata } from '@/app/fraos/_tier-page'

export const metadata = generateFraosTierMetadata('standard')

export default function FraosStandardPage() {
  return <FraosTierPage plan="standard" />
}
