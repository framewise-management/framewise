export interface ProductionProject {
  stage: number
  stageNames?: readonly string[]
  completedStages?: readonly string[]
}

export class ProductionStages {
  static readonly defaults: readonly string[] = ['Shoot Completed', 'Edited Photos', 'Raw Data Uploaded', 'Reels', 'Reel Changes', 'Countdown Photos', 'Cinematic Teaser', 'Cinematic Highlights', 'Traditional Video Groom', 'Traditional Video Bride', 'Album Groom', 'Album Bride', 'Single Album Both', 'Digital Invitation', 'Completed']
  // projects saved before custom stages existed have no stageNames
  static readonly legacy: readonly string[] = ['Shoot Completed', 'Data Backup', 'Photo Culling', 'Photo Editing', 'Client Selection', 'Album Design', 'Album Approval', 'Film Editing', 'Final Delivery', 'Completed']

  static forBooking(): string[] { return ['Upcoming', ...ProductionStages.defaults] }

  static validStart(stages: readonly string[]): boolean {
    return stages[0] === 'Shoot Completed' || (stages[0] === 'Upcoming' && stages[1] === 'Shoot Completed')
  }

  static of(p: ProductionProject): readonly string[] {
    return p.stageNames || ProductionStages.legacy
  }

  // older projects only stored a stage index; everything before it counts as done
  static completed(p: ProductionProject): string[] {
    if (p.completedStages) return [...p.completedStages]
    const stages = ProductionStages.of(p)
    return p.stage === stages.length - 1 ? [...stages] : stages.slice(0, Math.max(1, p.stage))
  }

  static isComplete(p: ProductionProject): boolean {
    return p.completedStages ? p.completedStages.includes('Completed') : p.stage === ProductionStages.of(p).length - 1
  }
}
