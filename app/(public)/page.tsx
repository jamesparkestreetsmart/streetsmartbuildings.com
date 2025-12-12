import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import LoginForm from "./LoginForm";

export default async function Page() {
  const cookieStore = await cookies(); // FIXED

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  const { data } = await supabase.auth.getUser();

  if (data.user) {
    redirect("/live");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-r from-green-700 to-yellow-500 p-10">
      <div className="bg-white p-8 rounded-xl shadow-xl w-[360px]">

        <h1 className="text-2xl font-bold mb-4 text-center">Login</h1>

        <LoginForm />

        <div className="text-center mt-4 text-sm">
          <span className="text-gray-700">New here?</span>{" "}
          <a href="/signup" className="text-green-700 font-semibold hover:underline">
            Create an account
          </a>
        </div>
      </div>
    </div>
  );
}
