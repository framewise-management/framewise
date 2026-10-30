export const defaultProductionStages=['Shoot Completed','Edited Photos','Raw Data Uploaded','Reels','Reel Changes','Countdown Photos','Cinematic Teaser','Cinematic Highlights','Traditional Video Groom','Traditional Video Bride','Album Groom','Album Bride','Single Album Both','Digital Invitation','Completed'];
export const legacyProductionStages=['Shoot Completed','Data Backup','Photo Culling','Photo Editing','Client Selection','Album Design','Album Approval','Film Editing','Final Delivery','Completed'];
export const projectStages=p=>p.stageNames||legacyProductionStages;
export const completedProjectStages=p=>p.completedStages|| (p.stage===projectStages(p).length-1?[...projectStages(p)]:projectStages(p).slice(0,Math.max(1,p.stage)));
export const projectComplete=p=>p.completedStages?p.completedStages.includes('Completed'):p.stage===projectStages(p).length-1;
