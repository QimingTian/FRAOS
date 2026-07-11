import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateMosaicPanels,
  computeGridPanelLayoutDeltaPx,
  gridPathSteps,
  gridReferenceCell,
  screenCentroid,
} from './calculate-mosaic-panels'
import type { ImagingEquipment } from './equipment-types'

const TEST_EQUIPMENT: ImagingEquipment = {
  label: 'Test cam',
  sensorWidthPx: 6000,
  sensorHeightPx: 4000,
  pixelSizeUm: 3.76,
  focalLengthMm: 580,
  fieldRotationDeg: 0,
}

const BASE_INPUT = {
  centerRaHours: 12,
  centerDecDeg: 45,
  horizontalPanels: 2,
  verticalPanels: 2,
  horizontalOverlapPercent: 0.1,
  verticalOverlapPercent: 0.1,
  equipment: TEST_EQUIPMENT,
  viewportWidthPx: 1200,
  viewportHeightPx: 800,
  viewportHFovDeg: 4,
  viewportVFovDeg: 3,
  viewportRotationDeg: 15,
  previousRotationDeg: 0,
}

test('calculateMosaicPanels returns one panel when grid is 1×1', () => {
  const result = calculateMosaicPanels({
    ...BASE_INPUT,
    horizontalPanels: 1,
    verticalPanels: 1,
  })
  assert.equal(result.isMosaic, false)
  assert.equal(result.panels.length, 1)
  assert.equal(result.panels[0]!.raHours, BASE_INPUT.centerRaHours)
})

test('calculateMosaicPanels returns h×v panels for mosaic grid', () => {
  const result = calculateMosaicPanels(BASE_INPUT)
  assert.equal(result.isMosaic, true)
  assert.equal(result.panels.length, 4)
})

test('1×2 vertical mosaic: panels symmetric around geometric center', () => {
  const result = calculateMosaicPanels({
    ...BASE_INPUT,
    horizontalPanels: 1,
    verticalPanels: 2,
    viewportRotationDeg: 0,
    previousRotationDeg: 0,
  })
  assert.equal(result.panels.length, 2)
  const [p0, p1] = result.panels
  const midRa = (p0!.raHours + p1!.raHours) / 2
  const midDec = (p0!.decDeg + p1!.decDeg) / 2
  assert.ok(Math.abs(midRa - BASE_INPUT.centerRaHours) < 1e-6)
  assert.ok(Math.abs(midDec - BASE_INPUT.centerDecDeg) < 1e-4)
  const decSep = Math.abs(p0!.decDeg - p1!.decDeg)
  const layout = computeGridPanelLayoutDeltaPx(
    0,
    1,
    { horizontalPanels: 1, verticalPanels: 2, horizontalOverlapPercent: 0.1, verticalOverlapPercent: 0.1 },
    TEST_EQUIPMENT,
    BASE_INPUT.viewportWidthPx,
    BASE_INPUT.viewportHeightPx,
    (BASE_INPUT.viewportVFovDeg * Math.PI) / 180,
  )
  assert.ok(layout.layoutDeltaYPx > 0)
  assert.ok(decSep > 0)
})

test('vertical step uses separate Y conversion from sensor height', () => {
  const params = {
    horizontalPanels: 1,
    verticalPanels: 2,
    horizontalOverlapPercent: 0.1,
    verticalOverlapPercent: 0.1,
  }
  const vFovRad = (3 * Math.PI) / 180
  const row0 = computeGridPanelLayoutDeltaPx(0, 0, params, TEST_EQUIPMENT, 1200, 800, vFovRad)
  const row1 = computeGridPanelLayoutDeltaPx(0, 1, params, TEST_EQUIPMENT, 1200, 800, vFovRad)
  const sensorArcsec = (TEST_EQUIPMENT.pixelSizeUm / TEST_EQUIPMENT.focalLengthMm) * (206264.8062471 / 1000)
  const arcsecY = (3 * 3600) / 800
  const expectedStepY = TEST_EQUIPMENT.sensorHeightPx * 0.9 * (sensorArcsec / arcsecY)
  assert.ok(Math.abs(row1.layoutDeltaYPx - row0.layoutDeltaYPx - expectedStepY) < 1)
  assert.equal(row0.layoutDeltaXPx, 0)
  assert.equal(row1.layoutDeltaXPx, 0)
})

test('gridReferenceCell picks floor center cell', () => {
  assert.deepEqual(gridReferenceCell(1, 1), { col: 0, row: 0 })
  assert.deepEqual(gridReferenceCell(2, 2), { col: 0, row: 0 })
  assert.deepEqual(gridReferenceCell(3, 1), { col: 1, row: 0 })
})

test('gridPathSteps walks horizontal first then vertical', () => {
  assert.deepEqual(gridPathSteps(0, 0, 2, 1), [
    { dc: 1, dr: 0 },
    { dc: 1, dr: 0 },
    { dc: 0, dr: 1 },
  ])
})

test('fieldRotationDegAt is consulted at mosaic center for shifts', () => {
  let called = false
  const result = calculateMosaicPanels({
    ...BASE_INPUT,
    horizontalPanels: 2,
    verticalPanels: 1,
    fieldRotationDegAt: (raHours, decDeg) => {
      called = true
      assert.equal(raHours, BASE_INPUT.centerRaHours)
      assert.equal(decDeg, BASE_INPUT.centerDecDeg)
      return 33
    },
  })
  assert.equal(result.panels.length, 2)
  assert.ok(called)
})

test('screenCentroid averages panel screen offsets', () => {
  const c = screenCentroid([
    { x: 0, y: 0 },
    { x: 100, y: 200 },
    { x: -50, y: 100 },
  ])
  assert.ok(c)
  assert.equal(c!.x, 50 / 3)
  assert.equal(c!.y, 300 / 3)
})
