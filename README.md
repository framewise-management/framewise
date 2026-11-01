# Framewise — PERN port

pnpm workspace porting the Framewise studio CRM to Express + React + Postgres (Supabase).

| Folder | What |
|---|---|
| `shared/` | Pure TypeScript business rules (no IO), used by server and client |
| `server/` | Express API (`/health` on port 4000) |
| `client/` | React + Vite app |
| `legacy/` | The original build-less app, kept untouched as the parity reference until cutover |

## Start

```sh
pnpm install
pnpm dev      # server + client
pnpm build    # typecheck all + client build
pnpm test     # package tests + legacy clean-start test
```

## Quote acceptance

Apply `supabase/migrations/20261103000000_quotes.sql` before deploying this version (after the existing migrations).

1. Create an enquiry: it immediately creates a linked tentative client and opens its profile.
2. Add event dates, locations, services, pricing and optional payment-stage targets in the client profile. Add active terms in Settings.
3. Open the client's **Quotes** tab, create a link, preview it and share it manually.
4. The client opens the link without a login, agrees to the quote/terms, and enters **111111**.
5. Acceptance atomically books the client and linked enquiry/events and creates Upcoming projects. The existing calendar reads those confirmed events. No payment is created or required.

**The fixed code works in production for every quote, as requested. It does not verify identity, email or phone, and no message is sent. Anyone with a quote link and this code can accept it.** Replace the server's fixed-code check with genuine verification before relying on it for identity evidence.

Links expire after seven days; generating another replaces a pending link. Quotes snapshot terms, services and prices. Changes to client/event/package details or payment targets after creation require a new quote. Acceptance is retry-safe and records consent, timestamp and `fixed_code` as the method (not an email verification).

Existing unlinked enquiries retain the old confirmed-enquiry conversion route. Enquiry details are the initial lead record; maintain subsequent booking requirements in the linked client profile. Public links use a URL fragment so their token is not sent in page referrers.

## Legacy app

```sh
python -m http.server 4188 --directory legacy/dist
```

Open http://localhost:4188. Data is saved in each browser; use Settings → Export backup to move records.
