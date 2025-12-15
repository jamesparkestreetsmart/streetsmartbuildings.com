"use client";

import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function LogoutButton() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/"); // go back to login/landing page
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
