// lib/supabase/server.ts

import { createServerClient } from "@supabase/ssr";
import { cookies as nextCookies } from "next/headers";

/* ----------------------------------------------------
   FOR API ROUTE HANDLERS (route.ts)
   nextCookies() is SYNC here — DO NOT await it
---------------------------------------------------- */
export function createRouteHandlerSupabaseClient() {
  const cookieStore = nextCookies(); // ✔ correct

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
}

/* ----------------------------------------------------
   FOR SERVER COMPONENTS (page.tsx)
   nextCookies() is ASYNC here — MUST await
---------------------------------------------------- */
export async function createClient() {
  const cookieStore = await nextCookies(); // ✔ correct

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
}
