import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { StudioOnboarding } from './studio-onboarding.ts'

test('creates the login, the studio and the membership', async () => {
  const { client, log } = fakeSupabase()
  const created = await new StudioOnboarding(client).create({ company: ' Acme Films ', ownerEmail: 'Owner@Acme.com', clientCodePrefix: 'AF-' })
  assert.deepEqual([created.studioId, created.ownerEmail, created.temporaryPassword.length], ['s1', 'owner@acme.com', 16])
  assert.deepEqual(log, [
    'createUser owner@acme.com',
    'insert studios {"company":"Acme Films","client_code_prefix":"AF-"}',
    'insert studio_members {"user_id":"u1","studio_id":"s1"}',
  ])
})

test('a failed step removes what was already created', async () => {
  const member = fakeSupabase('studio_members')
  await assert.rejects(new StudioOnboarding(member.client).create({ company: 'Acme', ownerEmail: 'o@acme.com' }), /link the login/)
  assert.deepEqual(member.log.slice(-2), ['delete studios s1', 'deleteUser u1'])

  const studio = fakeSupabase('studios')
  await assert.rejects(new StudioOnboarding(studio.client).create({ company: 'Acme', ownerEmail: 'o@acme.com' }), /create the studio/)
  assert.deepEqual(studio.log.slice(-1), ['deleteUser u1'])
})

test('bad input creates nothing', async () => {
  for (const input of [{ company: ' ', ownerEmail: 'o@acme.com' }, { company: 'Acme', ownerEmail: 'nope' }, { company: 'Acme', ownerEmail: 'o@acme.com', clientCodePrefix: 'BAD PREFIX' }]) {
    const { client, log } = fakeSupabase()
    await assert.rejects(new StudioOnboarding(client).create(input))
    assert.deepEqual(log, [])
  }
})

test('a signed-in login gets a studio and becomes its member', async () => {
  const { client, log } = fakeSupabase()
  assert.deepEqual(await new StudioOnboarding(client).createForUser('u9', { company: ' Acme ', clientCodePrefix: 'AC-' }), { id: 's1', company: 'Acme' })
  assert.deepEqual(log, [
    'insert studios {"company":"Acme","client_code_prefix":"AC-"}',
    'insert studio_members {"user_id":"u9","studio_id":"s1"}',
  ])
})

test('a login that already has a studio gets a 409 and no extra studio', async () => {
  const { client, log } = fakeSupabase('studio_members', '23505')
  await assert.rejects(new StudioOnboarding(client).createForUser('u9', { company: 'Acme' }), { status: 409, message: 'This login already has a studio' })
  assert.deepEqual(log.slice(-1), ['delete studios s1'])
})

test('bad studio details are a 400 and create nothing', async () => {
  for (const details of [{ company: '' }, { company: 'Acme', clientCodePrefix: 'BAD PREFIX' }, { company: 42 as unknown as string }]) {
    const { client, log } = fakeSupabase()
    await assert.rejects(new StudioOnboarding(client).createForUser('u9', details), { status: 400 })
    assert.deepEqual(log, [])
  }
})

function fakeSupabase(failingTable?: string, code?: string) {
  const log: string[] = []
  const client = {
    auth: {
      admin: {
        createUser: async (a: { email: string }) => { log.push('createUser ' + a.email); return { data: { user: { id: 'u1' } }, error: null } },
        deleteUser: async (id: string) => { log.push('deleteUser ' + id); return { error: null } },
      },
    },
    from: (table: string) => ({
      insert: (row: unknown) => {
        log.push(`insert ${table} ${JSON.stringify(row)}`)
        const result = table === failingTable ? { data: null, error: { message: 'boom', code } } : { data: { id: 's1' }, error: null }
        return Object.assign(Promise.resolve(result), { select: () => ({ single: async () => result }) })
      },
      delete: () => ({ eq: async (_column: string, value: string) => { log.push(`delete ${table} ${value}`); return { error: null } } }),
    }),
  }
  return { client: client as unknown as SupabaseClient, log }
}
