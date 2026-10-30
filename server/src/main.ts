import { Studio } from './studio.ts'

const port = Number(process.env.PORT) || 4000
await Studio.fromEnv(process.env).listen(port)
console.log(`Framewise API on http://localhost:${port}`)
