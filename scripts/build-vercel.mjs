// Builds .vercel/output (Vercel Build Output API v3) for `vercel deploy --prebuilt`:
// the React app as static files and the Express server bundled into one Node function in Mumbai, next to Supabase.
import { execSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { build } from 'esbuild'

const out = '.vercel/output'
const fn = `${out}/functions/api.func`
rmSync(out, { recursive: true, force: true })

execSync('pnpm --filter @framewise/client build', { stdio: 'inherit' })
cpSync('client/dist', `${out}/static`, { recursive: true })

await build({
  entryPoints: ['server/src/vercel.ts'],
  outfile: `${fn}/index.mjs`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // bundled CommonJS dependencies (express) still call require()
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
})
writeFileSync(`${fn}/.vc-config.json`, JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', regions: ['bom1'], maxDuration: 30 }, null, 2))

mkdirSync(out, { recursive: true })
writeFileSync(`${out}/config.json`, JSON.stringify({
  version: 3,
  routes: [
    { src: '^/api(/.*)?$', dest: '/api' },
    { src: '^/health$', dest: '/api' },
    { handle: 'filesystem' },
    { src: '/(.*)', dest: '/index.html' },
  ],
}, null, 2))
console.log(`Built ${out}`)
