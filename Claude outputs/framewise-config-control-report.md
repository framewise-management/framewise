# Config Control Report — Framewise

Scope: `E:\Work\Wedding Tapes\Framewise` (pnpm workspace: `shared`, `server`, `client`; `legacy/` excluded as read-only parity reference). Read-only analysis; **no files were changed**. Per `CLAUDE.md` ("ask before coding"), everything below is a proposal that needs your yes before any code is touched. Secret values were never read into this report (`.env` keys only).

Method note: I read all of `shared/src`, `server/src/{main,vercel,studio}.ts`, `http/`, `db/database*`, `settings/`, `invoices/`, `client/src/{main,api,ui/format,invoices}`, `scripts/`, the `settings` table and its CHECK constraints in `supabase/migrations/…init.sql`, and grepped the rest of `client/` and `server/` for env reads, URLs, ports, magic numbers, locale and brand strings. I did not run the bundled scanner (the code lives on your machine, not in the cloud workspace), so the sweep over the larger client pages (`client-detail.tsx`, forms) was by grep, not line-by-line reading.

---

## 1. Summary

Framewise is already unusually clean for a config-driven refactor: **one composition root** (`Studio.fromEnv`), **constructor injection everywhere**, a `Database` interface with two implementations, a `TokenVerifier` interface, and a **single-studio settings table already in Postgres** (company, currency, invoice prefix/padding/next number, `invoice_business` JSON, `invoice_templates`). The architecture is the hard part and it is done. What is missing is *declared, validated configuration* on top of it.

The real problems are not scattered env reads (there are only 3 places) but **duplicated sources of truth** and **studio identity baked into code**:

1. The same vocabulary (booking statuses, delivery statuses, payment methods, invoice prefix regex, padding range 3–10) is defined in `shared/` **and** re-stated in SQL CHECK constraints **and** in `payment-settings.ts`. Change one and the others silently disagree.
2. Currency lives in two places: `settings.currency` (DB, default `'INR'`) and `StudioLocale.currency` (code). Only the code one is used for formatting; the DB one is dead weight that looks configurable but is not.
3. Brand and locale are hardcoded: "Framewise" in `shell.tsx` (×3) and `login-page.tsx`; `'en-IN'` in 5 client call sites while `StudioLocale` has no locale field; SQL defaults say `'Wedding Clap'` and client codes use `'WC-'` — a different brand from the app name.
4. Runtime/deploy values are scattered: port `4000` (main.ts, vite proxy), `1mb` JSON limit, Vercel region `bom1` / `maxDuration 30` / `nodejs22.x` (build script) vs "Node 24" in CLAUDE.md, and the `/api` prefix in three places.
5. No feature toggles exist, and env is validated only for presence of two keys.

**Control score: 4 / 10** (centralized loading 1 · typed validation 1 · environment separation 1 · feature toggles 0 · module pluggability 1). **Projected after roadmap: 8 / 10.**

**Assumption (updated):** Framewise is single-studio *today* (CLAUDE.md: "single studio, a few staff logins") but you have confirmed it **will serve more than one studio**. The first version of this report assumed single-studio; **§10 (Multi-studio addendum) supersedes §4, §5.2, §6 and §7 wherever they conflict.** Findings in §3, the server-env work (§5.1), the drift tests (§5.3) and deploy config (§5.4) are unaffected. Do not start the `StudioProfile`/settings work in §5.2 until the tenancy model in §10 is decided, because it changes the shape of those tables.

**Top 5 actions**

1. Make the DB the single owner of studio identity (company, locale, currency, brand name, client-code prefix) and serve it via one `GET /api/studio` — delete the hardcoded copies.
2. Add `ServerConfig.fromEnv()` (typed, validated, one place) and stop reading `process.env` in `main.ts`/`studio.ts`.
3. Generate the SQL CHECK lists and `shared` lists from one source (or add a test that fails when they drift).
4. Pull deploy/runtime knobs (port, JSON limit, region, maxDuration, node target) into one `config` object read by server and `build-vercel.mjs`.
5. Add 2–3 real kill-switches/flags only where there is risk (receipt issuing, dev overlay) — not a flag framework.

---

## 2. Codebase map

