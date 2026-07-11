import type { VariableStarFilterUi } from './types'

export const FILTER_OPTIONS = [
  { value: 'L', label: 'Luminance' },
  { value: 'R', label: 'Red' },
  { value: 'G', label: 'Green' },
  { value: 'B', label: 'Blue' },
  { value: 'S', label: 'Sulfur' },
  { value: 'H', label: 'Hydrogen' },
  { value: 'O', label: 'Oxygen' },
] as const

export const VARIABLE_STAR_FILTER_PRESETS: ReadonlyArray<{
  value: VariableStarFilterUi
  label: string
}> = [
  { value: 'tonight_observable', label: 'Tonight Observable' },
  { value: 'high_priority', label: 'High Priority' },
  { value: 'short_period', label: 'Short Period' },
  { value: 'mid_period', label: 'Mid Period (1-100 Days)' },
  { value: 'long_period', label: 'Long Period (100+ Days)' },
  { value: 'type_na', label: 'Type: NA (Nova)' },
  { value: 'type_lc', label: 'Type: LC (Irregular Slow)' },
  { value: 'type_m', label: 'Type: M (Mira)' },
  { value: 'type_src', label: 'Type: SRC (Semiregular Supergiant)' },
  { value: 'type_ea', label: 'Type: EA (Algol Eclipsing Binary)' },
]
