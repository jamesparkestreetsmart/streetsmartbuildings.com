"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Returns the current user's ID (if logged in via Supabase)
 * Works in server components like layout.tsx
 */
export async function getCurrentUserId(): Promise<string | null> {
  const cookieStore = await cookies(); // <-- add "await"

  const supabase = createServerClient(
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
}
