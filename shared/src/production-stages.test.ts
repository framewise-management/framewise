import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ProductionStages, type ProductionProject } from './production-stages.ts'

const legacy = await import(new URL('../../legacy/dist/production.js', import.meta.url).href)

test('stage lists match legacy', () => {
  assert.deepEqual(ProductionStages.defaults, legacy.defaultProductionStages)
  assert.deepEqual(ProductionStages.legacy, legacy.legacyProductionStages)
})

test('stages, completed stages and completion match legacy', () => {
  const projects: ProductionProject[] = [
    { stage: 0 },
    { stage: 3 },
    { stage: 9 },
    { stage: 2, stageNames: ProductionStages.defaults },
    { stage: 14, stageNames: ProductionStages.defaults },
    { stage: 0, stageNames: ['Shoot Completed', 'Completed'] },
    { stage: 1, stageNames: ['Shoot Completed', 'Album', 'Completed'], completedStages: ['Shoot Completed', 'Completed'] },
    { stage: 1, completedStages: ['Shoot Completed'] },
  ]
  for (const p of projects) {
    assert.deepEqual(ProductionStages.of(p), legacy.projectStages(p), JSON.stringify(p))
    assert.deepEqual(ProductionStages.completed(p), legacy.completedProjectStages(p), JSON.stringify(p))
    assert.equal(ProductionStages.isComplete(p), legacy.projectComplete(p), JSON.stringify(p))
  }
})
