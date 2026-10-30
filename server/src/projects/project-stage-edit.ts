import { ProductionStages } from '@framewise/shared/production-stages.ts'
import type { Row } from '../db/database.ts'
import type { ProjectRow } from '../db/rows.ts'
import { HttpError } from '../http/http-error.ts'

export class ProjectStageEdit {
  // legacy project update: moving the stage marks earlier stages done; renaming the stage list keeps the current stage
  // and moves done stages that were dropped into retired_completed_stages
  static apply(row: ProjectRow & { retired_completed_stages?: string[] }, patch: Row): Row {
    const list = ProductionStages.of({ stage: row.stage, stageNames: row.stage_names })
    const v: Row = { ...patch }
    if ('stage' in v && !('completed_stages' in v) && !('stage_names' in v)) {
      const index = v.stage as number
      v.completed_stages = index === list.length - 1 ? [...list] : list.slice(0, Math.max(1, index))
    }
    if ('completed_stages' in v) {
      const done = v.completed_stages
      if (!Array.isArray(done) || new Set(done).size !== done.length || done.some(s => !list.includes(s))) throw new HttpError(400, 'Invalid completed project items')
    }
    if ('stage_names' in v) {
      const next = v.stage_names
      if (!Array.isArray(next) || next[0] !== 'Shoot Completed' || next.at(-1) !== 'Completed' || next.length < 2 || next.length > 50
          || next.some(s => typeof s !== 'string' || !s.trim()) || new Set(next).size !== next.length)
        throw new HttpError(400, 'Use unique stages between Shoot Completed and Completed')
      const current = list[row.stage]
      if (!next.includes(current)) throw new HttpError(400, 'Keep the current stage: ' + current)
      const done = ProductionStages.completed({ stage: row.stage, stageNames: row.stage_names, completedStages: row.completed_stages })
      v.stage = next.indexOf(current)
      v.completed_stages = done.filter(s => next.includes(s))
      v.retired_completed_stages = [...(row.retired_completed_stages || []), ...done.filter(s => !next.includes(s))]
    }
    if ('stage' in v) {
      const stage = v.stage as number
      if (!Number.isInteger(stage) || stage < 0 || stage >= ((v.stage_names as string[] | undefined) || list).length) throw new HttpError(400, 'Invalid production stage')
    }
    return v
  }
}
