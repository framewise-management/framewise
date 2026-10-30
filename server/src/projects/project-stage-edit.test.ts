import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ProductionStages } from '@framewise/shared/production-stages.ts'
import type { Row } from '../db/database.ts'
import type { ProjectRow } from '../db/rows.ts'
import { ProjectStageEdit } from './project-stage-edit.ts'

const { Store } = await import(new URL('../../../legacy/dist/store.js', import.meta.url).href)

const defaults = [...ProductionStages.defaults]

test('stage edits match legacy project updates, errors included', () => {
  const cases: [Partial<ProjectRow> & { retired_completed_stages?: string[] }, Row][] = [
    [{ stage: 0, completed_stages: ['Shoot Completed'] }, { stage: 3 }],
    [{ stage: 3, completed_stages: defaults.slice(0, 3) }, { stage: 14 }],
    [{ stage: 3, completed_stages: defaults.slice(0, 3) }, { stage: 0 }],
    [{ stage: 2, completed_stages: ['Shoot Completed'] }, { completed_stages: ['Shoot Completed', 'Reels', 'Completed'] }],
    [{ stage: 2, completed_stages: ['Shoot Completed'] }, { completed_stages: ['Shoot Completed', 'Nope'] }],
    [{ stage: 2, completed_stages: ['Shoot Completed'] }, { completed_stages: ['Reels', 'Reels'] }],
    [{ stage: 2, completed_stages: ['Shoot Completed', 'Edited Photos'] }, { stage_names: ['Shoot Completed', 'Raw Data Uploaded', 'Album', 'Completed'] }],
    [{ stage: 2, completed_stages: ['Shoot Completed', 'Edited Photos'], retired_completed_stages: ['Old'] }, { stage_names: ['Shoot Completed', 'Raw Data Uploaded', 'Completed'] }],
    [{ stage: 2, completed_stages: ['Shoot Completed'] }, { stage_names: ['Shoot Completed', 'Completed'] }],
    [{ stage: 0, completed_stages: ['Shoot Completed'] }, { stage_names: ['Shoot Completed', 'A', 'A', 'Completed'] }],
    [{ stage: 0, completed_stages: ['Shoot Completed'] }, { stage_names: ['A', 'Completed'] }],
    [{ stage: 0, completed_stages: ['Shoot Completed'] }, { stage: 15 }],
    [{ stage: 0, completed_stages: ['Shoot Completed'] }, { stage: 1.5 }],
    [{ stage: 0, completed_stages: ['Shoot Completed'] }, { notes: 'just notes', due: '2026-11-01' }],
  ]
  for (const [over, patch] of cases) {
    const row = { id: 'p1', event_id: 'e1', stage_names: defaults, completed_stages: [], ...over } as ProjectRow & { retired_completed_stages?: string[] }
    assert.deepEqual(ported(row, patch), legacy(row, patch), JSON.stringify(patch))
  }
})

function ported(row: ProjectRow & { retired_completed_stages?: string[] }, patch: Row) {
  try {
    const v = { ...row, ...ProjectStageEdit.apply(row, patch) }
    return { stage: v.stage, done: v.completed_stages, names: v.stage_names, retired: v.retired_completed_stages ?? [] }
  } catch (e) {
    return (e as Error).message
  }
}

function legacy(row: ProjectRow & { retired_completed_stages?: string[] }, patch: Row) {
  const values = new Map<string, string>()
  const store = new Store({ getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) })
  store.data.clients = [{ id: 'c1', status: 'Booked' }]
  store.data.events = [{ id: 'e1', client: 'c1', status: 'Shoot Completed', bookingStatus: '' }]
  store.data.projects = [{ id: 'p1', event: 'e1', stage: row.stage, stageNames: [...row.stage_names], completedStages: [...row.completed_stages], ...(row.retired_completed_stages ? { retiredCompletedStages: row.retired_completed_stages } : {}) }]
  const value: Row = {}
  for (const [k, v] of Object.entries(patch)) value[({ stage_names: 'stageNames', completed_stages: 'completedStages' } as Record<string, string>)[k] ?? k] = v
  try {
    store.update('projects', 'p1', value)
  } catch (e) {
    return (e as Error).message
  }
  const p = store.data.projects[0]
  return { stage: p.stage, done: p.completedStages, names: p.stageNames, retired: p.retiredCompletedStages ?? [] }
}
