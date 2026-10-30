// Builds and deploys Framewise to Vercel production.
// The ids are passed explicitly because the Vercel CLI otherwise links from the git root (the Wedding Tapes repo) and would use its project.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const { orgId, projectId } = JSON.parse(readFileSync('.vercel/project.json', 'utf8'))
const env = { ...process.env, VERCEL_ORG_ID: orgId, VERCEL_PROJECT_ID: projectId }
execSync('node scripts/build-vercel.mjs', { stdio: 'inherit' })
execSync('vercel deploy --prebuilt --prod --yes', { stdio: 'inherit', env })