| Area | What it is | How config works today |
|---|---|---|
| `shared/` | Pure business rules as static-method classes (`Pricing`, `PaymentStages`, `ProductionStages`, `Booking`, `StudioLists`, `StudioLocale`, `AmountWords`) | Constants are `static readonly` arrays/strings inside classes. No env, no IO (correct per CLAUDE.md) |
| `server/` | Express 5, run directly by Node type-stripping. `Studio.fromEnv` builds 13 services + `ApiServer` | Reads `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (required), `PORT` (default 4000). Same wiring serves local (`main.ts`) and Vercel (`vercel.ts`) |
| `client/` | React 19 + Vite 8. `Session` (Supabase Auth), `ApiClient` (`/api` + bearer token) | `import.meta.env.VITE_SUPABASE_URL / _ANON_KEY` in `main.tsx` only; presence-checked |
| `supabase/` | Migrations, `config.toml`, `settings` singleton table | Business settings + CHECK constraints live in SQL |
| `scripts/` | `build-vercel.mjs`, `deploy.mjs` | Region `bom1`, `maxDuration: 30`, `nodejs22.x`, esbuild `target: node22`, route table — all inline literals |

Entry points: `server/src/main.ts` (local), `server/src/vercel.ts` (function), `client/src/main.tsx`, `scripts/*.mjs`.
Dependency wiring: constructor injection from one root — this is the main asset to build on.

Existing config files: `server/.env`, `client/.env` (+ `.example` each, git-ignored via `.env*`), `supabase/config.toml`, `vercel.json`, `.vercel/project.json`. `.env` keys present: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD`, `PORT` (server); `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (client).

---

## 3. Findings

Bucket key: **S** secret · **E** environment · **T** operational tunable · **F** feature toggle · **M** module behavior · **B** business rule/content · **K** keep in code.

| # | Location | Value / pattern | Bucket | Recommendation |
|---|---|---|---|---|
| 1 | `server/.env` | `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD` | **S** | Correctly git-ignored. `SUPABASE_DB_PASSWORD` is not read by app code and is missing from `.env.example` — document it as "Supabase CLI only" or remove. Service-role key must only exist in Vercel env + local `.env`. |
| 2 | `client/.env` | `VITE_SUPABASE_ANON_KEY` | **E** (public) | Fine in client bundle by design. Keep, but validate format at startup. |
| 3 | `server/src/studio.ts:19-21` | `env.SUPABASE_URL/KEY` presence check only | **E** | Move to `ServerConfig.fromEnv`; validate URL shape, non-empty key; fail with one message listing *all* problems. |
| 4 | `server/src/main.ts:3` | `Number(process.env.PORT) \|\| 4000` | **E** | `ServerConfig.port`; reject non-integer / out of range instead of silently falling back (`PORT=abc` currently becomes 4000). |
| 5 | `client/vite.config.ts` | proxy target `http://localhost:4000` | **E** | Read same port from the server config/`.env` so the two cannot diverge. |
| 6 | `server/src/http/api-server.ts:43` | `express.json({ limit: '1mb' })` | **T** | `ServerConfig.http.jsonLimit`, default `'1mb'`. |
| 7 | `api-server.ts:124`, `client/api/api-client.ts:36`, `scripts/build-vercel.mjs` route `^/api` | `'/api'` prefix in 3 places | **T/K** | One constant (`ApiRoutes.prefix` in `shared/`, no node imports) used by all three. Low value but cheap and removes a real drift risk. |
| 8 | `scripts/build-vercel.mjs` | `regions: ['bom1']`, `maxDuration: 30`, `runtime: 'nodejs22.x'`, esbuild `target: 'node22'` | **E/T** | One `deploy.config.json` (or `DeployConfig` object) read by build + deploy scripts. **Flag:** CLAUDE.md says Node 24; build targets 22 — decide which is true and encode it once. |
| 9 | `server/src/studio.ts:23` | Supabase client options (`persistSession:false`, …) | **K** | Invariant for a server client. Keep. |
| 10 | `shared/src/studio-locale.ts` | `currency='INR'`, `timeZone='Asia/Kolkata'` | **B** (studio identity) | Keep the *class* as the one place (CLAUDE.md rule) but make it constructed from the studio profile; add `locale`. See §4/§5. |
| 11 | `settings.currency` (init.sql:8) + `invoice-service.ts` passes `currency` into receipt snapshot | second currency source | **B** | Duplicate of #10. Pick DB as owner; delete the code constant or stop storing it. |
| 12 | `client/src/ui/format.ts:5,9`, `invoices/invoice-printer.ts:26`, `pages/calendar-page.tsx:13,24,40` | `'en-IN'` ×5, `maximumFractionDigits` 0 vs 2 | **B** | `StudioLocale.locale`; one `Format` class (already half exists in `format.ts`) owns all `Intl` calls. Fraction digits: decide 0 (screen) vs 2 (receipt) deliberately, name them. |
| 13 | `shared/src/amount-words.ts` | Indian numbering, "Indian Rupees … Paise" | **K** | Genuinely INR-specific algorithm. Keep; select by currency only if you ever add a second currency (YAGNI today). |
| 14 | `client/pages/shell.tsx:39,47,56`, `login-page.tsx:13` | "Framewise", "STUDIO WORKSPACE" literal ×4 | **B** | `StudioProfile.appName`/`tagline` from `GET /api/studio`; login page needs a pre-auth public subset (see §5). |
| 15 | `init.sql:7`, `init.sql:23` | `company default 'Wedding Clap'`, client code `'WC-' \|\| lpad(…,4)` | **B** | Brand mismatch with "Framewise" and prefix cannot change without a migration. Add `client_code_prefix`/`client_code_padding` to `settings`; have the default expression read them (via trigger/function) — or accept as a deliberate "WC-" legacy format and document it. Needs your call. |
| 16 | `shared/src/booking.ts`, `init.sql:37,62,131` | booking statuses in TS **and** 3 SQL CHECK lists (`clients`, `enquiries`, `events`) | **M/B** | Highest drift risk. Either (a) generate the CHECKs in a migration from `Booking.*` via a script + a test asserting equality, or (b) keep SQL as truth and have a test that parses constraints and compares to `Booking`. (b) is cheaper and fits "node:test + PGlite" you already run. |
| 17 | `shared/src/delivery-items.ts:35`, `init.sql:104` | delivery statuses TS vs SQL | **B** | Same fix as #16. |
| 18 | `shared/src/studio-lists.ts:8` vs `payment-settings.ts:20` | payment methods: `StudioLists.paymentMethods` = 7 incl. `'Not set'`,`'Other'`; settings `allowed` = 5 | **B** | Local `allowed` array duplicates the list and has already diverged (intentionally? unclear). Derive `allowed` from `StudioLists.paymentMethods` minus a named exclusion set. |
| 19 | `payment-settings.ts:25-26`, `init.sql:12-13` | invoice prefix regex `^[A-Za-z0-9_-]{0,16}$`, padding 3..10 | **T** | Duplicated server/SQL. Move limits into `InvoiceNumbering` in `shared/` (min/max constants); SQL stays as the backstop, plus a test pinning both. |
| 20 | `shared/src/payment-stages.ts:18,38` | core stages `['Booking Amount','On Event','After Event','Delivery','Album Printing']` + legacy alias map | **B** | Stage names are studio vocabulary and already extended per client via stage plans. Core list → `settings.payment_stages` (DB, with the current list as migration default). **Keep alias map in code** (migration aid, not config). |
| 21 | `payment-settings.ts:21` | instalments must sum to 100%, label non-empty | **K** | Business invariant, correct as code. |
| 22 | `shared/src/production-stages.ts:8-10` | 15 default stages + 10 legacy | **B** | `defaults` → studio-editable list (projects already store `stageNames` per project, so the plumbing exists). `legacy` stays in code (frozen history). |
| 23 | `shared/src/studio-lists.ts` | services, lead sources, budgets, expense categories, delivery item presets, event types | **B** | Pure studio content. Best candidates to move into `settings` (DB) so staff edit without a deploy. Phase 5, only if you actually want that. |
| 24 | `invoice-service.ts` | fallbacks `'Photography booking'`, receipt note `'Payment acknowledged. This document does not create a new charge.'` | **B** | Into `settings.invoice_business` (already a JSON bag for payment notes) with these as defaults. |
| 25 | `client/invoices/invoice-printer.ts:30` | ~1.5 KB inline CSS: colours `#20211f`, `#272a27`, max-width 780px, font | **B/K** | Low priority. If branding matters, expose 3–4 tokens (`accent`, `ink`, `paper`, `font`) from the studio profile; leave layout in code. |
| 26 | `api-server.ts:151-154` | Postgres SQLSTATE → HTTP status map | **K** | Protocol invariant. Keep as named constant (it already is). |
| 27 | `client/main.tsx:19` | `import.meta.env.DEV && <Agentation />` | **F** (dev) | Already env-gated. Make it a named dev flag if more dev tools join. |
| 28 | `client/pages/client-detail.tsx:39` | `tel:+` / `https://wa.me/` | **K** | Protocol URLs. Keep. |
| 29 | `server/src/db/*` | `Database` interface: Supabase (prod) / PGlite (tests) | **M** | Already pluggable, but selected by *which file you import*, not by config. Fine for now; see §5 for the one place a selector helps (tests/dev). |
| 30 | `supabase/.temp/*`, `.vercel/*` | project refs, pooler URL, org/project ids | **E** | `.vercel` is ignored; `supabase/.gitignore` is 72 bytes — verify it ignores `.temp/`. `scripts/deploy.mjs` comment notes the parent git root is the *Wedding Tapes* repo: confirm `Framewise/.vercel` cannot be committed via the parent repo. |

Not found (good): no hardcoded secrets in source, no scattered `os.getenv`, no module-level mutable state, no `localhost` in client code besides the dev proxy.

---

## 4. Target config architecture

Layers, lowest → highest precedence:

```
1. Code defaults       static readonly in shared/ and server/config   — app runs with zero config
2. Env vars            server: process.env via ServerConfig.fromEnv ONLY
                       client: import.meta.env via ClientConfig.fromEnv ONLY
3. Studio settings     Postgres `settings` row (singleton)            — studio-owned, edited in the app
4. (none)              no tenant overlay, no remote flag service — single studio
```

Why only three: a YAML base/env/tenant tree would add files, a loader and a merge story to solve problems a single-studio Postgres-backed app does not have. The `settings` row is already your "runtime override layer".

### Ownership split (the core decision)

| Concern | Owner | Hot-reload? |
|---|---|---|
| Supabase URL, keys, port, JSON limit | Env → `ServerConfig` | No (boot) |
| Region, maxDuration, node target | `deploy.config.json` | No (build) |
| Studio name, tagline, locale, currency, timezone, client-code prefix | `settings` row → `StudioProfile` | Yes (re-fetch) |
| Invoice prefix/padding/next number, payment conditions/modes, UPI/bank/GST, receipt note | `settings` row (exists) | Yes |
| Stage names, services, event types, lead sources, expense categories | `settings` row (phase 5, optional) | Yes |
| Status enums, pricing rules, invariants | **Code (`shared/`)**, mirrored by SQL CHECK with a drift test | No |

### Proposed shapes

Server env (validated in one class):

```
SUPABASE_URL                 required, https URL
SUPABASE_SERVICE_ROLE_KEY    required, secret
PORT                         optional int 1–65535, default 4000
HTTP_JSON_LIMIT              optional, default "1mb"
```

Studio settings (DB, served as `GET /api/studio`; one public subset for the login page):

```jsonc
{
  "profile": { "appName": "Framewise", "tagline": "Studio workspace", "company": "…" },
  "locale":  { "currency": "INR", "timeZone": "Asia/Kolkata", "locale": "en-IN" },
  "numbering": { "clientPrefix": "WC-", "clientPadding": 4, "invoicePrefix": "", "invoicePadding": 6 },
  "receipt": { "note": "Payment acknowledged. This document does not create a new charge.", "fallbackBookingName": "Photography booking" },
  "vocabulary": { "paymentStages": ["Booking Amount", "On Event", "After Event", "Delivery", "Album Printing"] }
}
```

`deploy.config.json` (read by `build-vercel.mjs` and, for the port, by `vite.config.ts`):

```json
{ "node": "22", "region": "bom1", "maxDurationSeconds": 30, "apiPrefix": "/api", "devApiPort": 4000 }
```

---

## 5. Module designs

All code below follows CLAUDE.md: classes, `#private` fields, no parameter properties, exports at top, `shared/` free of `node:*`/`process`.

### 5.1 Server env → `ServerConfig` (contract / config / wiring)

**Contract:** the rest of the server depends on a `ServerConfig` object, never on `process.env`.
**Extension point:** a new env var = one field + one parse line; startup reports every problem at once.

Before (`studio.ts` / `main.ts`):

```ts
const url = env.SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
...
const port = Number(process.env.PORT) || 4000          // PORT=abc silently becomes 4000
```

After (`server/src/config/server-config.ts`):

```ts
export class ServerConfig {
  readonly supabaseUrl: string
  readonly serviceRoleKey: string
  readonly port: number
  readonly jsonLimit: string

  private constructor(v: { supabaseUrl: string; serviceRoleKey: string; port: number; jsonLimit: string }) {
    this.supabaseUrl = v.supabaseUrl
    this.serviceRoleKey = v.serviceRoleKey
    this.port = v.port
    this.jsonLimit = v.jsonLimit
  }

  // the only place the server reads process.env
  static fromEnv(env: NodeJS.ProcessEnv): ServerConfig {
    const problems: string[] = []
    const url = env.SUPABASE_URL ?? ''
    if (!/^https:\/\/.+/.test(url)) problems.push('SUPABASE_URL must be an https URL')
    const key = env.SUPABASE_SERVICE_ROLE_KEY ?? ''
    if (!key) problems.push('SUPABASE_SERVICE_ROLE_KEY is required')
    const port = env.PORT === undefined || env.PORT === '' ? 4000 : Number(env.PORT)
    if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push('PORT must be an integer 1–65535')
    if (problems.length) throw new Error('Invalid configuration:\n- ' + problems.join('\n- '))
    return new ServerConfig({ supabaseUrl: url, serviceRoleKey: key, port, jsonLimit: env.HTTP_JSON_LIMIT || '1mb' })
  }
}
```

```ts
// studio.ts
static fromConfig(config: ServerConfig): ApiServer { /* same body, uses config.* */ }
// main.ts
const config = ServerConfig.fromEnv(process.env)
await Studio.fromConfig(config).listen(config.port)
// vercel.ts
export default Studio.fromConfig(ServerConfig.fromEnv(process.env)).app
```

`ApiServer` gets `{ jsonLimit }` through its deps. Test: `server-config.test.ts` (valid env, each missing/invalid key, `PORT=abc` rejected).

### 5.2 Studio identity → `StudioProfile` (replaces hardcoded brand/locale)

**Contract (`shared/src/studio-profile.ts`):** immutable value object parsed from the settings payload, with today's values as defaults so nothing changes on day one.

```ts
export interface StudioProfileData {
  appName: string; tagline: string; company: string
  currency: string; timeZone: string; locale: string
}

