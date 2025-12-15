"use client";

import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

export default function LogoutButton() {
  const router = useRouter();

  // the browser client for client components
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/"); // back to landing page
  }

  return (
    <button
      onClick={handleLogout}
      className="mt-6 w-full text-left px-3 py-2 rounded text-red-600 hover:text-red-700 hover:bg-red-50 font-semibold"
    >
      Log Out
    </button>
  );
}
