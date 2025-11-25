**Repository Overview**
- **Type:** Next.js App Router project (app/ directory)
- **Language:** TypeScript
- **Styling:** Tailwind CSS (v4) + PostCSS
- **Main infra:** Supabase for auth + DB; client + server helpers live in `lib/`

**Big Picture / Architecture**
- **App Router:** All pages live under `app/` using server components by default. Examples: `app/page.tsx`, `app/sites/[siteid]/[equipmentid]/page.tsx`.
- **UI / Domains:** Reusable pieces live in `components/` grouped by feature (e.g. `components/devices`, `components/equipment`, `components/ui`).
- **Data & Auth:** `lib/supabaseClient.ts` is the browser client; `lib/supabase/server.ts` exposes helpers for server components and API route handlers. `lib/auth.ts` contains server-side helper patterns (e.g. `getCurrentUserId`).
- **API routes:** Route handlers use the App Router `route.ts` convention under `app/api/*`. Example: `app/api/gateway-registry/route.ts` shows payload validation and uses `createRouteHandlerSupabaseClient()`.

**Key Integration Patterns (must-follow)**
- **Env loading:** `next.config.ts` explicitly loads `.env.local`. Ensure required env vars are present: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Supabase — client vs server:**
  - Use `lib/supabaseClient.ts` (createClient from `@supabase/supabase-js`) in browser/client components.
  - Use `createServerClient(...)` via `lib/supabase/server.ts` for server components and API routes. Read comments in that file — `nextCookies()` behaves differently in route handlers vs server components (sync vs async). Follow the helper function names: `createRouteHandlerSupabaseClient()` for route handlers and `createClient()` for server components.
- **Cookies & auth:** Server helpers pass cookie getters into Supabase; prefer `createServerClient` in server contexts and `supabase.auth.getUser()` in server helpers (see `lib/auth.ts`). If you write a new server helper, mimic the cookie-getter pattern.

**Developer Workflows / Commands**
- **Run dev:** `npm run dev` (starts Next dev server on :3000 by default)
- **Build / Start:** `npm run build` then `npm run start`
- **Lint:** `npm run lint` (project uses `eslint` + `eslint-config-next`)
- **Environment:** create `.env.local` at repo root. `next.config.ts` logs loaded env entries on startup — check the console for `🔍 Loaded env from .env.local` and the Supabase URL/Key presence message.

**Code Conventions & Patterns (concrete examples)**
- **Server components:** files under `app/**/page.tsx` are server by default. If you need client behavior, add `'use client'` at the top.
- **API route shape:** `export async function POST(req: Request) { ... }` returning `NextResponse.json(...)` (see `app/api/gateway-registry/route.ts`). Validate payloads early and return 4xx on client errors.
- **Dynamic routes:** follows Next App Router bracket syntax — e.g. `app/sites/[siteid]/[equipmentid]/page.tsx`.
- **Component grouping:** keep domain-related components together (e.g., `components/devices`), re-exported or referenced explicitly by the App pages.

**What to look for when changing data/auth flows**
- Prefer server-side Supabase calls when retrieving user info or protected data (use `createServerClient`).
- When adding API routes, use `createRouteHandlerSupabaseClient()` to maintain cookie-based auth consistency.
- Do not assume `nextCookies()` usage is identical across contexts; consult `lib/supabase/server.ts` comments.

**Files to inspect for examples**
- `lib/supabase/server.ts` — cookie handling and server helpers (canonical pattern)
- `lib/supabaseClient.ts` — client-side supabase instantiation
- `lib/auth.ts` — server-only auth helper (`getCurrentUserId`)
- `app/api/gateway-registry/route.ts` — API route example (payload validation + Supabase upsert)
- `next.config.ts` — explicit `.env.local` loading and debug prints
- `package.json` — scripts and dependencies

**Bot-specific guidance / Do's and Don'ts**
- **Do:** Follow existing helper functions rather than inlining cookie handling or re-creating Supabase clients.
- **Do:** Prefer server components for data fetching and keep client components minimal.
- **Do:** Reference the exact helper you need: `createRouteHandlerSupabaseClient()` for `route.ts`, `createClient()` for server components.
- **Don't:** Evict the `NEXT_PUBLIC_` naming convention in this repo — the current code expects the anon/public key to be available to client code.
- **Don't:** Change cookie handling semantics without updating `lib/supabase/server.ts` and the example usages.

**If something is unclear**
- Ask for the intended runtime (server vs client) when adding data fetching.
- Confirm whether a new Supabase interaction should be server-only (private) or visible to the browser (uses the anon key).

Please review this draft and tell me if you want more examples (small snippets), stricter linting rules, or extra guidance about release/deploy steps.
