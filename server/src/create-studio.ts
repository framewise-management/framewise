import { Studio } from './studio.ts'
import { StudioOnboarding } from './studios/studio-onboarding.ts'

// pnpm studio:create "<studio name>" <owner email> [client code prefix]
const [company, ownerEmail, clientCodePrefix] = process.argv.slice(2)
if (!company || !ownerEmail) {
  console.error('Usage: pnpm studio:create "<studio name>" <owner email> [client code prefix]')
  process.exit(1)
}
const created = await new StudioOnboarding(Studio.supabase(process.env)).create({ company, ownerEmail, clientCodePrefix })
console.log(`Created ${company} (${created.studioId})`)
console.log(`Owner login: ${created.ownerEmail}`)
console.log(`Temporary password: ${created.temporaryPassword}`)
console.log('Send the password privately; it is not stored anywhere else.')
