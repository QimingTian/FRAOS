import assert from 'node:assert/strict'
import test from 'node:test'
import {
  STORM_APPROACH_RADIUS_KM,
  isThunderstormWeatherCode,
  pickStormApproachThreat,
  pickWeatherSafetyThreat,
  precipThreatAtOrAbove,
  ringSampleCoordinates,
} from './weather-safety-estop.js'

test('isThunderstormWeatherCode accepts WMO thunder codes only', () => {
  assert.equal(isThunderstormWeatherCode(95), true)
  assert.equal(isThunderstormWeatherCode(61), false)
})

test('precipThreatAtOrAbove threshold', () => {
  assert.equal(precipThreatAtOrAbove(10), true)
  assert.equal(precipThreatAtOrAbove(9.9), false)
})

test('ringSampleCoordinates includes center plus bearings', () => {
  const points = ringSampleCoordinates(41.9159, -71.9626, STORM_APPROACH_RADIUS_KM, 8)
  assert.equal(points.length, 9)
  assert.equal(points[0]!.distanceKm, 0)
})

test('pickWeatherSafetyThreat prefers ASC rain', () => {
  const threat = pickWeatherSafetyThreat({ ascRainDetected: true, ringLocations: [] })
  assert.equal(threat?.kind, 'asc_rain')
})

test('pickStormApproachThreat flags 20 km thunder', () => {
  const hourStart = Date.parse('2026-07-10T02:00:00.000Z') / 1000
  const nowSec = hourStart + 5 * 60
  const threat = pickStormApproachThreat({
    nowSec,
    ringLocations: [
      {
        lat: 42.1,
        lon: -71.96,
        distanceKm: STORM_APPROACH_RADIUS_KM,
        hours: [
          { timeSec: hourStart, precipProbability: 40, weatherCode: 95 },
          { timeSec: hourStart + 3600, precipProbability: 10, weatherCode: 3 },
        ],
      },
    ],
  })
  assert.equal(threat?.kind, 'storm_approach')
})
