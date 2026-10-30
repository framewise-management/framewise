import { Studio } from './studio.ts'

// Vercel calls the exported Express app per request; scripts/build-vercel.mjs bundles this file into the function
export default Studio.fromEnv(process.env).app