export class StudioProfile {
  static readonly defaults: StudioProfileData = {
    appName: 'Framewise', tagline: 'Studio workspace', company: 'Framewise',
    currency: 'INR', timeZone: 'Asia/Kolkata', locale: 'en-IN',
  }
  readonly data: StudioProfileData
  private constructor(data: StudioProfileData) { this.data = data }
  static parse(raw: Partial<StudioProfileData> | null | undefined): StudioProfile {
    return new StudioProfile({ ...StudioProfile.defaults, ...raw })
  }
  money(value: number, digits = 0): string {
    return new Intl.NumberFormat(this.data.locale, { style: 'currency', currency: this.data.currency, maximumFractionDigits: digits }).format(value || 0)
  }
  today(now: Date = new Date()): string {
    return now.toLocaleDateString('en-CA', { timeZone: this.data.timeZone })
  }
}
```

`StudioLocale` stays as a thin facade over `StudioProfile.defaults` during migration so `studio-locale.test.ts` and existing callers keep working, then is removed.

**Wiring:** server `StudioSettings` reads the `settings` row → `GET /api/studio` (authed) and `GET /api/studio/public` (appName, tagline only — the login page renders before sign-in). Client `StudioProvider` fetches once; `shell.tsx`/`login-page.tsx`/`format.ts`/`calendar-page.tsx`/`invoice-printer.ts` take the profile instead of literals.

Before → after (`shell.tsx:39`):

```tsx
<span><strong>Framewise</strong><small>STUDIO WORKSPACE</small></span>
// →
<span><strong>{profile.data.appName}</strong><small>{profile.data.tagline.toUpperCase()}</small></span>
```

Before → after (`ui/format.ts:5`):

```ts
return new Intl.NumberFormat('en-IN', { style: 'currency', currency: StudioLocale.currency, maximumFractionDigits: 0 }).format(value || 0)
// →
return profile.money(value)
```

Resolves findings 10–12, 14, and finding 11 (delete the second currency source; `settings.currency` becomes the owner).

### 5.3 Vocabulary drift guard (statuses, payment methods, invoice limits)

**Contract:** `shared/` classes remain the single definition; SQL is the DB-level backstop; a test proves they agree.

```ts
// server/src/db/vocabulary.test.ts  (uses the PGlite setup already in schema.test.ts)
test('booking statuses in SQL match Booking', async () => {
  const sql = await db.query(`select pg_get_constraintdef(oid) d from pg_constraint where conrelid = 'clients'::regclass and conname like '%status%'`)
  const inSql = [...sql.rows[0].d.matchAll(/'([^']+)'/g)].map(m => m[1]).sort()
  assert.deepEqual(inSql, [...Booking.clientStatuses].sort())
})
```

Same test shape for `enquiries`/`events`, delivery statuses, and invoice prefix/padding limits (`InvoiceNumbering.minPadding/maxPadding` in `shared/`, used by `payment-settings.ts`). This costs no runtime change and turns the largest drift risk into a failing test. And in `payment-settings.ts`, replace the local `allowed = [...]` with `StudioLists.paymentMethods.filter(m => !PaymentMethods.notSelectable.includes(m))`.

### 5.4 Deploy config

`scripts/build-vercel.mjs` currently inlines `bom1`, `30`, `nodejs22.x`, `node22`. Read `deploy.config.json` once at the top and interpolate; `vite.config.ts` reads `devApiPort` from the same file. Pure `.mjs`, no new dependency. Decide Node 22 vs 24 first (finding 8).

### 5.5 Module pluggability — what *not* to build

`Database` (Supabase/PGlite) and `TokenVerifier` are already clean seams selected by composition. A registry/factory driven by a `database.provider` config key would add indirection with exactly two fixed implementations, one of which is test-only. **Don't.** The one config-style selector worth having later is `ServerConfig.auth: 'supabase' | 'static-token'` for local demos/tests — only if you find yourself writing it by hand again.

---

## 6. Feature flag plan

Single studio, few staff, one deploy target: a flag service is overkill. Recommendation is **three explicit, owned switches**, stored in `settings.features` (jsonb, default `{}`), read through one `Features` class:

| Flag | Type | Owner | Default | Why / removal criteria |
|---|---|---|---|---|
| `receipts.issue` | kill switch (ops) | you | `true` | Receipt issuing writes immutable snapshots and consumes invoice numbers (see migration `invoice_number_update_where`). A kill switch lets you stop it without a deploy if numbering misbehaves. Keep permanently. |
| `dev.agentation` | dev | you | `DEV` build only | Already `import.meta.env.DEV`-gated; name it so more dev tools can join. Keep. |
| `catalog.editable` | release | you | `false` → `true` | Gate for phase 5 (studio-editable stage/service lists). **Remove the flag** once the lists are DB-backed and verified; then the code path is the only path. |

Rule: any release flag gets an owner and a removal date in the code comment next to `Features.has()`; no flag survives its rollout.

---

## 7. Refactor roadmap

Every phase is shippable alone and, until phase 5, changes no user-visible behavior. Verify each with `pnpm typecheck && pnpm test`.

| Step | Work | Files | Effort | Risk | Verify no behavior change |
|---|---|---|---|---|---|
| 1 | `ServerConfig` + `server-config.test.ts`; `Studio.fromConfig`; `main.ts`/`vercel.ts` use it; `.env.example` gets `HTTP_JSON_LIMIT` and a note on `SUPABASE_DB_PASSWORD` | `server/src/config/*`, `studio.ts`, `main.ts`, `vercel.ts`, `api-server.ts`, `.env.example` | S | Low | Same defaults; `api-server.test.ts` unchanged; one new test file. Note the one intentional change: invalid `PORT` now fails loudly. |
| 2 | Vocabulary drift tests + `InvoiceNumbering` constants + derive `allowed` payment methods | `server/src/db/vocabulary.test.ts`, `shared/src/invoice-numbering.ts`, `payment-settings.ts` | S–M | Low | Tests pass against current schema = proves current state is consistent. If one fails, you found a real existing divergence (finding 18 likely) — decide intent before fixing. |
| 3 | `deploy.config.json`; `build-vercel.mjs` and `vite.config.ts` read it; resolve Node 22 vs 24 | `scripts/*`, `client/vite.config.ts`, `vercel.json` (check) | S | Low–Med | `pnpm build:vercel`, diff `.vercel/output/config.json` and `.vc-config.json` before/after — must be byte-identical (unless Node version is intentionally changed). |
| 4 | `StudioProfile` in `shared/` with current values as defaults; `StudioLocale` becomes a facade; `Format` class takes profile; replace the 5 `'en-IN'` sites | `shared/src/studio-profile.ts(+test)`, `client/src/ui/format.ts`, `calendar-page.tsx`, `invoice-printer.ts` | M | Low | Defaults identical → rendered output identical; add a snapshot-style test of `money()`/dates for `en-IN`/`INR`. |
| 5 | `StudioSettings` server class + `GET /api/studio` (+ `/public`); client `StudioProvider` consumes it; brand literals in `shell.tsx`/`login-page.tsx` replaced; migration adds `settings` columns (`app_name`, `tagline`, `locale`, `client_code_*`) with today's values as defaults | migration, `server/src/settings/*`, `api-server.ts`, `client/src/data/*`, `shell.tsx`, `login-page.tsx` | M–L | Med | PGlite schema test for new columns; manual check that login page renders before auth; decide finding 15 (`WC-` vs Framewise) first. |
| 6 | `Features` class + `receipts.issue` kill switch | `server/src/features/*`, `invoice-service.ts`, `api-server.ts` | S | Low | Default `true` ⇒ identical behavior; test the `false` path returns a clear 503/400. |
| 7 | (Optional) Move payment stages / production stages / `StudioLists` to `settings` with current lists as migration defaults, behind `catalog.editable` | migrations, `shared/*`, services, client forms | L | Med–High | Existing `*.test.ts` for stages/lists pass with defaults; backfill test for legacy projects (`ProductionStages.legacy` stays in code). Do only if staff genuinely need to edit these. |
| 8 | Harden: generate a `docs/config.md` from `ServerConfig`/`StudioProfile` field lists; CI check that `.env.example` keys == `ServerConfig` keys; confirm `supabase/.temp` and `.vercel` ignored at the **parent** git root too | CI, docs | S | Low | CI green. |

Suggested order if you only do some: **1 → 2 → 4 → 5**. Steps 1, 2 and 6 are small enough to ship in an afternoon each.

---

## 8. What stays in code — and why

| Item | Reason |
|---|---|
| `Pricing.finalQuote/quote/balance` and the three pricing models | Core business logic with tests; config would let someone break invoices. |
| Instalments-sum-to-100 rule, discount ≤ price | Invariants, also enforced by SQL CHECK. |
| `PaymentStages` alias map (`'on-event'` → `'On Event'`) and `ProductionStages.legacy` | Migration shims for historic data; frozen. |
| `AmountWords` (lakh/crore) | Algorithm, not setting. |
| SQLSTATE → HTTP status map | Protocol contract. |
| Supabase server-client options (`persistSession:false`, …) | Server invariant. |
| `Body.pick` allow-lists, `ClientService.editable` etc. | Security allow-lists; making them config weakens the boundary. |
| Status enums (`Booking.*`, `DeliveryItems.statuses`) | Drive logic branches (`closed`, `won`); changing them is a code change. Mirror in SQL + drift test, don't externalize. |
| `tel:` / `wa.me` URLs, `Authorization: Bearer` regex | Protocol constants. |
| Invoice layout CSS (spacing, structure) | Only colour/font tokens are branding; layout is design code. |

---

## 9. Risks & guardrails

- **Single source of truth discipline.** The biggest risk after this work is reintroducing duplicates. The drift tests (step 2) and the `.env.example` ↔ `ServerConfig` check (step 8) are the guardrails; keep them in `pnpm test`.
- **Settings are runtime data, not code.** Anything moved to the `settings` row can be edited by staff: validate server-side (as `PaymentSettings.update` already does), keep audit via `updated_at`, and never let a settings edit change historical receipts (receipts already store a `snapshot` — keep that).
- **Pre-auth surface.** The login page needs the studio name before sign-in; expose only the minimal `/api/studio/public` subset. Never put `invoice_business` (UPI, bank, GST) on an unauthenticated route.
- **Secrets.** Service-role key stays server-only; `.env*` is ignored. Because `deploy.mjs` notes the git root is the parent *Wedding Tapes* repo, confirm that parent's `.gitignore` also covers `Framewise/server/.env`, `Framewise/.vercel` and `Framewise/supabase/.temp`. Rotate the DB password/service key if any of those were ever committed (check `git log -p -- '*.env'`).
- **Currency change is not a config toggle.** Even with `currency` and `locale` in settings, `AmountWords.inr` and "Indian Rupees" are INR-only; treat non-INR as a code feature, not a setting.
- **Flag debt.** Three flags only, each with an owner and removal note; no flag framework.
- **Process.** Per `CLAUDE.md`, none of the above will be implemented without your explicit yes on a specific step.

---

## 10. Multi-studio addendum (supersedes single-studio assumptions)

Answer received: **yes, more than one studio.** This is the biggest architectural fork in the report, and the config work is the smaller part of it. The code is currently *structurally single-tenant*, so config alone cannot make it multi-studio.

### 10.1 What is single-tenant today (evidence)

| Where | Single-tenant assumption | Consequence |
|---|---|---|
| `settings` (`id boolean primary key default true check (id)`) | Exactly one row, enforced by the schema | Becomes a `studios` table; every `select('settings')` returns `[settings]` of "the" row |
| `PaymentSettings`, `InvoiceService` | `const [settings] = await db.select('settings')` | Must resolve the caller's studio first |
| `clients.code default 'WC-' \|\| lpad(nextval('client_code_seq'))` | One global sequence, one hardcoded prefix | Studios would share numbering and the `WC-` prefix |
| `settings.next_invoice` | One counter | Needs one counter per studio, incremented under a row lock |
| `Studio.fromEnv` → `SupabaseDatabase` with the **service-role key** | Service role **bypasses RLS** | Even if you add `studio_id` + RLS policies, the API would ignore them. Isolation must be enforced in server code |
| `TokenVerifier.verify` returns only a user id | No notion of which studio the user belongs to | Need membership lookup |
| `StudioLocale` / `StudioLists` / `ProductionStages.defaults` / `PaymentStages.core` | `static readonly` per-process constants | A static cannot differ per request; these must become per-studio values (instances) |
| Every table (`clients`, `events`, `payments`, …) | No `studio_id` column | Data of studio A and B would be mixed |
| `apply_changes` RPC (`SupabaseDatabase.apply`) | Takes raw `{table,row,match}` changes | Must stamp/verify `studio_id` for every change |

### 10.2 Decision needed first: tenancy model

| Option | How | Pros | Cons | Fit |
|---|---|---|---|---|
| **A. Shared schema, `studio_id` on every row** (recommended) | One Supabase project; `studios`, `studio_members`; `studio_id` column + index on all tables; server enforces scope | One deploy, one migration path, cheap to add studio #3, config lives in one `studios` row | Isolation is only as good as your scoping code; one bug leaks data | Best for "a handful to dozens of small studios" |
| **B. Project/DB per studio** | One Supabase project (or schema) per studio; server picks connection by host | Hard isolation, per-studio backup/restore, trivial data export | N deploys/migrations to keep in sync, secrets per studio, much more ops | Only if studios demand hard isolation or data residency |
| C. Hybrid | Shared app, shared schema, but *enterprise* studios on their own project | Flexible | Two code paths | Premature |

Everything below assumes **Option A**. If you pick B, the config hierarchy is the same but "tenant layer" becomes a per-studio connection record instead of a row.

### 10.3 Revised config hierarchy (now with a tenant layer)

```
1. Platform defaults     code: StudioProfile.defaults, Features.defaults, vocabulary defaults
2. Platform env          ServerConfig.fromEnv (Supabase URL/keys, port, limits) — same for every studio
3. Plan / edition        optional, later: which features a studio's plan unlocks
4. Studio config         `studios` row + child rows — per studio, edited in-app by that studio's owner
5. Request context       resolved studio (from host or membership) — immutable per request
```

Precedence is still lowest → highest; layers 4–5 are what make it multi-studio. Env stays platform-wide: **never put a per-studio value in env.**

### 10.4 Schema shape (replaces the singleton `settings`)

```sql
create table studios (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),   -- subdomain / URL key
  company text not null,
  app_name text not null, tagline text not null default '',
  currency text not null default 'INR', time_zone text not null default 'Asia/Kolkata', locale text not null default 'en-IN',
  client_code_prefix text not null default '', client_code_padding int not null default 4 check (client_code_padding between 3 and 10),
  client_code_next int not null default 1,
  invoice_prefix text not null default '' check (invoice_prefix ~ '^[A-Za-z0-9_-]{0,16}$'),
  invoice_padding int not null default 6 check (invoice_padding between 3 and 10),
  next_invoice int not null default 1 check (next_invoice >= 1),
  invoice_business jsonb not null default '{}',     -- UPI, bank, GST, notes (exists today)
  features jsonb not null default '{}',             -- per-studio flags, validated by Features class
  vocabulary jsonb not null default '{}',           -- stage names, services, event types (phase 7)
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table studio_members (
  studio_id uuid not null references studios(id) on delete cascade,
  user_id uuid not null,                            -- auth.users.id
  role text not null check (role in ('owner','staff')),
  primary key (studio_id, user_id)
);
-- every existing table gains: studio_id uuid not null references studios(id), plus an index on (studio_id, …)
```

The existing studio is migrated as **studio #1** (`slug` of your choice; `next_invoice`, prefix/padding copied from the current `settings` row; `WC-` becomes its `client_code_prefix`, which also resolves finding 15 — the prefix stops being a brand problem and becomes that studio's data). Client codes: replace the global `client_code_seq` default with a function that increments `studios.client_code_next` under `for update`, mirroring how invoice numbers must work.

### 10.5 Server design (contract / wiring)

**Contract:** services never see "the" studio. They receive a `StudioContext` per request, and `Database` access is scoped by it.

```ts
// server/src/studios/studio-context.ts
export class StudioContext {
  readonly id: string
  readonly profile: StudioProfile          // from shared/, per studio
  readonly features: Features
  readonly userId: string
  readonly role: 'owner' | 'staff'
  private constructor(...) { ... }          // built only by StudioResolver
}

// server/src/db/scoped-database.ts — the isolation boundary
export class ScopedDatabase implements Database {
  readonly #inner: Database
  readonly #studioId: string
  constructor(inner: Database, studioId: string) { this.#inner = inner; this.#studioId = studioId }
  select<T extends object = Row>(table: string, match: Row = {}) {
    return this.#inner.select<T>(table, { ...match, studio_id: this.#studioId })      // caller cannot override
  }
  apply(changes: readonly Change[]) {
    return this.#inner.apply(changes.map(c => this.#scope(c)))                          // stamp insert rows, force match on update/delete
  }
  #scope(c: Change): Change { /* insert: { ...row, studio_id }, update/delete: match: { ...match, studio_id } */ }
}
```

**Wiring change:** today `Studio.fromEnv` builds services **once** at boot with one `db`. Multi-studio needs a service set **per request** (or a cached set per studio):

```ts
// requireUser middleware (replaces the userId-only verifier)
const userId = await auth.verify(token)                          // as today
const studio = await resolver.resolve(userId, req.headers.host)  // membership + host/slug check, cached briefly
req.studio = studio                                              // typed via Express augmentation
// handlers: const { clients } = services.for(req.studio)        // services.for() builds/caches `new ClientService(new ScopedDatabase(db, studio.id), …)`
```

This keeps CLAUDE.md's style (constructor injection, no module state): `ServiceSet.for(studio)` is a class holding a private `Map` cache. The service classes themselves barely change — they already depend on a `Database` interface, so passing a `ScopedDatabase` is transparent. **That is the payoff of the existing architecture.**

Security notes that matter more than any config key:
- The service-role client bypasses RLS, so **`ScopedDatabase` is the only thing separating studios**. Add RLS policies anyway (defense in depth, protects any future direct-client access) and a **cross-studio test suite**: create studios A and B in PGlite, assert A can never read/update/delete B's rows through every service.
- `apply_changes` RPC must reject any change whose `studio_id` differs from a passed `studio_id` argument (change the signature to `apply_changes(studio uuid, changes jsonb)` and enforce server-side in SQL, not just in TypeScript).
- Role checks: settings and team endpoints should require `owner`; `staff` is read/write on operational data only.

### 10.6 Client / branding resolution

- Studio resolved **before login** from the host (`acme.framewise.app` → slug `acme`) or a path/query fallback for early stages; `GET /api/studio/public?slug=…` returns only `appName`, `tagline`, accent tokens, logo URL. Unknown slug → generic "Framewise" page.
- After login, `GET /api/studio` returns the full profile for the member's studio; `StudioProvider` holds it; `profile.money()`, date formatting and brand strings come from it (§5.2 code stands, now fed per studio).
- Theme tokens (`accent`, `ink`, `paper`, `font`) become worth exposing now (finding 25) — they are the cheap part of white-labelling. Logo: Supabase Storage path in `studios`, not bytes in code (`legacy/` embeds `logo.png` in JS — do not port that pattern).

### 10.7 Per-studio vocabulary and flags

- `StudioLists`, `PaymentStages.core`, `ProductionStages.defaults` turn from "phase 7, optional" into **required**: studios will want different services, event types and stages. Store in `studios.vocabulary` with the current lists as platform defaults; a `Vocabulary` class merges defaults + overrides and is passed where the statics are used today (`Vocabulary.of(studio)`). `ProductionStages.legacy`, the stage alias map, and all status enums (`Booking.*`, `DeliveryItems.statuses`) **stay in code and global** — they drive logic and SQL CHECKs; letting studios redefine them would break rules and the drift tests.
- Flags: `Features` reads platform defaults, then the studio's `features` jsonb, validated against a known key list (unknown keys rejected, so typos can't silently do nothing). Add **plan gating** only when you have plans; until then a flag is just on/off per studio. Platform-wide kill switch (`receipts.issue`) now lives in platform env/defaults and *also* per-studio.

### 10.8 Revised roadmap order

| Step | Change vs. §7 |
|---|---|
| 1 `ServerConfig` | unchanged (platform env only) |
| 2 Drift tests | unchanged |
| 3 `deploy.config.json` | unchanged |
| **3.5 Decide tenancy model (A/B)** | **new, blocking** — answer §10.2 |
| **4 Tenant foundation** | **new:** migration adding `studios`, `studio_members`, `studio_id` on every table, backfill existing data into studio #1, `apply_changes(studio, …)`, per-studio counters. **Effort L, risk High** — run on a Supabase branch/copy first; verify row counts and invoice/client numbering continue exactly where they were. |
| **5 Isolation layer** | **new:** `StudioResolver`, `ScopedDatabase`, per-request `ServiceSet`, role checks, RLS policies, **cross-studio isolation tests**. **L, High** — nothing ships until the isolation tests pass. |
| 6 `StudioProfile` + `GET /api/studio` (+`/public`) | was §7 step 4–5; now reads the per-studio row and host/slug resolution |
| 7 `Features` per studio | was step 6; adds per-studio flags |
| 8 `Vocabulary` per studio | was optional step 7; now **required** for any studio whose lists differ |
| 9 Studio onboarding (create studio, invite owner) + hardening/docs/CI | new + old step 8 |

Behavior-preservation rule still holds through step 5: with only studio #1 present, every response must be identical to today's. That is the verification — run the existing test suite plus a before/after comparison of API responses for a seeded studio.

### 10.9 Updated risks

- **Cross-tenant data leak** is now the #1 risk (service role + app-level scoping). Mitigations: single enforcement point (`ScopedDatabase`), SQL-level `studio_id` check in `apply_changes`, RLS as backstop, mandatory isolation tests in CI.
- **Migration of live data**: adding a NOT NULL `studio_id` to every table on a database with production data — do it in 3 steps (add nullable → backfill → set NOT NULL), on a branch first, with a rollback plan.
- **Numbering races**: per-studio client and invoice counters must be incremented atomically (`update … returning` / `for update`), never read-then-write in app code.
- **Config sprawl**: resist per-studio knobs "because we can". Each new studio-level key needs an owner-facing reason; business-logic rules stay global.
- **Static → instance migration**: any remaining `StudioLocale.currency`/`StudioLists.*` use after step 6/8 is a latent bug for studio #2. Add a lint-style test that greps `shared/`, `server/`, `client/` for the old statics once migrated.

### 10.10 Updated control score projection

Today 4/10. After the multi-studio roadmap: centralized loading 2 · typed validation 2 · environment separation 2 · feature toggles 1 (per-studio flags, no remote service) · module pluggability 1 (still two fixed implementations, by design) = **8/10**. A 9–10 would need a remote flag service and plan-based entitlements, which is not justified until you have paying studios on different plans.

---

## 11. Decisions recorded (latest answers)

| Question | Decision | Effect on the plan |
|---|---|---|
| Tenancy model | **One shared database, `studio_id` on every row. Keep it simple.** | Option A of §10.2 is final. Options B/C are dropped. No per-studio connections, no per-studio deploys. "Simple" is applied as: one `ScopedDatabase` enforcement point, one `studios` table, no extra infrastructure. |
| Plans / pricing tiers | **Yes, studios will have different plans.** | Add the plan layer (§10.3 layer 3) — but the simple version, see §11.1. |
| Keep `WC-` numbering for the current studio | **No `WC-` numbering.** | `WC-` is not carried into the new model. `client_code_prefix` default is empty and each studio sets its own. See §11.2 for what this means for existing client codes — one assumption to confirm. |

### 11.1 Plans, the simple way

Do not build billing or an entitlements service. A plan is just **a named bundle of limits and feature switches defined in code**, and each studio row points at one:

```ts
// shared/src/plan.ts  (pure, no IO — fine for shared/)
export type PlanName = 'free' | 'pro' | 'studio'      // names are placeholders: you decide

