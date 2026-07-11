import { CheckoutSuccessView } from '@/components/checkout/CheckoutSuccessView'

const previewPayload = {
  displayName: 'Riverside Observatory',
  tenantId: 'personal-riverside-a1b2c3',
  tenantConfigUrl: '#',
  downloads: {
    controlMac: '/releases/borean-control-preview.dmg',
    controlWindows: '/releases/borean-control-preview.exe',
    stationWindows: '/releases/borean-station-preview.exe',
  },
}

export default function CheckoutSuccessPreviewPage() {
  return <CheckoutSuccessView payload={previewPayload} />
}
