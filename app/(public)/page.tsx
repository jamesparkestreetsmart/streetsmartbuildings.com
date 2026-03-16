import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import LandingPageUI from "./LandingPageUI";

export const metadata = {
  title: "Street Smart Buildings | Eagle Eyes Building Solutions LLC",
  description:
    "Street Smart Buildings is the remote monitoring and energy intelligence platform built by Eagle Eyes Building Solutions LLC for QSR and commercial facility operators.",
};

export default async function Page() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          return cookieStore.get(name)?.value;
        }
      }
    }
  );

  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/live");

  return <LandingPageUI />;
}