export class Plan {
  static readonly all: Readonly<Record<PlanName, PlanData>> = {
    free:   { maxClients: 25,  maxStaff: 2,  features: ['receipts'] },
    pro:    { maxClients: 500, maxStaff: 10, features: ['receipts', 'customVocabulary', 'branding'] },
    studio: { maxClients: null, maxStaff: null, features: ['receipts', 'customVocabulary', 'branding', 'multiUserRoles'] },
  }
  readonly name: PlanName
  private constructor(name: PlanName) { this.name = name }
  static parse(value: string | null | undefined): Plan { /* unknown → 'free', never throws */ }
  allows(feature: string): boolean { /* in Plan.all[this.name].features */ }
  limit(key: 'maxClients' | 'maxStaff'): number | null { /* … */ }
}
```

- `studios.plan text not null default 'free' check (plan in ('free','pro','studio'))` — one column. (Add the same CHECK-vs-`Plan.all` drift test as the other enums.)
- Effective feature = **plan allows it AND the studio's `features` jsonb has not switched it off**. Plan is the ceiling, studio flag is the dial, platform kill switch overrides both.
- Limits are enforced in the **service layer** where rows are created (e.g. `ClientService.create` checks `plan.limit('maxClients')` against a count) and return a user-readable 403/409 ("Your plan allows 25 clients"). Never enforce plan limits only in the UI.
- Changing a studio's plan = an update to that one column (by you, manually, at first). No payment integration until you actually charge. The numbers/names above are placeholders; they are the single thing to tune per plan and live in one file.
- Why in code, not DB: plan definitions drive logic and change with releases; only the studio→plan assignment is data. If you later want to edit plans without a deploy, move `Plan.all` to a `plans` table — the `Plan` class interface does not change.

Final hierarchy (replaces §10.3):

```
1. Platform defaults   code (StudioProfile.defaults, Vocabulary defaults, Features defaults)
2. Platform env        ServerConfig.fromEnv — same for all studios, never per-studio values
3. Plan                Plan.all[studio.plan] — ceiling of limits + features
4. Studio config       `studios` row (+ jsonb features/vocabulary) — edited by that studio's owner
5. Request context     resolved studio, immutable per request
```

### 11.2 Numbering without `WC-`

- New model: every studio has `client_code_prefix` (default `''`) and `client_code_padding`, with a **per-studio atomic counter** (`studios.client_code_next`, incremented under `for update` — never read-then-write in app code). Studio #1 starts with an empty prefix, so new codes look like `0001`, not `WC-0001`.
- **Assumption to confirm:** existing clients already have stored codes like `WC-0001..WC-nnnn`. I assume those are **left as they are** (they are stored text, not regenerated), and only *new* clients use the new scheme, with the counter starting after the highest existing number so nothing collides. If you want the old `WC-` codes **rewritten** (e.g. `WC-0042` → `0042`), that is a data migration touching anything that displays or searches by code (UI, invoices already issued) — a deliberate, separate step, and issued receipts hold snapshots that should *not* change. Tell me which you want.
- Invoice numbering: unchanged in behavior for studio #1 — copy its current `invoice_prefix`, `invoice_padding` and `next_invoice` into its `studios` row so the sequence continues exactly where it is. Other studios get their own sequence.
- Finding 15 is now resolved: the `WC-` literal and the `'Wedding Clap'` default are removed from the schema; neither is hardcoded for anyone.

### 11.3 What changes in the roadmap (§10.8)

- Step 3.5 (decide tenancy) is **done**: shared DB, `studio_id`.
- Step 4 (tenant foundation) gains: `studios.plan` column and the `client_code_*` columns/atomic counter; no `WC-` default. Backfill studio #1 from the current `settings` row.
- Step 5 (isolation layer) is unchanged and remains the gate: nothing else ships until the cross-studio isolation tests pass.
- New small step after 6: `Plan` class + plan CHECK drift test + limit checks in the create paths of `ClientService` and `TeamService` (clients and staff are the two limits above).
- Step 7 (`Features`) now computes *plan ceiling ∩ studio dial ∩ platform kill switch*.
- Control score projection is unchanged at **8/10** (plans add to "feature toggles": 1 → 2, so the projected total is now **9/10** if the plan ceiling and per-studio flags both land).

## 12. Questions still open

1. **Login/identification:** does each studio get its own subdomain (`acme.framewise.app`), or is there one shared URL and the studio comes from the user's membership? (Decides whether pre-login branding on the login page is possible.)
2. **Multiple memberships:** can one person belong to several studios (freelance editor)? If yes, add a studio switcher; the token alone can't choose the studio.
3. **Existing `WC-` codes:** keep as stored text (my assumption, §11.2) or rewrite them?
4. **Plan names and limits:** what are the real tiers and what do they cap/unlock? (Placeholders above.)
5. **Node 22 or 24** for the deployed function? (Finding 8.)
