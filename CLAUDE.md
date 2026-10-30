# Framewise: coding rules

Adapted from the BD 4D app rules (`BD-wiki/4DAPP/CLAUDE.md`, 2026-10-24). These rules govern everything under `Framewise/`. The parent `Wedding Tapes/CLAUDE.md` describes a different app (Hono backend, vitest, proposals) and does not apply here.

## Hard rule: ask before coding
Never write, change or delete code, tests or dependencies without first proposing the change and getting an explicit yes from the user. A request like "let's test X" or "can we have Y" means: propose a short plan (files, packages, approach) and wait. Reading files and running existing tests or checks is fine without asking.

## Stack
- TypeScript everywhere, pnpm workspace (`shared`, `server`, `client`), Node 24.
- Server: Express on Node, running `.ts` directly with Node's type stripping (no build step). Database: Postgres on Supabase; auth: Supabase Auth (single studio, a few staff logins).
- Client: React + Vite.
- `shared/` is code used by both client and server, kept once instead of copied, imported with its `.ts` extension. It must run in the browser and in Node: no `node:*` imports, `process`, file system, network calls or secrets.
- Tests: `node:test` + `node:assert/strict`, files `*.test.ts` next to the code. `pnpm test` runs them all. Client tests are for plain logic only (no DOM); they're left out of the client's tsconfig and type-checked by `server/tsconfig.json`, which has Node's types.
- Node strips types without checking them, so run `pnpm typecheck` (server + shared + client) as well as `pnpm test` before calling a change done.

## Server structure
```
server/
  package.json, tsconfig.json, .env, .env.example
  src/
    main.ts            start-up only: builds the objects, starts the server
    http/              ApiServer (Express routes only), HttpError, auth check
    db/                connection and schema
    clients/ payments/ packages/ …   one folder per feature (rules + store)
```
- **One feature, one folder** under `src/`. New work gets its own folder, not a file in an existing one.
- **One class per file**, file named after the class in kebab-case (`PaymentStore` → `payment-store.ts`).
- **Tests sit next to their file** (`payment-store.test.ts`).
- `main.ts` only wires things together and `http/` only handles requests; the logic lives in the feature folders.

## Object-based code (classes)
- Each module is built around exported **classes**. Callers use `new Thing(config)` or `Thing.parse(…)`, not loose exported functions.
- **State lives inside the object** (connections, caches, stores) in private `#fields`, never in module-level `let` variables.
- **Value objects** for IDs and records (e.g. `ClientCode` for `WC-0001`, `Money`): `readonly` fields, a `private constructor` so they can only be built through a validating `static parse(s): T | null` (or `of(…)`), getters for derived values, `toString()` for the canonical text.
- **Stateless rules** with no natural instance go in static methods on a class (e.g. `Pricing.finalQuote`).
- Depend on objects passed in (constructor arguments) so tests can swap them, e.g. `new ApiServer({ payments })`.
- Pure functions that don't belong to one object are allowed only as private helpers (not exported).
- **Exception: React components are function components** (with hooks). Everything that isn't UI, e.g. API calls or PDF rendering, is a class the component uses.

## File layout: exports at the top
Order inside every file:
1. imports
2. exported types and interfaces
3. **exported classes** (inside a class: constructor, public methods and getters, then `#private` members)
4. private (non-exported) helpers and constants

Start-up code lives only in `server/src/main.ts`, never at the bottom of a module.

Private helpers below the exports must be `function` declarations or constants used only at call time. Static field initializers and top-level code run on import and can't read a `const` defined further down.

## TypeScript limits (type stripping / `erasableSyntaxOnly`)
Not allowed: `enum`, `namespace`, constructor parameter properties (`constructor(private x: T)`), `import =`. Use union types, `#private` fields and explicit field assignments instead.

## General
- Business rules (pricing and quotes, payment stages, production stages, delivery items, booking status) live once in `shared/`; never re-implement them in `server/` or `client/`.
- `legacy/` is the original app, kept read-only as the parity reference. Never edit it; check ported behaviour against it.
- Currency (INR) and timezone (Asia/Kolkata) come from one place in `shared/`, never hardcoded at call sites.
- Keep comments minimal: only a non-obvious why.
- Secrets only in `server/.env` (git-ignored); `server/.env.example` lists the keys.
